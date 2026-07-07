"""Supabase access-token (JWT) verification.

Supabase issues the tokens; this backend only *verifies* them. Verification uses the
project's asymmetric signing keys, fetched from the JWKS discovery endpoint, and checks
the signature, issuer, audience, and expiry. No shared secret is stored server-side.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

import jwt
from jwt import PyJWKClient

from app.core.config import settings

# Supabase signs with asymmetric keys (ECC/RSA). Accept both; reject anything else
# (notably HS256, which would imply a shared-secret setup we don't support).
_ALGORITHMS = ["ES256", "RS256"]

# Lazily-created, cached JWKS client. Created on first verification (not at import) so the
# module imports without SUPABASE_URL configured or network access (e.g. in unit tests).
_jwk_client: PyJWKClient | None = None


class InvalidToken(Exception):
    """Raised when a token fails verification for any reason."""


@dataclass(frozen=True)
class TokenClaims:
    """The subset of verified JWT claims the app cares about."""

    sub: uuid.UUID
    email: str | None
    role: str


def _default_jwk_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = PyJWKClient(settings.supabase_jwks_url)
    return _jwk_client


def verify_supabase_jwt(
    token: str,
    *,
    jwk_client: PyJWKClient | None = None,
) -> TokenClaims:
    """Verify a Supabase access token and return its claims.

    ``jwk_client`` defaults to the module's cached JWKS client; tests inject a stub that
    serves a locally-generated public key. Raises :class:`InvalidToken` on any failure.
    """
    client = jwk_client if jwk_client is not None else _default_jwk_client()
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=_ALGORITHMS,
            audience=settings.SUPABASE_JWT_AUD,
            issuer=settings.supabase_issuer,
            options={"require": ["exp", "sub"]},
        )
    except (jwt.InvalidTokenError, jwt.PyJWKClientError) as exc:
        raise InvalidToken(str(exc)) from exc

    try:
        sub = uuid.UUID(str(payload["sub"]))
    except (KeyError, ValueError) as exc:
        raise InvalidToken("token 'sub' is missing or not a UUID") from exc

    return TokenClaims(
        sub=sub,
        email=payload.get("email"),
        role=payload.get("role", "authenticated"),
    )
