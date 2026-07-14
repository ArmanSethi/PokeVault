"""Collection endpoints — a user's own holdings, valuation, and portfolio summary.

All routes require authentication and are strictly scoped to the current user.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_session
from app.schemas.collection import (
    CollectionEntryCreate,
    CollectionEntryRead,
    CollectionEntryUpdate,
    CollectionSummary,
)
from app.schemas.history import PortfolioValueSeries
from app.services import collection as collection_service
from app.services import history as history_service
from app.services import valuation as valuation_service
from app.services.valuation import _to_entry_read

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=list[CollectionEntryRead])
async def list_entries(user: CurrentUser, session: SessionDep) -> list[CollectionEntryRead]:
    """List the current user's entries, each with unit price and market value (USD)."""
    return await valuation_service.list_entries_with_value(session, user.id)


@router.post("", response_model=CollectionEntryRead, status_code=status.HTTP_201_CREATED)
async def add_entry(
    user: CurrentUser, session: SessionDep, data: CollectionEntryCreate
) -> CollectionEntryRead:
    """Add a card, or increment the matching stack's quantity if it already exists."""
    try:
        entry = await collection_service.add_or_increment(session, user.id, data)
    except collection_service.UnknownCard:
        raise HTTPException(status_code=404, detail="Unknown card_id") from None
    return _to_entry_read(entry)


@router.get("/summary", response_model=CollectionSummary)
async def collection_summary(user: CurrentUser, session: SessionDep) -> CollectionSummary:
    """Portfolio value, manual Total spent, and per-set breakdown with completion (USD)."""
    return await valuation_service.collection_summary(session, user.id)


@router.get("/history", response_model=PortfolioValueSeries)
async def portfolio_history(
    user: CurrentUser,
    session: SessionDep,
    days: int | None = Query(default=None, ge=1, description="Limit to the last N days."),
) -> PortfolioValueSeries:
    """Total value of the user's current holdings priced against each past day (USD)."""
    return await history_service.portfolio_value_series(session, user.id, days=days)


@router.patch("/{entry_id}", response_model=CollectionEntryRead)
async def update_entry(
    user: CurrentUser, session: SessionDep, entry_id: int, data: CollectionEntryUpdate
) -> CollectionEntryRead:
    """Edit an owned entry (quantity, condition, grade)."""
    entry = await collection_service.update_entry(session, user.id, entry_id, data)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    return _to_entry_read(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(user: CurrentUser, session: SessionDep, entry_id: int) -> None:
    """Remove an owned entry."""
    if not await collection_service.delete_entry(session, user.id, entry_id):
        raise HTTPException(status_code=404, detail="Entry not found")
