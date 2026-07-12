"""Pack-simulator endpoints. The roll is server-authoritative — the client only reveals what the
server already decided, and keeps trust only the server's stored roll (never client cards/prices).

Open persists the rolled result (``pack_opens``) and enforces a 2-packs/UTC-day quota. Keep names
an open + a subset of its rolled cards; kept cards land in the VIRTUAL vault (``pack_pulls``),
never the IRL collection.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_session
from app.schemas.simulator import (
    KeepRequest,
    KeepResult,
    OpenPackRequest,
    PackResult,
    QuotaRead,
)
from app.services import pulls as pulls_service
from app.services import simulator as simulator_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.post("/open", response_model=PackResult)
async def open_pack(user: CurrentUser, session: SessionDep, data: OpenPackRequest) -> PackResult:
    """Open one rarity-weighted pack for a set. Odds are approximate (see the response
    ``disclaimer``). Enforces the daily UTC quota and persists the authoritative roll."""
    try:
        result = await simulator_service.open_pack(session, user.id, data.set_id)
    except simulator_service.QuotaExceeded:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily pack limit reached. Free packs reset at UTC midnight.",
        ) from None
    if result is None:
        raise HTTPException(status_code=404, detail="Set not found or has no cards")
    return result


@router.post("/keep", response_model=KeepResult)
async def keep(user: CurrentUser, session: SessionDep, data: KeepRequest) -> KeepResult:
    """Keep a subset of an open's rolled cards into the virtual vault (idempotent per open)."""
    try:
        pulls = await pulls_service.keep_from_open(
            session, user.id, data.open_id, data.kept_card_ids
        )
    except pulls_service.OpenNotFound:
        raise HTTPException(status_code=404, detail="Open not found") from None
    except pulls_service.AlreadyKept:
        raise HTTPException(status_code=409, detail="Cards already kept for this open") from None
    except pulls_service.InvalidKeep as exc:
        raise HTTPException(
            status_code=400, detail=f"Card {exc.card_id} was not in this pack"
        ) from None
    return KeepResult(kept=len(pulls), pulls=pulls)


@router.get("/quota", response_model=QuotaRead)
async def quota(user: CurrentUser, session: SessionDep) -> QuotaRead:
    """Packs the user may still open today (UTC)."""
    remaining = await simulator_service.packs_remaining_today(session, user.id)
    return QuotaRead(packs_remaining_today=remaining)
