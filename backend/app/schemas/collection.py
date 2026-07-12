"""Pydantic schemas for collection entries and portfolio valuation."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CollectionEntryBase(BaseModel):
    card_id: str
    quantity: int = 1
    condition: str | None = None  # e.g. NM, LP
    grade: str | None = None  # e.g. "PSA 10"
    is_foil: bool = False
    acquired_price: Decimal | None = None
    notes: str | None = None


class CollectionEntryCreate(CollectionEntryBase):
    quantity: int = Field(default=1, ge=1)


class CollectionEntryUpdate(BaseModel):
    # is_foil is part of the stack identity and is intentionally not editable.
    quantity: int | None = Field(default=None, ge=1)
    condition: str | None = None
    grade: str | None = None
    acquired_price: Decimal | None = None
    notes: str | None = None


class CollectionEntryRead(CollectionEntryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    # Valuation (TCGPlayer USD), populated by app/services/valuation.py.
    # market_price is the *grade-adjusted* unit value; grade_multiplier is the factor applied
    # to the raw price (1.0 for raw/ungraded, e.g. 5.0 for PSA 10). See app/services/grading.py.
    market_price: Decimal | None = None
    market_value: Decimal | None = None
    grade_multiplier: float = 1.0


class SetHolding(BaseModel):
    """A user's holdings for one set (TCGPlayer USD)."""

    set_id: str
    set_name: str
    owned_quantity: int
    distinct_cards_owned: int
    set_size: int | None = None  # printed_total (fallback total); None if unknown
    market_value: Decimal


class CollectionSummary(BaseModel):
    """Aggregate portfolio valuation with a per-set breakdown (TCGPlayer USD)."""

    total_quantity: int
    total_distinct_cards: int
    total_market_value: Decimal
    total_cost: Decimal
    currency: str = "USD"
    sets: list[SetHolding] = []
