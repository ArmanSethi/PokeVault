"""Virtual pull collection + best-pulls leaderboard endpoints.

Keep writes ONLY to pack_pulls (never the IRL collection). The leaderboard is public and reads
only public-opt-in profiles.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_session
from app.schemas.pull import (
    LeaderboardMode,
    LeaderboardWindow,
    PackPullCreate,
    PackPullRead,
    PullLeaderboardEntry,
)
from app.services import pulls as pulls_service
from app.services.collection import UnknownCard

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("/pack-pulls", response_model=list[PackPullRead])
async def list_pack_pulls(user: CurrentUser, session: SessionDep) -> list[PackPullRead]:
    """The current user's virtual pull collection (frozen price + live current value)."""
    return await pulls_service.list_pulls(session, user.id)


@router.post("/pack-pulls", response_model=PackPullRead, status_code=status.HTTP_201_CREATED)
async def keep_pack_pull(
    user: CurrentUser, session: SessionDep, data: PackPullCreate
) -> PackPullRead:
    """Keep a pulled card into the virtual collection (does not touch the IRL collection)."""
    try:
        return await pulls_service.keep_pull(session, user.id, data)
    except UnknownCard:
        raise HTTPException(status_code=404, detail="Unknown card_id") from None


@router.get("/leaderboard", response_model=list[PullLeaderboardEntry])
async def get_leaderboard(
    session: SessionDep,
    mode: Annotated[LeaderboardMode, Query()] = "best_single",
    window: Annotated[LeaderboardWindow, Query()] = "all_time",
) -> list[PullLeaderboardEntry]:
    """Public best-pulls leaderboard (best_single | total_value; all_time | monthly)."""
    return await pulls_service.leaderboard(session, mode, window)
