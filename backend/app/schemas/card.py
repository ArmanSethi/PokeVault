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


class CardVariantPrice(BaseModel):
    """The two markets for one printing of a card, paired for display.

    ``tcgplayer_usd`` is that variant's TCGPlayer market (USD); ``cardmarket_eur`` is the
    Cardmarket trend (EUR). ``diverges`` is a data-quality signal: the two markets disagree
    beyond a threshold once converted to a common currency (usually an edition/printing
    mismatch upstream) → the UI shows a "verify edition" flag. Never a hard error.
    """

    variant: str
    tcgplayer_usd: Decimal | None = None
    cardmarket_eur: Decimal | None = None
    diverges: bool = False


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
    # All raw current price rows, a per-variant two-market view (for the detail table), and a
    # convenience canonical USD headline. Populated by the cards service (app/services/cards.py).
    prices: list[CardPriceRead] = []
    variants: list[CardVariantPrice] = []
    market_price: Decimal | None = None  # canonical USD (see select_display_price)
    currency: str | None = None  # always "USD" when market_price is set


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
