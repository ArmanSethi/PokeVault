"""Auth endpoints — the current user's identity and profile."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_session
from app.schemas.user import UserProfileUpdate, UserRead
from app.services import profile as profile_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=UserRead)
async def read_me(user: CurrentUser) -> UserRead:
    """Return the authenticated user."""
    return UserRead.model_validate(user)


@router.patch("", response_model=UserRead)
async def update_me(
    user: CurrentUser, session: SessionDep, data: UserProfileUpdate
) -> UserRead:
    """Claim/change a public-showcase handle and toggle visibility."""
    try:
        updated = await profile_service.update_profile(session, user, data)
    except profile_service.HandleTaken:
        raise HTTPException(status_code=409, detail="That handle is already taken.") from None
    return UserRead.model_validate(updated)
