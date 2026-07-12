"""Tests for the daily snapshot job and price-history / portfolio-history endpoints."""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import func, select

from app.core import security
from app.core.config import settings
from app.ingest.snapshot_prices import _snapshot_statement, snapshot_portfolio_values
from app.models.card import Card, Set
from app.models.collection import CollectionEntry
from app.models.portfolio import PortfolioValueDaily
from app.models.price import CardPriceCurrent, PriceHistory
from app.models.user import User
from app.services.portfolio import compute_portfolio_values_usd

_ISSUER = "https://test.supabase.co/auth/v1"
_COLL = f"{settings.API_V1_PREFIX}/collection"
_CARDS = f"{settings.API_V1_PREFIX}/cards"

_D1 = dt.date(2026, 6, 1)
_D2 = dt.date(2026, 6, 2)
_D3 = dt.date(2026, 6, 3)


@pytest.fixture
def signing_key(monkeypatch):
    priv = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(security.settings, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(
        security,
        "_jwk_client",
        SimpleNamespace(get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=priv.public_key())),
    )
    return priv


def _headers(priv, sub: uuid.UUID) -> dict[str, str]:
    now = dt.datetime.now(dt.UTC)
    token = jwt.encode(
        {
            "sub": str(sub),
            "email": f"{sub}@pokevault.dev",
            "role": "authenticated",
            "aud": "authenticated",
            "iss": _ISSUER,
            "iat": now,
            "exp": now + dt.timedelta(hours=1),
        },
        priv,
        algorithm="ES256",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def cards(db_session):
    """A set and two cards (no prices yet)."""
    db_session.add(Set(id="tst1", name="Test Set", printed_total=4, total=4))
    db_session.add(Card(id="tst1-1", set_id="tst1", name="Pikachu", number="1"))
    db_session.add(Card(id="tst1-2", set_id="tst1", name="Raichu", number="2"))
    await db_session.flush()


def _ph(card_id, variant, day, price) -> PriceHistory:
    return PriceHistory(
        card_id=card_id,
        source="tcgplayer",
        variant=variant,
        market_price=Decimal(price),
        currency="USD",
        snapshot_date=day,
    )


@pytest.fixture
async def history_rows(db_session, cards):
    """price_history across three days for two variants of one card + a second card."""
    db_session.add_all(
        [
            _ph("tst1-1", "normal", _D1, "1.00"),
            _ph("tst1-1", "normal", _D2, "2.00"),
            _ph("tst1-1", "normal", _D3, "3.00"),
            _ph("tst1-1", "holofoil", _D1, "10.00"),
            _ph("tst1-1", "holofoil", _D2, "11.00"),
            _ph("tst1-1", "holofoil", _D3, "12.00"),
            _ph("tst1-2", "normal", _D1, "5.00"),
            _ph("tst1-2", "normal", _D2, "5.00"),
            _ph("tst1-2", "normal", _D3, "5.00"),
        ]
    )
    await db_session.flush()


async def test_snapshot_job_owned_only_and_idempotent(db_session, cards):
    # tst1-1 is OWNED (in a collection); tst1-2 is priced but NOT owned.
    uid = uuid.uuid4()
    db_session.add(User(id=uid, email="owner@pokevault.dev"))
    await db_session.flush()
    db_session.add(CollectionEntry(user_id=uid, card_id="tst1-1", quantity=1))
    db_session.add_all(
        [
            CardPriceCurrent(
                card_id="tst1-1",
                source="tcgplayer",
                variant="normal",
                market=Decimal("1.00"),
                currency="USD",
            ),
            CardPriceCurrent(
                card_id="tst1-1",
                source="tcgplayer",
                variant="holofoil",
                market=Decimal("10.00"),
                currency="USD",
            ),
            # Null market must be excluded even for an owned card.
            CardPriceCurrent(
                card_id="tst1-1",
                source="tcgplayer",
                variant="reverseHolofoil",
                market=None,
                currency="USD",
            ),
            # tst1-2 is priced but un-owned → must NOT be snapshotted (owned-only).
            CardPriceCurrent(
                card_id="tst1-2",
                source="tcgplayer",
                variant="normal",
                market=Decimal("5.00"),
                currency="USD",
            ),
        ]
    )
    await db_session.flush()

    async def _today_count(card_id: str) -> int:
        return await db_session.scalar(
            select(func.count())
            .select_from(PriceHistory)
            .where(
                PriceHistory.snapshot_date == func.current_date(),
                PriceHistory.card_id == card_id,
            )
        )

    await db_session.execute(_snapshot_statement())
    # Owned card: 2 priced rows (normal + holofoil), not the null one.
    assert await _today_count("tst1-1") == 2
    # Un-owned card is excluded despite having a price.
    assert await _today_count("tst1-2") == 0

    # Re-running the same day updates in place — no duplicate rows.
    await db_session.execute(_snapshot_statement())
    assert await _today_count("tst1-1") == 2

    # The snapshot copied the current market price into today's history.
    price = await db_session.scalar(
        select(PriceHistory.market_price).where(
            PriceHistory.card_id == "tst1-1",
            PriceHistory.variant == "normal",
            PriceHistory.snapshot_date == func.current_date(),
        )
    )
    assert price == Decimal("1.00")


async def test_card_history_default_and_variant(auth_client, history_rows):
    # Default variant is the primary present in history (holofoil > normal).
    r = await auth_client.get(f"{_CARDS}/tst1-1/history")
    assert r.status_code == 200
    body = r.json()
    assert body["variant"] == "holofoil"
    assert [p["date"] for p in body["points"]] == ["2026-06-01", "2026-06-02", "2026-06-03"]
    assert [float(p["market_price"]) for p in body["points"]] == [10.0, 11.0, 12.0]

    # Explicit variant override.
    r2 = await auth_client.get(f"{_CARDS}/tst1-1/history", params={"variant": "normal"})
    assert [float(p["market_price"]) for p in r2.json()["points"]] == [1.0, 2.0, 3.0]


async def test_card_history_unknown_card_404(auth_client, history_rows):
    assert (await auth_client.get(f"{_CARDS}/nope-1/history")).status_code == 404


async def test_card_history_days_filter(auth_client, cards, db_session):
    today = dt.date.today()
    db_session.add_all(
        [
            _ph("tst1-1", "normal", today, "9.00"),
            _ph("tst1-1", "normal", today - dt.timedelta(days=30), "1.00"),
        ]
    )
    await db_session.flush()
    r = await auth_client.get(f"{_CARDS}/tst1-1/history", params={"days": 2})
    pts = r.json()["points"]
    assert len(pts) == 1 and float(pts[0]["market_price"]) == 9.0


@pytest.fixture
async def current_prices(db_session, cards):
    """Current prices: tst1-1 has a TCGPlayer USD normal + holofoil; tst1-2 EUR-only."""
    db_session.add_all(
        [
            CardPriceCurrent(
                card_id="tst1-1",
                source="tcgplayer",
                variant="normal",
                market=Decimal("2.00"),
                currency="USD",
            ),
            CardPriceCurrent(
                card_id="tst1-1",
                source="tcgplayer",
                variant="holofoil",
                market=Decimal("12.00"),
                currency="USD",
            ),
            # tst1-2 has NO TCGPlayer market — only a CardMarket (EUR) price.
            CardPriceCurrent(
                card_id="tst1-2",
                source="cardmarket",
                variant="normal",
                market=Decimal("10.00"),
                currency="EUR",
            ),
        ]
    )
    await db_session.flush()


async def test_compute_daily_values_grade_and_eur_conversion(db_session, current_prices):
    """Per-user total = raw USD + graded (×mult) + EUR-converted, all summed in USD.

    - tst1-1 normal @ $2, qty 3, PSA 9 (×2.0)  → 2 * 3 * 2.0 = 12.00
    - tst1-2 EUR €10 @ rate 1.10, qty 2, raw    → (10 * 1.10) * 2 = 22.00
    Total = 34.00. The EUR price is converted to USD *before* it joins the USD total.
    """
    uid = uuid.uuid4()
    db_session.add(User(id=uid, email="v@pokevault.dev"))
    await db_session.flush()
    db_session.add_all(
        [
            CollectionEntry(user_id=uid, card_id="tst1-1", quantity=3, grade="PSA 9"),
            CollectionEntry(user_id=uid, card_id="tst1-2", quantity=2),
        ]
    )
    await db_session.flush()

    totals, unpriced = await compute_portfolio_values_usd(db_session, eur_usd_rate=1.10)
    assert unpriced == []
    assert totals[uid] == Decimal("34.00")


async def test_compute_daily_values_reports_unpriced(db_session, cards):
    """A card with no usable price contributes 0 and is reported (never NaN)."""
    uid = uuid.uuid4()
    db_session.add(User(id=uid, email="u@pokevault.dev"))
    await db_session.flush()
    # tst1-1 has no price rows at all.
    db_session.add(CollectionEntry(user_id=uid, card_id="tst1-1", quantity=1))
    await db_session.flush()

    totals, unpriced = await compute_portfolio_values_usd(db_session)
    assert totals[uid] == Decimal("0")  # present, zero, not missing
    assert (uid, "tst1-1") in unpriced


async def test_snapshot_portfolio_values_idempotent(db_session, current_prices):
    """The daily job upserts one row per user/day and re-runs in place."""
    uid = uuid.uuid4()
    db_session.add(User(id=uid, email="s@pokevault.dev"))
    await db_session.flush()
    db_session.add(CollectionEntry(user_id=uid, card_id="tst1-1", quantity=2))  # $2 * 2 = 4
    await db_session.flush()

    assert await snapshot_portfolio_values(db_session) == 1

    async def _row_count() -> int:
        return await db_session.scalar(
            select(func.count())
            .select_from(PortfolioValueDaily)
            .where(
                PortfolioValueDaily.user_id == uid,
                PortfolioValueDaily.snapshot_date == func.current_date(),
            )
        )

    assert await _row_count() == 1
    stored = await db_session.scalar(
        select(PortfolioValueDaily.total_value_usd).where(PortfolioValueDaily.user_id == uid)
    )
    assert stored == Decimal("4.00")
    # Re-run same day → still one row (upsert).
    await snapshot_portfolio_values(db_session)
    assert await _row_count() == 1


async def test_portfolio_history_reads_daily_rows_plus_live_today(
    auth_client, current_prices, signing_key, db_session
):
    """The endpoint returns stored daily rows + a live 'today' point, scoped per user."""
    uid = uuid.uuid4()
    a = _headers(signing_key, uid)
    # Two historical daily rows (the user must exist first — the authed request upserts them,
    # but seed the user row explicitly so the FK holds before the request runs).
    db_session.add(User(id=uid, email=f"{uid}@pokevault.dev"))
    await db_session.flush()
    db_session.add_all(
        [
            PortfolioValueDaily(user_id=uid, snapshot_date=_D1, total_value_usd=Decimal("7.00")),
            PortfolioValueDaily(user_id=uid, snapshot_date=_D2, total_value_usd=Decimal("9.00")),
        ]
    )
    await db_session.flush()
    # Current holdings → today's LIVE value = $2 normal * 2 = $4.00.
    await auth_client.post(_COLL, json={"card_id": "tst1-1", "quantity": 2}, headers=a)

    series = (await auth_client.get(f"{_COLL}/history", headers=a)).json()
    assert series["message"] is None
    got = {p["date"]: float(p["total_value"]) for p in series["points"]}
    today = dt.date.today().isoformat()
    assert got["2026-06-01"] == 7.0
    assert got["2026-06-02"] == 9.0
    assert got[today] == 4.0  # live, not stale

    # A different user with no rows and no cards → empty series, no crash.
    b = _headers(signing_key, uuid.uuid4())
    other = (await auth_client.get(f"{_COLL}/history", headers=b)).json()
    assert other["points"] == []
