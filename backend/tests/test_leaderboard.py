"""Tests for the public leaderboard — privacy boundary is the point.

Verifies: private users are excluded entirely (even a higher-value private user never appears
or affects ranks); ranking is by true value; a public user who hides their value keeps their
rank but the value is returned as null; a public user who shows it gets the number.
"""

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
from app.services import public as public_service

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
async def lb_cards(db_session):
    """Two priced cards: a $100 one and a $10 one (TCGPlayer USD)."""
    db_session.add(Set(id="lb1", name="LB Set", printed_total=2, total=2))
    db_session.add_all(
        [
            Card(id="lb1-1", set_id="lb1", name="Big Value", number="1"),
            Card(id="lb1-2", set_id="lb1", name="Small Value", number="2"),
        ]
    )
    await db_session.flush()
    db_session.add_all(
        [
            CardPriceCurrent(
                card_id="lb1-1",
                source="tcgplayer",
                variant="normal",
                market=Decimal("100.00"),
                currency="USD",
            ),
            CardPriceCurrent(
                card_id="lb1-2",
                source="tcgplayer",
                variant="normal",
                market=Decimal("10.00"),
                currency="USD",
            ),
        ]
    )
    await db_session.flush()


async def test_leaderboard_privacy_and_ranking(auth_client, lb_cards, signing_key) -> None:
    tag = uuid.uuid4().hex[:8]
    h_top = f"lbtop{tag}"  # public, value HIDDEN, highest value ($100)
    h_show = f"lbshow{tag}"  # public, value SHOWN ($10)
    h_priv = f"lbpriv{tag}"  # PRIVATE, would be highest ($200) — must never appear
    a_top, a_show, a_priv = (_headers(signing_key, uuid.uuid4()) for _ in range(3))

    # Top public user (hidden value): owns the $100 card.
    await auth_client.post(
        f"{_API}/collection", json={"card_id": "lb1-1", "quantity": 1}, headers=a_top
    )
    await auth_client.patch(f"{_API}/me", json={"handle": h_top, "is_public": True}, headers=a_top)

    # Shown public user: owns the $10 card, opts to show value.
    await auth_client.post(
        f"{_API}/collection", json={"card_id": "lb1-2", "quantity": 1}, headers=a_show
    )
    await auth_client.patch(
        f"{_API}/me",
        json={"handle": h_show, "is_public": True, "show_value_on_leaderboard": True},
        headers=a_show,
    )

    # Private user: owns 2× the $100 card ($200 — the highest) but is NOT public.
    await auth_client.post(
        f"{_API}/collection", json={"card_id": "lb1-1", "quantity": 2}, headers=a_priv
    )
    await auth_client.patch(
        f"{_API}/me", json={"handle": h_priv, "is_public": False}, headers=a_priv
    )

    public_service._lb_cache.clear()  # avoid a stale cached board from another test
    resp = await auth_client.get(f"{_API}/public/leaderboard")
    assert resp.status_code == 200
    board = resp.json()
    by_handle = {e["handle"]: e for e in board}

    # Private user is absent entirely — never ranked, never counted.
    assert h_priv not in by_handle, "private user leaked onto the leaderboard"

    # Both public users present; the hidden-but-higher user outranks the shown lower one.
    assert h_top in by_handle and h_show in by_handle
    assert by_handle[h_top]["rank"] < by_handle[h_show]["rank"]

    # Hidden user: ranked, but value withheld.
    top = by_handle[h_top]
    assert top["value_hidden"] is True
    assert top["value_usd"] is None

    # Shown user: real value present.
    show = by_handle[h_show]
    assert show["value_hidden"] is False
    assert Decimal(str(show["value_usd"])) == Decimal("10.00")

    # No private field ever appears in the payload.
    raw = resp.text
    assert "acquired_price" not in raw and "notes" not in raw and "email" not in raw
