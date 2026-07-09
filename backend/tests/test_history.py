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
from app.ingest.snapshot_prices import _snapshot_statement
from app.models.card import Card, Set
from app.models.collection import CollectionEntry
from app.models.price import CardPriceCurrent, PriceHistory
from app.models.user import User

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


async def test_portfolio_history_and_isolation(auth_client, history_rows, signing_key):
    a = _headers(signing_key, uuid.uuid4())
    b = _headers(signing_key, uuid.uuid4())
    await auth_client.post(_COLL, json={"card_id": "tst1-1", "quantity": 2}, headers=a)
    await auth_client.post(_COLL, json={"card_id": "tst1-2", "quantity": 1}, headers=a)

    series = (await auth_client.get(f"{_COLL}/history", headers=a)).json()
    # per date: 2 * normal(tst1-1) + 1 * 5.00
    got = {p["date"]: float(p["total_value"]) for p in series["points"]}
    assert got == {"2026-06-01": 7.0, "2026-06-02": 9.0, "2026-06-03": 11.0}

    # A different user's portfolio history is empty (ownership scoping).
    assert (await auth_client.get(f"{_COLL}/history", headers=b)).json()["points"] == []
