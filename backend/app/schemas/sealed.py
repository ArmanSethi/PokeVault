"""Pydantic schemas for user-owned sealed product."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.limits import MAX_MONEY, MAX_SEALED_QTY, MIN_MONEY, MIN_SEALED_QTY

# Allowed product types. To add one, extend this tuple + ``ProductType`` (and the frontend union) —
# no migration needed, since the column is a plain string.
PRODUCT_TYPES = ("pack", "booster_box", "etb", "bundle", "other")
ProductType = Literal["pack", "booster_box", "etb", "bundle", "other"]


class SealedItemBase(BaseModel):
    product_type: ProductType
    set_id: str | None = None  # None = not tied to a set
    name: str | None = None  # optional free-text label, e.g. "Base Set Booster Box"
    quantity: int = 1
    value: Decimal | None = None  # manual value (USD); None = no value


class SealedItemCreate(SealedItemBase):
    quantity: int = Field(default=1, ge=MIN_SEALED_QTY, le=MAX_SEALED_QTY)
    value: Decimal | None = Field(default=None, ge=MIN_MONEY, le=MAX_MONEY)


class SealedItemUpdate(BaseModel):
    product_type: ProductType | None = None
    set_id: str | None = None
    name: str | None = None
    quantity: int | None = Field(default=None, ge=MIN_SEALED_QTY, le=MAX_SEALED_QTY)
    value: Decimal | None = Field(default=None, ge=MIN_MONEY, le=MAX_MONEY)


class SealedItemRead(SealedItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    set_name: str | None = None  # resolved from the linked set, if any
    created_at: datetime
    updated_at: datetime
