"""Schemas for public showcases.

These are the *only* projections exposed without authentication. They deliberately omit
private fields — ``acquired_price`` and ``notes`` never appear here.
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel

from app.schemas.collection import SetHolding


class PublicProfile(BaseModel):
    """Headline, public-safe stats for a user's showcase."""

    handle: str
    total_distinct_cards: int
    total_quantity: int
    total_market_value: Decimal
    currency: str = "USD"
    sets_completed: int
    sets: list[SetHolding] = []  # per-set breakdown (market value only — no cost basis)


class PublicEntry(BaseModel):
    """A single owned card as shown on a public showcase (no cost basis, no notes)."""

    card_id: str
    name: str
    set_id: str
    number: str
    image_url: str | None = None
    rarity: str | None = None
    is_foil: bool
    quantity: int
    market_price: Decimal | None = None
    market_value: Decimal | None = None


class PublicCollection(BaseModel):
    handle: str
    entries: list[PublicEntry] = []
