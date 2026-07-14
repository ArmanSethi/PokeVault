"""Tests for CSV collection import/export.

The parser/classifier tests are pure (no DB) and always run; the end-to-end preview →
confirm → export tests use the rollback ``auth_client`` fixture and skip without a database.
"""

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
from app.schemas.importer import ImportCandidate
from app.services.import_export import _classify, parse_csv

_COL = f"{settings.API_V1_PREFIX}/collection"


# ---------------------------------------------------------------- pure parser tests


def test_parse_generic_headers() -> None:
    csv = b"Name,Number,Set,Quantity,Condition,Foil,Price\nPikachu,58/102,Base,3,NM,Yes,12.50\n"
    rows = parse_csv(csv)
    assert len(rows) == 1
    r = rows[0]
    assert r.name == "Pikachu"
    assert r.number == "58"  # '58/102' reduced to printed number
    assert r.set_name == "Base"
    assert r.quantity == 3
    assert r.condition == "NM"
    assert r.is_foil is True


def test_parse_collectr_style_synonyms() -> None:
    # Different header names + currency symbol + 'holofoil' finish.
    csv = (
        b"Card Name,Collector Number,Expansion,Qty,Finish,Price Paid\n"
        b"Charizard,4,Base,1,Holofoil,$399.99\n"
    )
    rows = parse_csv(csv)
    r = rows[0]
    assert r.name == "Charizard"
    assert r.number == "4"
    assert r.quantity == 1
    assert r.is_foil is True


def test_parse_degrades_gracefully() -> None:
    # Missing quantity → 1; blank line skipped.
    csv = b"name,quantity\nEevee,\n\n"
    rows = parse_csv(csv)
    assert len(rows) == 1
    assert rows[0].quantity == 1
    assert rows[0].is_foil is False


def test_parse_empty_or_headerless() -> None:
    assert parse_csv(b"") == []
    # Header-only file → no data rows.
    assert parse_csv(b"name,number\n") == []


def _cand(card_id: str, conf: float) -> ImportCandidate:
    return ImportCandidate(card_id=card_id, name="X", set_id="s", number="1", confidence=conf)


def test_classify_matched_ambiguous_unmatched() -> None:
    assert _classify([]) == ("unmatched", None)
    # Strong + clear lead → matched.
    status, sel = _classify([_cand("a", 0.95), _cand("b", 0.5)])
    assert (status, sel) == ("matched", "a")
    # Strong but close runner-up → ambiguous.
    status, _ = _classify([_cand("a", 0.95), _cand("b", 0.90)])
    assert status == "ambiguous"
    # Weak top → ambiguous.
    status, _ = _classify([_cand("a", 0.6)])
    assert status == "ambiguous"


# ---------------------------------------------------------------- DB-backed flow


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
    db_session.add(Set(id="tst1", name="Test Set", printed_total=4, total=4))
    db_session.add(Card(id="tst1-1", set_id="tst1", name="Pikachu", number="1"))
    db_session.add(Card(id="tst1-2", set_id="tst1", name="Raichu", number="2"))
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


async def test_import_requires_auth(client: AsyncClient) -> None:
    files = {"file": ("c.csv", b"name\nPikachu\n", "text/csv")}
    r = await client.post(f"{_COL}/import", files=files)
    assert r.status_code == 401


async def test_import_preview_and_confirm_roundtrip(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    csv = b"name,number,set,quantity\nPikachu,1,Test Set,2\nTotally Unknown Card,999,Nowhere,1\n"

    preview = await auth_client.post(
        f"{_COL}/import", files={"file": ("c.csv", csv, "text/csv")}, headers=a
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["total"] == 2
    # Pikachu with matching number+set should match strongly; the junk row should not.
    matched_rows = [r for r in body["rows"] if r["status"] == "matched"]
    assert any(r["selected_card_id"] == "tst1-1" for r in matched_rows)
    assert body["unmatched"] >= 1

    # Confirm the matched Pikachu row.
    confirm = await auth_client.post(
        f"{_COL}/import/confirm",
        json={"rows": [{"card_id": "tst1-1", "quantity": 2}]},
        headers=a,
    )
    assert confirm.status_code == 200, confirm.text
    assert confirm.json()["added"] == 1

    listing = (await auth_client.get(_COL, headers=a)).json()
    assert len(listing) == 1
    assert listing[0]["card_id"] == "tst1-1"
    assert listing[0]["quantity"] == 2


async def test_export_after_import(auth_client, seed, signing_key) -> None:
    a = _headers(signing_key, uuid.uuid4())
    await auth_client.post(_COL, json={"card_id": "tst1-1", "quantity": 3}, headers=a)

    r = await auth_client.get(f"{_COL}/export", headers=a)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    text = r.text
    assert "name,set,number,quantity" in text.splitlines()[0]
    assert "Pikachu" in text
    # Re-parsing the export yields a usable row (round-trip).
    rows = parse_csv(text.encode())
    assert rows[0].name == "Pikachu"
    assert rows[0].quantity == 3
