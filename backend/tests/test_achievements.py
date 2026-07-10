"""Tests for gamification: XP/level math + badge predicates (pure) and streak (DB)."""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.core import security
from app.core.config import settings
from app.models.card import Card, Set
from app.models.price import CardPriceCurrent
from app.models.user import User
from app.services.achievements import (
    _BADGES,
    CollectorStats,
    bump_streak,
    compute_xp,
    level_for_xp,
)

_API = settings.API_V1_PREFIX
_ISSUER = "https://test.supabase.co/auth/v1"


# ------------------------------------------------------------------ pure


def test_level_thresholds() -> None:
    assert level_for_xp(0) == (1, 0, 500)
    assert level_for_xp(499) == (1, 499, 500)
    assert level_for_xp(500) == (2, 0, 1000)
    assert level_for_xp(500 + 1000) == (3, 0, 1500)


def test_compute_xp_monotonic() -> None:
    small = CollectorStats(1, 1, 1.0, 0, False, False)
    big = CollectorStats(100, 200, 500.0, 3, True, True)
    assert compute_xp(big) > compute_xp(small)


def test_badges_earned_and_locked() -> None:
    rich = CollectorStats(
        distinct_cards=1500,
        total_quantity=3000,
        total_value=2000.0,
        sets_completed=6,
        has_foil=True,
        has_graded=True,
    )
    empty = CollectorStats(0, 0, 0.0, 0, False, False)
    # Everything is earned for the rich collector, nothing for the empty one.
    assert all(b.earned(rich) for b in _BADGES)
    assert not any(b.earned(empty) for b in _BADGES)


# ------------------------------------------------------------------ DB-backed


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


async def test_streak_increments_resets_and_is_idempotent(db_session) -> None:
    uid = uuid.uuid4()
    db_session.add(User(id=uid))
    await db_session.flush()

    s = await bump_streak(db_session, uid)
    assert s.current_streak == 1

    # Simulate that the last activity was yesterday, then bump → streak grows.
    from sqlalchemy import func, select

    today = await db_session.scalar(select(func.current_date()))
    s.last_active_date = today - dt.timedelta(days=1)
    await db_session.flush()
    s = await bump_streak(db_session, uid)
    assert s.current_streak == 2
    assert s.longest_streak == 2

    # Same-day bump is a no-op.
    s = await bump_streak(db_session, uid)
    assert s.current_streak == 2

    # A gap of 2+ days resets to 1 (but longest is preserved).
    s.last_active_date = today - dt.timedelta(days=3)
    await db_session.flush()
    s = await bump_streak(db_session, uid)
    assert s.current_streak == 1
    assert s.longest_streak == 2


async def test_achievements_endpoint_empty_collection(auth_client, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    r = await auth_client.get(f"{_API}/collection/achievements", headers=a)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["level"] >= 1
    assert body["xp_for_next"] > 0
    assert isinstance(body["badges"], list) and len(body["badges"]) > 0
    # A brand-new user with no cards has earned no badges yet.
    assert not any(b["earned"] for b in body["badges"])
    assert body["streak"]["current_streak"] >= 0


async def test_achievements_reflects_owned_cards(auth_client, db_session, signing_key) -> None:
    db_session.add(Set(id="tst1", name="Test Set", printed_total=1, total=1))
    db_session.add(Card(id="tst1-1", set_id="tst1", name="Pikachu", number="1"))
    await db_session.flush()
    db_session.add(
        CardPriceCurrent(
            card_id="tst1-1",
            source="tcgplayer",
            variant="holofoil",
            market=Decimal("150.00"),
            currency="USD",
        )
    )
    await db_session.flush()

    a = _headers(signing_key, uuid.uuid4())
    await auth_client.post(
        f"{_API}/collection",
        json={"card_id": "tst1-1", "quantity": 1, "is_foil": True, "grade": "PSA 10"},
        headers=a,
    )
    body = (await auth_client.get(f"{_API}/collection/achievements", headers=a)).json()
    earned = {b["id"] for b in body["badges"] if b["earned"]}
    # Completing the 1-card set + owning a foil + a graded card unlock those badges.
    assert {"first_card", "first_foil", "first_graded", "first_set"} <= earned
