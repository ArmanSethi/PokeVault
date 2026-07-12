"""Virtual vault (kept pulls) + best-pulls leaderboard endpoints.

Mounted under /simulator. The vault reads only pack_pulls (never the IRL collection). The
leaderboard is public and reads only leaderboard-opt-in profiles.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_session
from app.schemas.pull import (
    LeaderboardMode,
    LeaderboardWindow,
    PackPullRead,
    PullLeaderboardEntry,
)
from app.services import pulls as pulls_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("/vault", response_model=list[PackPullRead])
async def list_vault(user: CurrentUser, session: SessionDep) -> list[PackPullRead]:
    """The current user's virtual pull collection (frozen price + live current value)."""
    return await pulls_service.list_pulls(session, user.id)


@router.get("/leaderboard", response_model=list[PullLeaderboardEntry])
async def get_leaderboard(
    session: SessionDep,
    mode: Annotated[LeaderboardMode, Query()] = "best_single",
    window: Annotated[LeaderboardWindow, Query()] = "all_time",
) -> list[PullLeaderboardEntry]:
    """Public best-pulls leaderboard (best_single | total_value; all_time | monthly)."""
    return await pulls_service.leaderboard(session, mode, window)
