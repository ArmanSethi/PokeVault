"""Price-history series: per-card market prices and portfolio value over time."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection import CollectionEntry
from app.models.portfolio import PortfolioValueDaily
from app.models.price import PriceHistory
from app.schemas.history import (
    CardPriceHistory,
    PortfolioValuePoint,
    PortfolioValueSeries,
    PriceHistoryPoint,
)
from app.services.cards import _VARIANT_PRIORITY
from app.services.portfolio import current_portfolio_value_usd

logger = logging.getLogger("app.services.history")


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
    """The user's daily total portfolio value over time.

    Reads the per-user daily rows the snapshot job records (``portfolio_value_daily``) rather
    than reconstructing value from per-card price history. Today's point is always overridden
    with the *live* current value so adding a card or changing a grade shows immediately.

    The series starts at the user's first recorded day and grows daily — it cannot show
    value from before the user existed or before snapshots began, and no points are
    fabricated for those dates. Never raises: on any failure it returns an empty series with
    a message so the endpoint can't 500 and the chart degrades gracefully.
    """
    try:
        stmt = select(
            PortfolioValueDaily.snapshot_date, PortfolioValueDaily.total_value_usd
        ).where(PortfolioValueDaily.user_id == user_id)
        if days is not None:
            stmt = stmt.where(PortfolioValueDaily.snapshot_date >= func.current_date() - days)
        rows = (await session.execute(stmt)).all()

        # date -> total. Stored rows first; today's live value then overrides/adds today.
        by_day = {r.snapshot_date: r.total_value_usd for r in rows}

        today = await session.scalar(select(func.current_date()))
        live_total = await current_portfolio_value_usd(session, user_id)
        # Only surface today's point when the user actually owns cards (else an empty
        # collection would show a fabricated $0 point today).
        has_cards = await session.scalar(
            select(func.count())
            .select_from(CollectionEntry)
            .where(CollectionEntry.user_id == user_id)
        )
        if has_cards:
            by_day[today] = live_total

        points = [
            PortfolioValuePoint(date=day, total_value=by_day[day]) for day in sorted(by_day)
        ]
        return PortfolioValueSeries(currency="USD", points=points)
    except Exception:  # noqa: BLE001 - the chart must never take down the dashboard
        logger.exception("portfolio_value_series failed for user %s", user_id)
        return PortfolioValueSeries(
            currency="USD",
            points=[],
            message="Portfolio history is temporarily unavailable.",
        )
