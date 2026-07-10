"""Integration tests for the user-scoped collection & portfolio endpoints."""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from httpx import AsyncClient

from app.core import security
from app.core.config import settings
from app.models.card import Card, Set
from app.models.price import CardPriceCurrent

_ISSUER = "https://test.supabase.co/auth/v1"
_ME = f"{settings.API_V1_PREFIX}/collection"


@pytest.fixture
def signing_key(monkeypatch):
    """Local ES256 key; make the verifier trust it instead of the real JWKS."""
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
    """A 4-card set with two priced cards, inside the test transaction."""
    db_session.add(Set(id="tst1", name="Test Set", printed_total=4, total=4))
    db_session.add(Card(id="tst1-1", set_id="tst1", name="Pikachu", number="1"))
    db_session.add(Card(id="tst1-2", set_id="tst1", name="Raichu", number="2"))
    await db_session.flush()
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
                market=Decimal("10.00"),
                currency="USD",
            ),
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


def _money(v) -> float:
    return float(v)


async def test_requires_auth(client: AsyncClient) -> None:
    assert (await client.get(_ME)).status_code == 401
    assert (await client.post(_ME, json={"card_id": "tst1-1"})).status_code == 401
    assert (await client.get(f"{_ME}/summary")).status_code == 401


async def test_add_increments_matching_stack(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())

    r1 = await auth_client.post(_ME, json={"card_id": "tst1-1"}, headers=a)
    assert r1.status_code == 201, r1.text
    body = r1.json()
    assert body["quantity"] == 1
    assert _money(body["market_price"]) == 2.00  # normal, non-foil
    entry_id = body["id"]

    r2 = await auth_client.post(_ME, json={"card_id": "tst1-1", "quantity": 2}, headers=a)
    assert r2.json()["id"] == entry_id  # same stack
    assert r2.json()["quantity"] == 3

    # Foil is a different stack and prices from the holofoil variant.
    r3 = await auth_client.post(_ME, json={"card_id": "tst1-1", "is_foil": True}, headers=a)
    assert r3.json()["id"] != entry_id
    assert _money(r3.json()["market_price"]) == 10.00

    listing = (await auth_client.get(_ME, headers=a)).json()
    assert len(listing) == 2


async def test_unknown_card_rejected(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    r = await auth_client.post(_ME, json={"card_id": "does-not-exist"}, headers=a)
    assert r.status_code == 404


async def test_update_and_delete(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    entry_id = (await auth_client.post(_ME, json={"card_id": "tst1-2"}, headers=a)).json()["id"]

    patched = await auth_client.patch(
        f"{_ME}/{entry_id}",
        json={"quantity": 4, "condition": "NM", "grade": "PSA 9", "notes": "mint-ish"},
        headers=a,
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["quantity"] == 4
    assert body["condition"] == "NM"
    assert body["grade"] == "PSA 9"
    # Grade-aware valuation: PSA 9 is worth 2x the raw price (see app/services/grading.py).
    assert body["grade_multiplier"] == 2.0
    assert _money(body["market_price"]) == 10.00  # 5.00 raw * 2.0 (PSA 9)
    assert _money(body["market_value"]) == 40.00  # 10.00 * 4 copies

    assert (
        await auth_client.patch(f"{_ME}/999999", json={"quantity": 1}, headers=a)
    ).status_code == 404

    assert (await auth_client.delete(f"{_ME}/{entry_id}", headers=a)).status_code == 204
    assert len((await auth_client.get(_ME, headers=a)).json()) == 0
    assert (await auth_client.delete(f"{_ME}/{entry_id}", headers=a)).status_code == 404


async def test_ownership_isolation(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    b = _headers(signing_key, uuid.uuid4())

    a_entry = (await auth_client.post(_ME, json={"card_id": "tst1-1"}, headers=a)).json()["id"]

    # B sees none of A's entries and cannot touch them.
    assert (await auth_client.get(_ME, headers=b)).json() == []
    assert (
        await auth_client.patch(f"{_ME}/{a_entry}", json={"quantity": 9}, headers=b)
    ).status_code == 404
    assert (await auth_client.delete(f"{_ME}/{a_entry}", headers=b)).status_code == 404
    assert (await auth_client.get(f"{_ME}/summary", headers=b)).json()["total_quantity"] == 0

    # A's entry is untouched.
    a_list = (await auth_client.get(_ME, headers=a)).json()
    assert len(a_list) == 1 and a_list[0]["quantity"] == 1


async def test_portfolio_summary_and_completion(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    await auth_client.post(_ME, json={"card_id": "tst1-1", "quantity": 2}, headers=a)
    await auth_client.post(_ME, json={"card_id": "tst1-2", "quantity": 1}, headers=a)

    summary = (await auth_client.get(f"{_ME}/summary", headers=a)).json()
    assert summary["total_quantity"] == 3
    assert summary["total_distinct_cards"] == 2
    assert _money(summary["total_market_value"]) == 9.00  # 2*2 + 5*1

    assert len(summary["sets"]) == 1
    s = summary["sets"][0]
    assert s["set_id"] == "tst1"
    assert s["set_name"] == "Test Set"
    assert s["distinct_cards_owned"] == 2
    assert s["set_size"] == 4
    assert s["completion_pct"] == 0.5
    assert _money(s["market_value"]) == 9.00
