"""Sealed-product endpoints — a user's own sealed holdings (packs, boxes, ETBs, …).

All routes require authentication and are strictly scoped to the current user. Fully separate from
the card collection and the sim vault.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_session
from app.schemas.sealed import SealedItemCreate, SealedItemRead, SealedItemUpdate
from app.services import sealed as sealed_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=list[SealedItemRead])
async def list_items(user: CurrentUser, session: SessionDep) -> list[SealedItemRead]:
    """List the current user's sealed products, newest first."""
    items = await sealed_service.list_items(session, user.id)
    return [sealed_service.to_read(i) for i in items]


@router.post("", response_model=SealedItemRead, status_code=status.HTTP_201_CREATED)
async def add_item(
    user: CurrentUser, session: SessionDep, data: SealedItemCreate
) -> SealedItemRead:
    """Add a sealed product."""
    try:
        item = await sealed_service.create_item(session, user.id, data)
    except sealed_service.UnknownSet:
        raise HTTPException(status_code=404, detail="Unknown set_id") from None
    return sealed_service.to_read(item)


@router.patch("/{item_id}", response_model=SealedItemRead)
async def update_item(
    user: CurrentUser, session: SessionDep, item_id: int, data: SealedItemUpdate
) -> SealedItemRead:
    """Edit an owned sealed product (type, set, name, quantity, value)."""
    try:
        item = await sealed_service.update_item(session, user.id, item_id, data)
    except sealed_service.UnknownSet:
        raise HTTPException(status_code=404, detail="Unknown set_id") from None
    if item is None:
        raise HTTPException(status_code=404, detail="Sealed item not found")
    return sealed_service.to_read(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(user: CurrentUser, session: SessionDep, item_id: int) -> None:
    """Remove an owned sealed product."""
    if not await sealed_service.delete_item(session, user.id, item_id):
        raise HTTPException(status_code=404, detail="Sealed item not found")
