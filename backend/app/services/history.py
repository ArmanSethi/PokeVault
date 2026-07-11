"""Price-history series: per-card market prices and portfolio value over time."""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection import CollectionEntry
from app.models.price import PriceHistory
from app.schemas.history import (
    CardPriceHistory,
    PortfolioValuePoint,
    PortfolioValueSeries,
    PriceHistoryPoint,
)
from app.services.cards import _VARIANT_PRIORITY
from app.services.grading import grade_multiplier


def _pick_variant(available: set[str], *, prefer: str | None = None) -> str | None:
    """Choose a variant from those present, honoring ``prefer`` then the standard priority."""
    order = ((prefer,) if prefer else ()) + _VARIANT_PRIORITY
    for variant in order:
        if variant in available:
            return variant
    return sorted(available)[0] if available else None


async def card_price_series(
    session: AsyncSession,
    card_id: str,
    *,
    source: str = "tcgplayer",
    variant: str | None = None,
    days: int | None = None,
) -> CardPriceHistory:
    """Market-price series for one card. Defaults to the primary variant in its history."""
    if variant is None:
        found = await session.execute(
            select(PriceHistory.variant)
            .where(PriceHistory.card_id == card_id, PriceHistory.source == source)
            .distinct()
        )
        variant = _pick_variant(set(found.scalars().all()))

    points: list[PriceHistoryPoint] = []
    currency = "USD"
    if variant is not None:
        stmt = select(
            PriceHistory.snapshot_date, PriceHistory.market_price, PriceHistory.currency
        ).where(
            PriceHistory.card_id == card_id,
            PriceHistory.source == source,
            PriceHistory.variant == variant,
        )
        if days is not None:
            stmt = stmt.where(PriceHistory.snapshot_date >= func.current_date() - days)
        rows = (await session.execute(stmt.order_by(PriceHistory.snapshot_date))).all()
        points = [
            PriceHistoryPoint(date=r.snapshot_date, market_price=r.market_price) for r in rows
        ]
        if rows:
            currency = rows[0].currency

    return CardPriceHistory(
        card_id=card_id, source=source, variant=variant, currency=currency, points=points
    )


async def portfolio_value_series(
    session: AsyncSession, user_id: uuid.UUID, *, days: int | None = None
) -> PortfolioValueSeries:
    """Value the user's *current* holdings against each past day's TCGPlayer prices.

    We don't track holdings history, so this reprices today's collection using historical
    market prices — the standard "what would I have been worth" portfolio chart.
    """
    entries = (
        await session.execute(
            select(
                CollectionEntry.card_id,
                CollectionEntry.quantity,
                CollectionEntry.is_foil,
                CollectionEntry.grade,
            ).where(CollectionEntry.user_id == user_id)
        )
    ).all()
    if not entries:
        return PortfolioValueSeries(currency="USD", points=[])

    card_ids = {e.card_id for e in entries}
    stmt = select(
        PriceHistory.card_id,
        PriceHistory.variant,
        PriceHistory.snapshot_date,
        PriceHistory.market_price,
    ).where(
        PriceHistory.card_id.in_(card_ids),
        PriceHistory.source == "tcgplayer",
        PriceHistory.market_price.is_not(None),
    )
    if days is not None:
        stmt = stmt.where(PriceHistory.snapshot_date >= func.current_date() - days)
    rows = (await session.execute(stmt)).all()

    # {card_id: {variant: {date: price}}}
    by_card: dict[str, dict[str, dict]] = {}
    for r in rows:
        by_card.setdefault(r.card_id, {}).setdefault(r.variant, {})[r.snapshot_date] = (
            r.market_price
        )

    totals: dict = {}
    for entry in entries:
        variants = by_card.get(entry.card_id)
        if not variants:
            continue
        chosen = _pick_variant(set(variants), prefer="holofoil" if entry.is_foil else "normal")
        if chosen is None:
            continue
        # Grade-adjust so the over-time chart matches the (graded) "Portfolio value" tile.
        mult = grade_multiplier(entry.grade)
        for day, price in variants[chosen].items():
            totals[day] = totals.get(day, Decimal("0")) + price * entry.quantity * mult

    points = [PortfolioValuePoint(date=day, total_value=totals[day]) for day in sorted(totals)]
    return PortfolioValueSeries(currency="USD", points=points)
