"""Schemas for user dream-decks."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class DeckCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    target_size: int = Field(ge=1, le=100000)


class DeckUpdate(BaseModel):
    """Partial update — rename and/or change the target size."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    target_size: int | None = Field(default=None, ge=1, le=100000)


class DeckCardCreate(BaseModel):
    card_id: str
    quantity: int = Field(default=1, ge=1)


class DeckCardUpdate(BaseModel):
    quantity: int = Field(ge=1)


class DeckCardRead(BaseModel):
    """A card in a deck, enriched with catalog fields + its USD market price."""

    card_id: str
    quantity: int
    name: str
    set_id: str
    number: str
    image_url: str | None = None
    # Unit market price in USD (TCGPlayer, or CardMarket EUR converted). None if unpriced.
    market_price: Decimal | None = None
    currency: str = "USD"


class DeckRead(BaseModel):
    """A deck with its cards, current count, and total value (USD)."""

    id: int
    name: str
    target_size: int
    created_at: datetime
    card_count: int  # sum of card quantities
    total_value: Decimal  # Σ(market_price × quantity) in USD
    currency: str = "USD"
    cards: list[DeckCardRead] = []
