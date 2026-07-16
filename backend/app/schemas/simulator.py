"""Schemas for the pack simulator (approximate, rarity-weighted pack opening)."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.card import CardRead
from app.schemas.pull import PackPullRead


class OpenPackRequest(BaseModel):
    set_id: str


class PulledCard(BaseModel):
    """One card in an opened pack, with the slot it filled and its rarity tier."""

    slot_kind: Literal["common", "uncommon", "hit"]
    tier: str  # the card's rarity label, e.g. "Common", "Ultra Rare"
    price_at_open: Decimal | None = None  # frozen open-time value (one-source unit_price_usd)
    card: CardRead


class PackResult(BaseModel):
    """The result of opening one pack. Odds are approximate — see ``disclaimer``."""

    open_id: uuid.UUID  # referenced by the keep step (server-authoritative roll)
    set_id: str
    set_name: str
    template: str  # human description of the slot template used
    disclaimer: str
    packs_remaining_today: int | None = None  # None = unlimited (Pro)
    cards: list[PulledCard] = []


class KeepRequest(BaseModel):
    """Keep a subset of a specific open's rolled cards. Server trusts only the stored roll."""

    open_id: uuid.UUID
    kept_card_ids: list[str] = []


class KeepResult(BaseModel):
    kept: int
    pulls: list[PackPullRead] = []


class QuotaRead(BaseModel):
    # None = unlimited (Pro); a number = packs left today / this user's effective daily cap.
    packs_remaining_today: int | None = None
    daily_limit: int | None = None
