"""Schemas for gamification: badges, collector level, and activity streak."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class Badge(BaseModel):
    id: str
    label: str
    description: str
    icon: str
    earned: bool


class StreakRead(BaseModel):
    current_streak: int
    longest_streak: int
    last_active_date: date | None = None


class AchievementsRead(BaseModel):
    """A user's collector level, XP progress, badges, and streak."""

    level: int
    xp: int  # total lifetime XP
    xp_into_level: int  # XP earned toward the next level
    xp_for_next: int  # XP needed to cross into the next level
    badges: list[Badge] = []
    streak: StreakRead
