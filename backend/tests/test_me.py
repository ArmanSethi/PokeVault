"""Integration tests for GET /api/v1/me."""

from __future__ import annotations

import datetime as dt
import uuid
from types import SimpleNamespace

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from httpx import AsyncClient

from app.core import security
from app.core.config import settings

_ISSUER = "https://test.supabase.co/auth/v1"


async def test_me_requires_token(client: AsyncClient) -> None:
    resp = await client.get(f"{settings.API_V1_PREFIX}/me")
    assert resp.status_code == 401


async def test_me_returns_user_and_mirrors(auth_client: AsyncClient, monkeypatch) -> None:
    priv = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(security.settings, "SUPABASE_URL", "https://test.supabase.co")
    # Serve our local public key instead of hitting the real JWKS endpoint.
    monkeypatch.setattr(
        security,
        "_jwk_client",
        SimpleNamespace(get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=priv.public_key())),
    )

    sub = uuid.uuid4()
    now = dt.datetime.now(dt.UTC)
    token = jwt.encode(
        {
            "sub": str(sub),
            "email": "misty@pokevault.dev",
            "role": "authenticated",
            "aud": "authenticated",
            "iss": _ISSUER,
            "iat": now,
            "exp": now + dt.timedelta(hours=1),
        },
        priv,
        algorithm="ES256",
    )

    resp = await auth_client.get(
        f"{settings.API_V1_PREFIX}/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == str(sub)
    assert body["email"] == "misty@pokevault.dev"


async def test_me_rejects_garbage_token(auth_client: AsyncClient) -> None:
    resp = await auth_client.get(
        f"{settings.API_V1_PREFIX}/me",
        headers={"Authorization": "Bearer not-a-jwt"},
    )
    assert resp.status_code == 401
