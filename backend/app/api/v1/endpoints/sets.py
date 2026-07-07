"""Set endpoints — browse the catalog's expansions/sets."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.schemas.card import SetRead
from app.services import sets as sets_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=list[SetRead])
async def list_sets(
    session: SessionDep,
    q: str | None = Query(default=None, description="Case-insensitive name search."),
    limit: int = Query(default=250, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[SetRead]:
    """List sets, newest-first, with optional name search and pagination."""
    return await sets_service.list_sets(session, q=q, limit=limit, offset=offset)


@router.get("/{set_id}", response_model=SetRead)
async def get_set(session: SessionDep, set_id: str) -> SetRead:
    """Fetch a single set (e.g. ``sv3``)."""
    s = await sets_service.get_set(session, set_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Set not found")
    return s
