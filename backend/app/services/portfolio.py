"""Per-user portfolio valuation used by the daily snapshot job and the history endpoint.

The canonical "portfolio value" is the sum over a user's current collection of
``graded_unit_price(card) * quantity`` in USD — TCGPlayer USD prices, CardMarket EUR prices
converted first, and the PSA grade multiplier applied where a copy is graded. Cards with no
usable price contribute nothing (never ``NaN``) and are reported so the gap is debuggable.
"""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.card import Card
from app.models.collection import CollectionEntry
from app.services.grading import graded_unit_price

logger = logging.getLogger("app.services.portfolio")


async def compute_portfolio_values_usd(
    session: AsyncSession, *, eur_usd_rate: float | None = None
) -> tuple[dict[uuid.UUID, Decimal], list[tuple[uuid.UUID, str]]]:
    """Total portfolio value (USD) for **every** user who owns at least one card.

    Returns ``(totals, unpriced)`` where ``totals`` maps ``user_id -> Decimal`` (a user whose
    cards are all unpriced still appears, with ``0``) and ``unpriced`` lists the
    ``(user_id, card_id)`` pairs that lacked a usable price. Currency mixing is impossible:
    every unit price is USD (EUR converted via ``eur_usd_rate``) before summing.
    """
    rate = eur_usd_rate if eur_usd_rate is not None else settings.EUR_USD_RATE
    stmt = select(CollectionEntry).options(
        selectinload(CollectionEntry.card).selectinload(Card.prices_current)
    )
    entries = (await session.execute(stmt)).scalars().all()

    totals: dict[uuid.UUID, Decimal] = {}
    unpriced: list[tuple[uuid.UUID, str]] = []
    for e in entries:
        totals.setdefault(e.user_id, Decimal("0"))
        unit = graded_unit_price(
            e.card.prices_current, is_foil=e.is_foil, grade=e.grade, eur_usd_rate=rate
        )
        if unit is None:
            unpriced.append((e.user_id, e.card_id))
            continue
        totals[e.user_id] += unit * e.quantity

    if unpriced:
        sample = ", ".join(cid for _, cid in unpriced[:20])
        logger.info(
            "Portfolio valuation: %d owned entries had no usable price (contributed 0): %s%s",
            len(unpriced),
            sample,
            "…" if len(unpriced) > 20 else "",
        )
    return totals, unpriced


async def current_portfolio_value_usd(
    session: AsyncSession, user_id: uuid.UUID, *, eur_usd_rate: float | None = None
) -> Decimal:
    """The single user's live total portfolio value (USD) right now.

    Used for the chart's *today* point so adding a card or changing a grade shows up
    immediately, without waiting for the next daily snapshot.
    """
    rate = eur_usd_rate if eur_usd_rate is not None else settings.EUR_USD_RATE
    stmt = (
        select(CollectionEntry)
        .where(CollectionEntry.user_id == user_id)
        .options(selectinload(CollectionEntry.card).selectinload(Card.prices_current))
    )
    entries = (await session.execute(stmt)).scalars().all()
    total = Decimal("0")
    for e in entries:
        unit = graded_unit_price(
            e.card.prices_current, is_foil=e.is_foil, grade=e.grade, eur_usd_rate=rate
        )
        if unit is not None:
            total += unit * e.quantity
    return total
