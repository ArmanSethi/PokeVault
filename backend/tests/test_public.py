"""Tests for public showcases, profile handle claiming, and the sitemap.

The ``_url`` helper test is pure; the showcase/handle/sitemap tests use the rollback DB
fixtures and skip without a database.
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
from app.services.public import _url

_API = settings.API_V1_PREFIX
_ISSUER = "https://test.supabase.co/auth/v1"


# ------------------------------------------------------------------ pure


def test_url_uses_public_origin_and_escapes(monkeypatch) -> None:
    monkeypatch.setattr(settings, "PUBLIC_WEB_ORIGIN", "https://pokevault.app/")
    # Trailing slash on the origin is normalized; path is joined verbatim + XML-escaped.
    assert _url("/cards/sv3-125") == "https://pokevault.app/cards/sv3-125"
    assert "&amp;" in _url("/u/a&b")


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
            market=Decimal("2.00"),
            currency="USD",
        )
    )
    await db_session.flush()


async def test_handle_validation_rejected(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    r = await auth_client.patch(f"{_API}/me", json={"handle": "No Spaces!"}, headers=a)
    assert r.status_code == 422


async def test_handle_conflict(auth_client, seed, signing_key) -> None:
    a1 = _headers(signing_key, uuid.uuid4())
    a2 = _headers(signing_key, uuid.uuid4())
    # Unique per run so it can't collide with a real user's claimed handle.
    handle = f"t{uuid.uuid4().hex[:12]}"
    first = await auth_client.patch(f"{_API}/me", json={"handle": handle}, headers=a1)
    assert first.status_code == 200
    r = await auth_client.patch(f"{_API}/me", json={"handle": handle}, headers=a2)
    assert r.status_code == 409


async def test_showcase_private_by_default_then_public(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    await auth_client.post(
        f"{_API}/collection",
        json={"card_id": "tst1-1", "quantity": 1},
        headers=a,
    )
    # Claim a handle but stay private → showcase is 404 to the public.
    handle = f"t{uuid.uuid4().hex[:12]}"  # unique per run; avoids colliding with real handles
    await auth_client.patch(f"{_API}/me", json={"handle": handle}, headers=a)
    assert (await auth_client.get(f"{_API}/public/u/{handle}")).status_code == 404

    # Go public → profile + collection are visible…
    await auth_client.patch(f"{_API}/me", json={"is_public": True}, headers=a)
    prof = await auth_client.get(f"{_API}/public/u/{handle}")
    assert prof.status_code == 200
    assert prof.json()["total_distinct_cards"] == 1

    coll = await auth_client.get(f"{_API}/public/u/{handle}/collection")
    assert coll.status_code == 200
    body = coll.json()
    assert body["entries"][0]["card_id"] == "tst1-1"
    # …but private fields must never appear in the public payload.
    raw = coll.text
    assert "acquired_price" not in raw


async def test_public_profile_total_matches_raw_card_values(auth_client, seed, signing_key) -> None:
    """Regression (m1): the public profile's headline total must equal the sum of the
    publicly shown per-card values — both use RAW price. The PSA grade premium (owner-only)
    must not inflate the public total."""
    a = _headers(signing_key, uuid.uuid4())
    # A PSA 10 copy: raw price $2.00; the owner's grade-adjusted value would be $10.00 (x5).
    await auth_client.post(
        f"{_API}/collection",
        json={"card_id": "tst1-1", "quantity": 1, "grade": "PSA 10"},
        headers=a,
    )
    handle = f"t{uuid.uuid4().hex[:12]}"
    await auth_client.patch(f"{_API}/me", json={"handle": handle, "is_public": True}, headers=a)

    prof = (await auth_client.get(f"{_API}/public/u/{handle}")).json()
    coll = (await auth_client.get(f"{_API}/public/u/{handle}/collection")).json()

    entries_sum = sum(Decimal(str(e["market_value"])) for e in coll["entries"])
    assert Decimal(str(prof["total_market_value"])) == entries_sum  # headline == sum of cards
    assert entries_sum == Decimal("2.00")  # raw, NOT the grade-adjusted 10.00


async def test_sitemap_lists_cards_and_sets(auth_client, seed, signing_key, monkeypatch) -> None:
    monkeypatch.setattr(settings, "PUBLIC_WEB_ORIGIN", "https://pokevault.app")
    r = await auth_client.get(f"{_API}/sitemap.xml")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/xml")
    body = r.text
    assert "https://pokevault.app/cards/tst1-1" in body
    assert "https://pokevault.app/sets/tst1" in body
