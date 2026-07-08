"""Card endpoints — browse the catalog with current TCGPlayer (USD) prices."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.schemas.card import CardRead
from app.schemas.history import CardPriceHistory
from app.services import cards as cards_service
from app.services import history as history_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=list[CardRead])
async def list_cards(
    session: SessionDep,
    set_id: str | None = Query(default=None, description="Filter by set id, e.g. sv3."),
    q: str | None = Query(default=None, description="Search card name or collector number."),
    rarity: str | None = Query(default=None, description="Filter by exact rarity."),
    sort: Annotated[
        cards_service.CardSort,
        Query(description="number | name | rarity | price_desc | price_asc"),
    ] = "number",
    limit: int = Query(default=50, ge=1, le=250),
    offset: int = Query(default=0, ge=0),
) -> list[CardRead]:
    """List cards with their current prices and a TCGPlayer USD market summary."""
    return await cards_service.list_cards(
        session, set_id=set_id, q=q, rarity=rarity, sort=sort, limit=limit, offset=offset
    )


@router.get("/rarities", response_model=list[str])
async def list_rarities(session: SessionDep) -> list[str]:
    """Distinct rarities in the catalog, for the filter dropdown."""
    return await cards_service.list_rarities(session)


@router.get("/{card_id}", response_model=CardRead)
async def get_card(session: SessionDep, card_id: str) -> CardRead:
    """Fetch a single card (e.g. ``sv3-125``) with its current prices."""
    card = await cards_service.get_card(session, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@router.get("/{card_id}/history", response_model=CardPriceHistory)
async def get_card_history(
    session: SessionDep,
    card_id: str,
    source: str = Query(default="tcgplayer"),
    variant: str | None = Query(default=None, description="Defaults to the primary variant."),
    days: int | None = Query(default=None, ge=1, description="Limit to the last N days."),
) -> CardPriceHistory:
    """Market-price series for a card (self-snapshotted daily; may be sparse early)."""
    if await cards_service.get_card(session, card_id) is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return await history_service.card_price_series(
        session, card_id, source=source, variant=variant, days=days
    )
