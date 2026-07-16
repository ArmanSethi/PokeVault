"""Deck endpoints — a user's private dream-decks and their cards.

All routes require authentication and are strictly scoped to the current user.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_session
from app.schemas.deck import DeckCardCreate, DeckCardUpdate, DeckCreate, DeckRead, DeckUpdate
from app.services import deck as deck_service
from app.services.collection import UnknownCard

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=list[DeckRead])
async def list_decks(user: CurrentUser, session: SessionDep) -> list[DeckRead]:
    """List the current user's decks, each with cards, count, and total value (USD)."""
    return await deck_service.list_decks(session, user.id)


@router.post("", response_model=DeckRead, status_code=status.HTTP_201_CREATED)
async def create_deck(user: CurrentUser, session: SessionDep, data: DeckCreate) -> DeckRead:
    """Create a new named deck with a user-defined target size."""
    try:
        return await deck_service.create_deck(session, user.id, data, is_pro=user.is_pro)
    except deck_service.DeckLimitReached:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Free plan is limited to {deck_service.FREE_DECK_LIMIT} decks. "
                "Upgrade to Pro for unlimited decks."
            ),
        ) from None


@router.get("/{deck_id}", response_model=DeckRead)
async def get_deck(user: CurrentUser, session: SessionDep, deck_id: int) -> DeckRead:
    """Fetch one of the user's decks."""
    deck = await deck_service.get_deck(session, user.id, deck_id)
    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")
    return deck


@router.patch("/{deck_id}", response_model=DeckRead)
async def update_deck(
    user: CurrentUser, session: SessionDep, deck_id: int, data: DeckUpdate
) -> DeckRead:
    """Rename a deck and/or change its target size."""
    deck = await deck_service.update_deck(session, user.id, deck_id, data)
    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")
    return deck


@router.delete("/{deck_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deck(user: CurrentUser, session: SessionDep, deck_id: int) -> None:
    """Delete a deck and all its cards."""
    if not await deck_service.delete_deck(session, user.id, deck_id):
        raise HTTPException(status_code=404, detail="Deck not found")


@router.post("/{deck_id}/cards", response_model=DeckRead)
async def add_deck_card(
    user: CurrentUser, session: SessionDep, deck_id: int, data: DeckCardCreate
) -> DeckRead:
    """Add a card to the deck (or increment its quantity if already present)."""
    try:
        deck = await deck_service.add_card(session, user.id, deck_id, data)
    except UnknownCard:
        raise HTTPException(status_code=404, detail="Unknown card_id") from None
    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")
    return deck


@router.patch("/{deck_id}/cards/{card_id}", response_model=DeckRead)
async def update_deck_card(
    user: CurrentUser,
    session: SessionDep,
    deck_id: int,
    card_id: str,
    data: DeckCardUpdate,
) -> DeckRead:
    """Set a card's quantity within the deck."""
    deck = await deck_service.set_card_quantity(session, user.id, deck_id, card_id, data.quantity)
    if deck is None:
        raise HTTPException(status_code=404, detail="Deck or card not found")
    return deck


@router.delete("/{deck_id}/cards/{card_id}", response_model=DeckRead)
async def remove_deck_card(
    user: CurrentUser, session: SessionDep, deck_id: int, card_id: str
) -> DeckRead:
    """Remove a card from the deck."""
    deck = await deck_service.remove_card(session, user.id, deck_id, card_id)
    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")
    return deck
