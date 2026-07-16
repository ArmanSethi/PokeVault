"""Integration tests for the user-scoped sealed-product endpoints."""

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
from app.models.card import Set
from app.models.sealed_item import SealedItem
from app.models.user import User

_ISSUER = "https://test.supabase.co/auth/v1"
_SEALED = f"{settings.API_V1_PREFIX}/sealed"


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
    """A catalog set to link sealed items to, inside the test transaction."""
    db_session.add(Set(id="tst1", name="Test Set", printed_total=4, total=4))
    await db_session.flush()


async def test_requires_auth(client: AsyncClient) -> None:
    assert (await client.get(_SEALED)).status_code == 401
    assert (await client.post(_SEALED, json={"product_type": "pack"})).status_code == 401


async def test_create_and_list(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())

    # A pack tied to a set, with a value.
    r1 = await auth_client.post(
        _SEALED,
        json={"product_type": "pack", "set_id": "tst1", "quantity": 3, "value": "4.50"},
        headers=a,
    )
    assert r1.status_code == 201, r1.text
    b1 = r1.json()
    assert b1["product_type"] == "pack"
    assert b1["set_id"] == "tst1"
    assert b1["set_name"] == "Test Set"  # resolved from the linked set
    assert b1["quantity"] == 3
    assert float(b1["value"]) == 4.50

    # A booster box, same set.
    await auth_client.post(
        _SEALED,
        json={"product_type": "booster_box", "set_id": "tst1", "quantity": 1},
        headers=a,
    )
    # A set-less "other" item with no value → quantity defaults to 1.
    r3 = await auth_client.post(_SEALED, json={"product_type": "other"}, headers=a)
    b3 = r3.json()
    assert b3["set_id"] is None
    assert b3["set_name"] is None
    assert b3["value"] is None
    assert b3["quantity"] == 1

    listing = (await auth_client.get(_SEALED, headers=a)).json()
    assert len(listing) == 3


async def test_invalid_product_type_rejected(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    r = await auth_client.post(_SEALED, json={"product_type": "sticker"}, headers=a)
    assert r.status_code == 422


async def test_unknown_set_rejected(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    r = await auth_client.post(_SEALED, json={"product_type": "pack", "set_id": "nope"}, headers=a)
    assert r.status_code == 404


async def test_update_and_delete(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    item_id = (await auth_client.post(_SEALED, json={"product_type": "pack"}, headers=a)).json()[
        "id"
    ]

    patched = await auth_client.patch(
        f"{_SEALED}/{item_id}",
        json={"product_type": "booster_box", "set_id": "tst1", "quantity": 2, "value": "120.00"},
        headers=a,
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["product_type"] == "booster_box"
    assert body["set_id"] == "tst1"
    assert body["set_name"] == "Test Set"
    assert body["quantity"] == 2
    assert float(body["value"]) == 120.00

    # Clearing the set back to none (explicit null is applied).
    cleared = await auth_client.patch(f"{_SEALED}/{item_id}", json={"set_id": None}, headers=a)
    assert cleared.json()["set_id"] is None
    assert cleared.json()["set_name"] is None

    assert (
        await auth_client.patch(f"{_SEALED}/999999", json={"quantity": 1}, headers=a)
    ).status_code == 404

    assert (await auth_client.delete(f"{_SEALED}/{item_id}", headers=a)).status_code == 204
    assert len((await auth_client.get(_SEALED, headers=a)).json()) == 0
    assert (await auth_client.delete(f"{_SEALED}/{item_id}", headers=a)).status_code == 404


async def test_ownership_isolation(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    b = _headers(signing_key, uuid.uuid4())

    a_item = (await auth_client.post(_SEALED, json={"product_type": "pack"}, headers=a)).json()[
        "id"
    ]

    # B sees none of A's items and cannot touch them.
    assert (await auth_client.get(_SEALED, headers=b)).json() == []
    assert (
        await auth_client.patch(f"{_SEALED}/{a_item}", json={"quantity": 9}, headers=b)
    ).status_code == 404
    assert (await auth_client.delete(f"{_SEALED}/{a_item}", headers=b)).status_code == 404

    # A's item is untouched.
    a_list = (await auth_client.get(_SEALED, headers=a)).json()
    assert len(a_list) == 1 and a_list[0]["quantity"] == 1


async def test_sealed_value_folds_into_portfolio_summary(
    auth_client, seed, signing_key, db_session
) -> None:
    """Sealed value (Σ quantity × value) folds into the dashboard portfolio total (cards + sealed).
    With no cards here, the total is exactly the sealed value; empty-value items count as 0."""
    sub = uuid.uuid4()
    db_session.add(User(id=sub))  # user must exist before the sealed FK insert
    await db_session.flush()
    db_session.add_all(
        [
            SealedItem(
                user_id=sub,
                product_type="booster_box",
                set_id="tst1",
                quantity=2,
                value=Decimal("50.00"),
            ),
            SealedItem(user_id=sub, product_type="pack", quantity=9, value=None),  # counts as 0
        ]
    )
    await db_session.flush()

    summary = (
        await auth_client.get(
            f"{settings.API_V1_PREFIX}/collection/summary", headers=_headers(signing_key, sub)
        )
    ).json()
    assert float(summary["total_market_value"]) == 100.00  # 2 × 50 (+ the no-value pack = 0)
