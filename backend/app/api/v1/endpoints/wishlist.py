"""Wishlist endpoints — cards a user wants, plus their fired price alerts.

All routes require authentication and are strictly scoped to the current user.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_session
from app.schemas.wishlist import AlertRead, WishlistItemCreate, WishlistItemRead
from app.services import alerts as alerts_service
from app.services import wishlist as wishlist_service
from app.services.collection import UnknownCard

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=list[WishlistItemRead])
async def list_wishlist(user: CurrentUser, session: SessionDep) -> list[WishlistItemRead]:
    """List the current user's wishlist, each with the card's current market price."""
    return await wishlist_service.list_with_value(session, user.id)


@router.post("", response_model=WishlistItemRead, status_code=status.HTTP_201_CREATED)
async def add_wishlist(
    user: CurrentUser, session: SessionDep, data: WishlistItemCreate
) -> WishlistItemRead:
    """Add a card to the wishlist (or update its target price if already present)."""
    try:
        await wishlist_service.add_or_update(session, user.id, data)
    except UnknownCard:
        raise HTTPException(status_code=404, detail="Unknown card_id") from None
    # Re-read enriched so the response carries the current market price.
    items = await wishlist_service.list_with_value(session, user.id)
    return next(i for i in items if i.card_id == data.card_id)


@router.get("/alerts", response_model=list[AlertRead])
async def list_alerts(
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[AlertRead]:
    """Recent price alerts fired for the user's wishlisted cards (newest first)."""
    return await alerts_service.list_alerts(session, user.id, limit=limit)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_wishlist(user: CurrentUser, session: SessionDep, item_id: int) -> None:
    """Remove a card from the wishlist."""
    if not await wishlist_service.remove(session, user.id, item_id):
        raise HTTPException(status_code=404, detail="Wishlist item not found")
