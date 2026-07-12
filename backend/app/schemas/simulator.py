"""Schemas for the pack simulator (approximate, rarity-weighted pack opening)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.card import CardRead


class OpenPackRequest(BaseModel):
    set_id: str


class PulledCard(BaseModel):
    """One card in an opened pack, with the slot it filled and its rarity tier."""

    slot_kind: Literal["common", "uncommon", "hit"]
    tier: str  # the card's rarity label, e.g. "Common", "Ultra Rare"
    card: CardRead


class PackResult(BaseModel):
    """The result of opening one pack. Odds are approximate — see ``disclaimer``."""

    set_id: str
    set_name: str
    template: str  # human description of the slot template used
    disclaimer: str
    cards: list[PulledCard] = []
