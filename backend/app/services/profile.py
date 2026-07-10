"""User profile (public-showcase) mutations."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import UserProfileUpdate


class HandleTaken(Exception):
    """Raised when a requested handle is already claimed by another user."""


async def update_profile(
    session: AsyncSession, user: User, data: UserProfileUpdate
) -> User:
    """Update the current user's handle / public flag.

    Raises ``HandleTaken`` if the requested handle belongs to someone else.
    """
    if data.handle is not None and data.handle != user.handle:
        clash = await session.scalar(
            select(User.id).where(User.handle == data.handle, User.id != user.id)
        )
        if clash is not None:
            raise HandleTaken(data.handle)
        user.handle = data.handle
    if data.is_public is not None:
        user.is_public = data.is_public

    try:
        await session.commit()
    except IntegrityError as exc:  # unique-constraint race between the check and commit
        await session.rollback()
        raise HandleTaken(data.handle or "") from exc
    await session.refresh(user)
    return user
