"""Pack-simulator endpoint. Pulls are generated server-side (odds can't be client-manipulated).

Keeping a pulled card reuses the existing collection add endpoint — there is no separate keep
route and pulls are not persisted (opening a pack has no side effects until the user keeps).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_session
from app.schemas.simulator import OpenPackRequest, PackResult
from app.services import simulator as simulator_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.post("/open", response_model=PackResult)
async def open_pack(user: CurrentUser, session: SessionDep, data: OpenPackRequest) -> PackResult:
    """Open one rarity-weighted pack for a set. Odds are approximate (see the response
    ``disclaimer``). Auth-scoped so it's a signed-in feature; keeping cards uses /collection."""
    result = await simulator_service.open_pack(session, data.set_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Set not found or has no cards")
    return result
