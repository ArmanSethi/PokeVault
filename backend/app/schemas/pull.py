"""Schemas for the virtual pull collection + best-pulls leaderboard."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class PackPullRead(BaseModel):
    """A kept pull with card metadata, the frozen price, and the live current value."""

    id: int
    card_id: str
    name: str
    set_id: str
    number: str
    image_url: str | None = None
    rarity: str | None = None
    variant: str | None = None  # the printing this pull represents (drives its value)
    price_at_pull: Decimal | None = None  # frozen at keep
    current_value: Decimal | None = None  # looked up now from the price table
    currency: str = "USD"
    pulled_at: datetime


class LeaderboardCard(BaseModel):
    """The card behind a best-single score."""

    card_id: str
    name: str
    set_id: str
    image_url: str | None = None


class PullLeaderboardEntry(BaseModel):
    rank: int
    handle: str
    score: Decimal
    showcase_public: bool = False  # link the handle to /u/{handle} only when the showcase is public
    pull_count: int | None = None  # total_value mode
    card: LeaderboardCard | None = None  # best_single mode


LeaderboardMode = Literal["best_single", "total_value"]
LeaderboardWindow = Literal["all_time", "monthly", "daily"]
