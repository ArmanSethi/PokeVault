"""Auth endpoints — the current user's identity."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.schemas.user import UserRead

router = APIRouter()


@router.get("", response_model=UserRead)
async def read_me(user: CurrentUser) -> UserRead:
    """Return the authenticated user, mirrored from the Supabase access token."""
    return UserRead.model_validate(user)
