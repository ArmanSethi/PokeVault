"""Price-alert detection + listing for wishlisted cards.

Detection is **log-only**: it writes ``AlertLog`` rows and does not send email. A sender
plugs in later at the marked hook. The daily snapshot job calls ``detect_and_log_alerts``
after refreshing prices. Detection is idempotent per day via the AlertLog unique key, so
re-running the job never produces duplicate alerts.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.alert_log import KIND_DROP, KIND_TARGET_HIT, AlertLog
from app.models.card import Card
from app.models.price import PriceHistory
from app.models.wishlist import WishlistItem
from app.schemas.wishlist import AlertRead
from app.services.cards import select_primary_price

logger = logging.getLogger("app.services.alerts")

# A "notable drop" is a >=10% fall vs the most recent prior snapshot.
_DROP_THRESHOLD = Decimal("0.90")


async def _log_alert(
    session: AsyncSession,
    item: WishlistItem,
    kind: str,
    price: Decimal,
    today: date,
) -> int:
    """Insert one AlertLog row, ignoring the per-day duplicate. Returns 1 if inserted."""
    stmt = (
        insert(AlertLog)
        .values(
            user_id=item.user_id,
            card_id=item.card_id,
            kind=kind,
            triggered_price=price,
            target_price=item.target_price,
            snapshot_date=today,
        )
        .on_conflict_do_nothing(constraint="uq_alert_user_card_kind_day")
        .returning(AlertLog.id)
    )
    inserted = await session.scalar(stmt)
    return 1 if inserted is not None else 0


async def detect_and_log_alerts(session: AsyncSession) -> int:
    """Scan wishlisted cards and log target-hit / notable-drop alerts. Returns count logged.

    NOTE: log-only. To deliver alerts, send email/push for the freshly inserted rows here
    (they are the ones ``_log_alert`` returns 1 for) — e.g. via a free tier like Resend.
    """
    today: date = await session.scalar(select(func.current_date()))
    stmt = select(WishlistItem).options(
        selectinload(WishlistItem.card).selectinload(Card.prices_current)
    )
    items = (await session.execute(stmt)).scalars().all()

    logged = 0
    for item in items:
        card = item.card
        primary = select_primary_price(card.prices_current, rarity=card.rarity)
        if primary is None or primary.market is None:
            continue
        current = primary.market

        # Target-price hit.
        if item.target_price is not None and current <= item.target_price:
            logged += await _log_alert(session, item, KIND_TARGET_HIT, current, today)

        # Notable drop vs the most recent prior snapshot (TCGPlayer).
        prev = await session.scalar(
            select(PriceHistory.market_price)
            .where(
                PriceHistory.card_id == card.id,
                PriceHistory.source == "tcgplayer",
                PriceHistory.market_price.is_not(None),
                PriceHistory.snapshot_date < today,
            )
            .order_by(PriceHistory.snapshot_date.desc())
            .limit(1)
        )
        if prev is not None and prev > 0 and current <= prev * _DROP_THRESHOLD:
            logged += await _log_alert(session, item, KIND_DROP, current, today)

    await session.commit()
    logger.info("Alert detection complete: %d new alert(s) logged.", logged)
    return logged


async def list_alerts(
    session: AsyncSession, user_id: uuid.UUID, *, limit: int = 50
) -> list[AlertRead]:
    """Recent alerts for a user, newest first, joined with the card name."""
    stmt = (
        select(AlertLog, Card.name)
        .join(Card, Card.id == AlertLog.card_id)
        .where(AlertLog.user_id == user_id)
        .order_by(AlertLog.snapshot_date.desc(), AlertLog.id.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    return [
        AlertRead(
            id=alert.id,
            card_id=alert.card_id,
            kind=alert.kind,
            triggered_price=alert.triggered_price,
            target_price=alert.target_price,
            snapshot_date=alert.snapshot_date,
            name=name,
        )
        for alert, name in rows
    ]
