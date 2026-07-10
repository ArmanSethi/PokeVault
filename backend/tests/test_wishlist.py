"""Tests for the wishlist endpoints and log-only price-alert detection.

All tests are DB-backed (rollback session) and skip without a database.
"""

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
from app.models.card import Card, Set
from app.models.price import CardPriceCurrent, PriceHistory
from app.models.user import User
from app.models.wishlist import WishlistItem
from app.services.alerts import detect_and_log_alerts, list_alerts

_API = settings.API_V1_PREFIX
_ISSUER = "https://test.supabase.co/auth/v1"


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
async def seed(db_session):
    db_session.add(Set(id="tst1", name="Test Set", printed_total=2, total=2))
    db_session.add(Card(id="tst1-1", set_id="tst1", name="Pikachu", number="1"))
    await db_session.flush()
    db_session.add(
        CardPriceCurrent(
            card_id="tst1-1",
            source="tcgplayer",
            variant="normal",
            market=Decimal("5.00"),
            currency="USD",
        )
    )
    await db_session.flush()


async def test_wishlist_crud(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())

    add = await auth_client.post(
        f"{_API}/wishlist", json={"card_id": "tst1-1", "target_price": 3.00}, headers=a
    )
    assert add.status_code == 201, add.text
    body = add.json()
    assert body["card_id"] == "tst1-1"
    assert float(body["market_price"]) == 5.00
    item_id = body["id"]

    # Adding the same card again updates the target rather than duplicating.
    again = await auth_client.post(
        f"{_API}/wishlist", json={"card_id": "tst1-1", "target_price": 4.50}, headers=a
    )
    assert again.json()["id"] == item_id
    listing = (await auth_client.get(f"{_API}/wishlist", headers=a)).json()
    assert len(listing) == 1
    assert float(listing[0]["target_price"]) == 4.50

    # Delete.
    d = await auth_client.delete(f"{_API}/wishlist/{item_id}", headers=a)
    assert d.status_code == 204
    assert (await auth_client.get(f"{_API}/wishlist", headers=a)).json() == []


async def test_wishlist_unknown_card(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    r = await auth_client.post(f"{_API}/wishlist", json={"card_id": "nope"}, headers=a)
    assert r.status_code == 404


async def test_alert_detection_target_and_drop_idempotent(db_session, seed) -> None:
    uid = uuid.uuid4()
    db_session.add(User(id=uid))
    await db_session.flush()
    # Target 10 with current 5 → target hit. Prior snapshot 10 with current 5 → notable drop.
    db_session.add(WishlistItem(user_id=uid, card_id="tst1-1", target_price=Decimal("10.00")))
    today = await db_session.scalar(select(func.current_date()))
    db_session.add(
        PriceHistory(
            card_id="tst1-1",
            source="tcgplayer",
            variant="normal",
            market_price=Decimal("10.00"),
            currency="USD",
            snapshot_date=today - dt.timedelta(days=1),
        )
    )
    await db_session.flush()

    logged = await detect_and_log_alerts(db_session)
    assert logged == 2  # target_hit + drop

    # Re-running the same day is idempotent — no duplicate alerts.
    assert await detect_and_log_alerts(db_session) == 0

    alerts = await list_alerts(db_session, uid)
    kinds = {a.kind for a in alerts}
    assert kinds == {"target_hit", "drop"}
    assert all(a.name == "Pikachu" for a in alerts)


async def test_alerts_endpoint(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    # No alerts yet for a fresh user.
    r = await auth_client.get(f"{_API}/wishlist/alerts", headers=a)
    assert r.status_code == 200
    assert r.json() == []
