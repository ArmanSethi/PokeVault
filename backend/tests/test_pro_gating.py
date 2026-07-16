"""Integration tests for free/Pro tier gating (packs precedence, decks, export, scans)."""

from __future__ import annotations

import datetime as dt
import uuid
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from httpx import AsyncClient

from app.core import security
from app.core.config import settings
from app.models.scan import Scan
from app.models.user import User
from app.services.simulator import effective_daily_pack_limit

_ISSUER = "https://test.supabase.co/auth/v1"
API = settings.API_V1_PREFIX


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


async def _make_user(db_session, *, is_pro: bool = False, daily_pack_limit: int | None = None):
    """Pre-insert a user with the given flags. The per-request auth upsert only touches
    email/updated_at, so is_pro/daily_pack_limit survive."""
    sub = uuid.uuid4()
    db_session.add(User(id=sub, is_pro=is_pro, daily_pack_limit=daily_pack_limit))
    await db_session.flush()
    return sub


def test_effective_pack_limit_precedence() -> None:
    # An explicit override wins regardless of tier — this is @red's 100/day (holds even with Pro).
    assert effective_daily_pack_limit(User(daily_pack_limit=100, is_pro=False)) == 100
    assert effective_daily_pack_limit(User(daily_pack_limit=100, is_pro=True)) == 100
    # No override: Pro is unlimited (None); Free is the default 2.
    assert effective_daily_pack_limit(User(daily_pack_limit=None, is_pro=True)) is None
    assert effective_daily_pack_limit(User(daily_pack_limit=None, is_pro=False)) == 2


async def test_deck_limit_free_vs_pro(auth_client, signing_key, db_session) -> None:
    free = await _make_user(db_session)
    a = _headers(signing_key, free)
    for i in range(5):
        r = await auth_client.post(
            f"{API}/decks", json={"name": f"D{i}", "target_size": 10}, headers=a
        )
        assert r.status_code == 201, r.text
    blocked = await auth_client.post(
        f"{API}/decks", json={"name": "D6", "target_size": 10}, headers=a
    )
    assert blocked.status_code == 403
    assert "Pro" in blocked.json()["detail"]

    pro = await _make_user(db_session, is_pro=True)
    b = _headers(signing_key, pro)
    for i in range(7):  # comfortably past the free cap
        r = await auth_client.post(
            f"{API}/decks", json={"name": f"P{i}", "target_size": 10}, headers=b
        )
        assert r.status_code == 201, r.text


async def test_export_free_vs_pro(auth_client, signing_key, db_session) -> None:
    free = await _make_user(db_session)
    r = await auth_client.get(f"{API}/collection/export", headers=_headers(signing_key, free))
    assert r.status_code == 403
    assert "Pro" in r.json()["detail"]

    pro = await _make_user(db_session, is_pro=True)
    r = await auth_client.get(f"{API}/collection/export", headers=_headers(signing_key, pro))
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]


async def test_scan_requires_auth(client: AsyncClient) -> None:
    # Scanning is now per-user gated, so it requires a token.
    r = await client.post(f"{API}/scan", files={"file": ("x.png", b"x", "image/png")})
    assert r.status_code == 401


async def test_scan_quota_free_vs_pro(auth_client, signing_key, db_session) -> None:
    free = await _make_user(db_session)
    q = (await auth_client.get(f"{API}/scan/quota", headers=_headers(signing_key, free))).json()
    assert q["daily_limit"] == 50
    assert q["scans_remaining_today"] == 50

    pro = await _make_user(db_session, is_pro=True)
    q = (await auth_client.get(f"{API}/scan/quota", headers=_headers(signing_key, pro))).json()
    assert q["daily_limit"] is None  # unlimited
    assert q["scans_remaining_today"] is None


async def test_scan_blocked_at_free_limit(auth_client, signing_key, db_session) -> None:
    free = await _make_user(db_session)
    # Simulate 50 scans already used today; the quota is checked before any OCR work.
    for _ in range(50):
        db_session.add(Scan(user_id=free))
    await db_session.flush()

    q = (await auth_client.get(f"{API}/scan/quota", headers=_headers(signing_key, free))).json()
    assert q["scans_remaining_today"] == 0

    r = await auth_client.post(
        f"{API}/scan",
        files={"file": ("x.png", b"not-really-an-image", "image/png")},
        headers=_headers(signing_key, free),
    )
    assert r.status_code == 429
    assert "Pro" in r.json()["detail"]
