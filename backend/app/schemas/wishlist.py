"""Schemas for the wishlist and price-drop alerts."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.limits import MAX_MONEY, MIN_MONEY


class WishlistItemCreate(BaseModel):
    card_id: str
    target_price: Decimal | None = Field(default=None, ge=MIN_MONEY, le=MAX_MONEY)


class WishlistItemRead(BaseModel):
    """A wishlisted card with its current market price + the user's target."""

    id: int
    card_id: str
    target_price: Decimal | None = None
    created_at: datetime
    # Enriched card fields (populated by the service).
    name: str
    set_id: str
    number: str
    image_url: str | None = None
    market_price: Decimal | None = None
    currency: str | None = None


class AlertRead(BaseModel):
    """A fired price alert on a wishlisted card (log-only; delivery is deferred)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    card_id: str
    kind: str  # target_hit | drop
    triggered_price: Decimal | None = None
    target_price: Decimal | None = None
    snapshot_date: date
    name: str | None = None  # card name, joined in by the service
