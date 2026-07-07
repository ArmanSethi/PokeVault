"""Pydantic schemas for sets and cards."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class CardPriceRead(BaseModel):
    """A current price row for a card (one per source / variant)."""

    model_config = ConfigDict(from_attributes=True)

    source: str  # tcgplayer | cardmarket
    variant: str  # e.g. normal, holofoil
    low: Decimal | None = None
    mid: Decimal | None = None
    high: Decimal | None = None
    market: Decimal | None = None
    direct_low: Decimal | None = None
    currency: str
    updated_at: datetime


class CardBase(BaseModel):
    number: str
    name: str
    rarity: str | None = None
    image_url: str | None = None  # maps to the ORM's image_small


class CardCreate(CardBase):
    set_id: str


class CardRead(CardBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    set_id: str
    # All current price rows plus a convenience TCGPlayer USD summary. Populated by
    # the cards service (see app/services/cards.py); the ORM has no such attribute.
    prices: list[CardPriceRead] = []
    market_price: Decimal | None = None
    currency: str | None = None


class SetBase(BaseModel):
    # ``id`` is the pokemontcg.io set code (e.g. "sv3"); there is no separate ``code``.
    name: str
    series: str | None = None
    release_date: date | None = None
    printed_total: int | None = None
    total: int | None = None
    ptcgo_code: str | None = None
    symbol_url: str | None = None
    logo_url: str | None = None


class SetCreate(SetBase):
    id: str


class SetRead(SetBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
