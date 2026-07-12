"""Offline unit tests for Supabase JWT verification (no network, no DB).

Mint tokens with a locally-generated ES256 keypair and feed the verifier a stub JWKS
client that serves the matching public key.
"""

from __future__ import annotations

import datetime as dt
import uuid
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.core import security
from app.core.security import InvalidToken, verify_supabase_jwt

_ISSUER = "https://test.supabase.co/auth/v1"


@pytest.fixture(autouse=True)
def _configure(monkeypatch):
    # Deterministic issuer regardless of the ambient .env.
    monkeypatch.setattr(security.settings, "SUPABASE_URL", "https://test.supabase.co")


@pytest.fixture
def keypair():
    priv = ec.generate_private_key(ec.SECP256R1())
    return priv, priv.public_key()


@pytest.fixture
def stub_client(keypair):
    _, public_key = keypair
    return SimpleNamespace(get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=public_key))


def _mint(private_key, **overrides) -> str:
    now = dt.datetime.now(dt.UTC)
    payload = {
        "sub": str(uuid.uuid4()),
        "email": "trainer@pokevault.dev",
        "role": "authenticated",
        "aud": "authenticated",
        "iss": _ISSUER,
        "iat": now,
        "exp": now + dt.timedelta(hours=1),
    }
    payload.update(overrides)
    return jwt.encode(payload, private_key, algorithm="ES256")


def test_valid_token_returns_claims(keypair, stub_client):
    priv, _ = keypair
    sub = uuid.uuid4()
    token = _mint(priv, sub=str(sub), email="ash@pokevault.dev")
    claims = verify_supabase_jwt(token, jwk_client=stub_client)
    assert claims.sub == sub
    assert claims.email == "ash@pokevault.dev"
    assert claims.role == "authenticated"


def test_expired_token_rejected(keypair, stub_client):
    priv, _ = keypair
    past = dt.datetime.now(dt.UTC) - dt.timedelta(hours=1)
    token = _mint(priv, exp=past, iat=past - dt.timedelta(hours=1))
    with pytest.raises(InvalidToken):
        verify_supabase_jwt(token, jwk_client=stub_client)


def test_wrong_audience_rejected(keypair, stub_client):
    priv, _ = keypair
    token = _mint(priv, aud="anon")
    with pytest.raises(InvalidToken):
        verify_supabase_jwt(token, jwk_client=stub_client)


def test_bad_signature_rejected(keypair, stub_client):
    # Sign with a different key than the stub serves.
    other = ec.generate_private_key(ec.SECP256R1())
    token = _mint(other)
    with pytest.raises(InvalidToken):
        verify_supabase_jwt(token, jwk_client=stub_client)


def test_missing_sub_rejected(keypair, stub_client):
    priv, _ = keypair
    token = _mint(priv)
    # Strip 'sub' by re-minting without it via a raw payload.
    now = dt.datetime.now(dt.UTC)
    token = jwt.encode(
        {"aud": "authenticated", "iss": _ISSUER, "exp": now + dt.timedelta(hours=1)},
        priv,
        algorithm="ES256",
    )
    with pytest.raises(InvalidToken):
        verify_supabase_jwt(token, jwk_client=stub_client)
