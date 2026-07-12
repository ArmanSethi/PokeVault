"""Shared route dependencies: database session and the current authenticated user."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import InvalidToken, verify_supabase_jwt
from app.db.session import get_session
from app.models.user import User

__all__ = [
    "get_session",
    "get_current_user",
    "CurrentUser",
    "get_optional_user",
    "OptionalUser",
]

# auto_error=False so a missing header yields our own 401 (not FastAPI's 403).
_bearer = HTTPBearer(auto_error=False)

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    """Verify the bearer token and return the (mirrored) current user.

    Upserts a local `users` row keyed by the Supabase uid so app tables can FK to a user
    we own. Raises 401 for a missing, malformed, or invalid token.
    """
    if creds is None:
        raise _UNAUTHENTICATED
    try:
        claims = verify_supabase_jwt(creds.credentials)
    except InvalidToken:
        raise _UNAUTHENTICATED from None

    stmt = (
        insert(User)
        .values(id=claims.sub, email=claims.email)
        .on_conflict_do_update(
            index_elements=[User.id],
            set_={"email": claims.email, "updated_at": func.now()},
        )
        .returning(User)
    )
    user = (await session.execute(stmt)).scalar_one()
    await session.commit()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_optional_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User | None:
    """Like ``get_current_user`` but returns ``None`` instead of 401 when no valid token is
    present. Lets a public endpoint tailor its response to the viewer (if any) without
    requiring login."""
    if creds is None:
        return None
    try:
        return await get_current_user(creds, session)
    except HTTPException:
        return None


OptionalUser = Annotated[User | None, Depends(get_optional_user)]
