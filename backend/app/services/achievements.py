"""Gamification: badges + collector level (computed from existing data) and the streak.

Nothing here needs new stored state except the activity streak (``UserStats``). Badges and
level are derived on read from the user's collection so they always reflect current holdings.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection import CollectionEntry
from app.models.user_stats import UserStats
from app.schemas.achievements import AchievementsRead, Badge, StreakRead
from app.services.valuation import collection_summary


@dataclass
class CollectorStats:
    """The raw inputs badges + level are computed from."""

    distinct_cards: int
    total_quantity: int
    total_value: float
    sets_completed: int
    has_foil: bool
    has_graded: bool


@dataclass(frozen=True)
class _BadgeDef:
    id: str
    label: str
    description: str
    icon: str
    earned: Callable[[CollectorStats], bool]


# Badge catalog — each earned() is a predicate over the user's CollectorStats.
_BADGES: list[_BadgeDef] = [
    _BadgeDef(
        "first_card", "First Catch", "Own your first card", "🎴", lambda s: s.distinct_cards >= 1
    ),
    _BadgeDef(
        "ten_cards",
        "Getting Started",
        "Own 10 unique cards",
        "🃏",
        lambda s: s.distinct_cards >= 10,
    ),
    _BadgeDef(
        "hundred_cards",
        "Collector",
        "Own 100 unique cards",
        "📚",
        lambda s: s.distinct_cards >= 100,
    ),
    _BadgeDef(
        "thousand_cards",
        "Curator",
        "Own 1,000 unique cards",
        "🏛️",
        lambda s: s.distinct_cards >= 1000,
    ),
    _BadgeDef("first_foil", "Shiny", "Own a foil / holo card", "✨", lambda s: s.has_foil),
    _BadgeDef("first_graded", "Certified", "Own a graded card", "🏅", lambda s: s.has_graded),
    _BadgeDef(
        "first_set", "Set Finisher", "Complete a full set", "🏆", lambda s: s.sets_completed >= 1
    ),
    _BadgeDef(
        "five_sets", "Master Builder", "Complete 5 sets", "👑", lambda s: s.sets_completed >= 5
    ),
    _BadgeDef(
        "value_100",
        "Investor",
        "Reach $100 in collection value",
        "💵",
        lambda s: s.total_value >= 100,
    ),
    _BadgeDef(
        "value_1000", "High Roller", "Reach $1,000 in value", "💰", lambda s: s.total_value >= 1000
    ),
]


def compute_xp(stats: CollectorStats) -> int:
    """Lifetime XP: cards + completed sets + collection value all contribute."""
    return (
        stats.distinct_cards * 10
        + stats.total_quantity * 2
        + stats.sets_completed * 250
        + int(stats.total_value)
    )


def level_for_xp(xp: int) -> tuple[int, int, int]:
    """Map total XP to (level, xp_into_level, xp_for_next).

    Each level costs progressively more (500, 1000, 1500, …) so early levels come quickly
    and later ones feel earned.
    """
    level = 1
    into = xp
    need = 500
    while into >= need:
        into -= need
        level += 1
        need += 500
    return level, into, need


async def _collector_stats(session: AsyncSession, user_id: uuid.UUID) -> CollectorStats:
    summary = await collection_summary(session, user_id)
    sets_completed = sum(1 for s in summary.sets if s.completion_pct >= 1.0)
    has_foil = bool(
        await session.scalar(
            select(func.count())
            .select_from(CollectionEntry)
            .where(CollectionEntry.user_id == user_id, CollectionEntry.is_foil.is_(True))
        )
    )
    has_graded = bool(
        await session.scalar(
            select(func.count())
            .select_from(CollectionEntry)
            .where(CollectionEntry.user_id == user_id, CollectionEntry.grade.is_not(None))
        )
    )
    return CollectorStats(
        distinct_cards=summary.total_distinct_cards,
        total_quantity=summary.total_quantity,
        total_value=float(summary.total_market_value),
        sets_completed=sets_completed,
        has_foil=has_foil,
        has_graded=has_graded,
    )


async def compute_achievements(session: AsyncSession, user_id: uuid.UUID) -> AchievementsRead:
    """Badges, collector level, and current streak for a user."""
    stats = await _collector_stats(session, user_id)
    xp = compute_xp(stats)
    level, into, need = level_for_xp(xp)
    badges = [
        Badge(
            id=b.id, label=b.label, description=b.description, icon=b.icon, earned=b.earned(stats)
        )
        for b in _BADGES
    ]
    streak = await get_streak(session, user_id)
    return AchievementsRead(
        level=level,
        xp=xp,
        xp_into_level=into,
        xp_for_next=need,
        badges=badges,
        streak=StreakRead.model_validate(streak, from_attributes=True),
    )


async def get_streak(session: AsyncSession, user_id: uuid.UUID) -> UserStats:
    """Return the user's streak row, creating an empty one if absent."""
    stats = await session.get(UserStats, user_id)
    if stats is None:
        stats = UserStats(user_id=user_id, current_streak=0, longest_streak=0)
        session.add(stats)
        await session.flush()
    return stats


async def bump_streak(session: AsyncSession, user_id: uuid.UUID) -> UserStats:
    """Register activity for today and update the streak. Idempotent within a day.

    Uses the database's ``current_date`` so the streak never depends on a client clock.
    """
    today: date = await session.scalar(select(func.current_date()))
    stats = await get_streak(session, user_id)

    last = stats.last_active_date
    if last == today:
        return stats  # already counted today
    if last == today - timedelta(days=1):
        stats.current_streak += 1
    else:
        stats.current_streak = 1
    stats.last_active_date = today
    stats.longest_streak = max(stats.longest_streak, stats.current_streak)
    await session.commit()
    return stats
