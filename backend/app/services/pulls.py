"""Virtual pull collection + best-pulls leaderboard.

Boundary: reads/writes ONLY ``pack_pulls`` (+ ``cards``/``card_prices_current`` for valuation
and ``users`` for the public leaderboard). It NEVER touches ``collection_entries`` — keeping a
pull writes here, not to the IRL collection. Value uses the one-source ``cards.unit_price_usd``
(TCGPlayer USD, CardMarket EUR converted; missing → contributes 0).
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.card import Card
from app.models.pack_pull import PackPull
from app.models.user import User
from app.schemas.pull import (
    LeaderboardCard,
    LeaderboardMode,
    LeaderboardWindow,
    PackPullCreate,
    PackPullRead,
    PullLeaderboardEntry,
)
from app.services.cards import unit_price_usd
from app.services.collection import UnknownCard

LEADERBOARD_LIMIT = 100


async def _load_card(session: AsyncSession, card_id: str) -> Card | None:
    stmt = select(Card).options(selectinload(Card.prices_current)).where(Card.id == card_id)
    return (await session.execute(stmt)).scalar_one_or_none()


def _current_value(card: Card) -> Decimal | None:
    return unit_price_usd(card.prices_current, is_foil=False, eur_usd_rate=settings.EUR_USD_RATE)


async def keep_pull(
    session: AsyncSession, user_id: uuid.UUID, data: PackPullCreate
) -> PackPullRead:
    """Keep a pulled card into the virtual collection. Freezes current price as price_at_pull."""
    card = await _load_card(session, data.card_id)
    if card is None:
        raise UnknownCard(data.card_id)
    frozen = _current_value(card)
    pull = PackPull(user_id=user_id, card_id=card.id, price_at_pull=frozen, rarity=card.rarity)
    session.add(pull)
    await session.commit()
    await session.refresh(pull)
    return PackPullRead(
        id=pull.id,
        card_id=card.id,
        name=card.name,
        set_id=card.set_id,
        number=card.number,
        image_url=card.image_small,
        rarity=card.rarity,
        price_at_pull=frozen,
        current_value=frozen,
        pulled_at=pull.pulled_at,
    )


async def list_pulls(session: AsyncSession, user_id: uuid.UUID) -> list[PackPullRead]:
    """The user's virtual collection, newest first, with frozen + live current value."""
    stmt = (
        select(PackPull)
        .where(PackPull.user_id == user_id)
        .options(selectinload(PackPull.card).selectinload(Card.prices_current))
        .order_by(PackPull.pulled_at.desc(), PackPull.id.desc())
    )
    pulls = (await session.execute(stmt)).scalars().all()
    out: list[PackPullRead] = []
    for p in pulls:
        card = p.card
        out.append(
            PackPullRead(
                id=p.id,
                card_id=p.card_id,
                name=card.name,
                set_id=card.set_id,
                number=card.number,
                image_url=card.image_small,
                rarity=p.rarity or card.rarity,
                price_at_pull=p.price_at_pull,
                current_value=_current_value(card),
                pulled_at=p.pulled_at,
            )
        )
    return out


def _month_start():
    """Postgres date_trunc('month', now() AT TIME ZONE 'UTC') — start of the current UTC month."""
    return func.date_trunc("month", func.timezone("UTC", func.now()))


async def leaderboard(
    session: AsyncSession, mode: LeaderboardMode, window: LeaderboardWindow
) -> list[PullLeaderboardEntry]:
    """Top pullers. Public profiles (is_public + handle) only; ranked by real market price."""
    public_only = (User.is_public.is_(True), User.handle.is_not(None))
    monthly = [PackPull.pulled_at >= _month_start()] if window == "monthly" else []

    if mode == "best_single":
        # One row per user = their highest FROZEN pull (DISTINCT ON), then rank by that score.
        stmt = (
            select(
                PackPull.user_id,
                User.handle,
                PackPull.price_at_pull.label("score"),
                Card.id.label("cid"),
                Card.name,
                Card.set_id,
                Card.image_small,
            )
            .join(User, User.id == PackPull.user_id)
            .join(Card, Card.id == PackPull.card_id)
            .where(*public_only, PackPull.price_at_pull.is_not(None), *monthly)
            .distinct(PackPull.user_id)
            .order_by(PackPull.user_id, PackPull.price_at_pull.desc())
        )
        rows = (await session.execute(stmt)).all()
        rows.sort(key=lambda r: r.score, reverse=True)
        return [
            PullLeaderboardEntry(
                rank=i,
                handle=r.handle,
                score=r.score,
                card=LeaderboardCard(
                    card_id=r.cid, name=r.name, set_id=r.set_id, image_url=r.image_small
                ),
            )
            for i, r in enumerate(rows[:LEADERBOARD_LIMIT], start=1)
        ]

    # total_value: sum the LIVE current value of each public user's pulls (null → 0).
    stmt = (
        select(PackPull, User.handle)
        .join(User, User.id == PackPull.user_id)
        .options(selectinload(PackPull.card).selectinload(Card.prices_current))
        .where(*public_only, *monthly)
    )
    rows = (await session.execute(stmt)).all()
    agg: dict[uuid.UUID, dict] = {}
    for pull, handle in rows:
        a = agg.setdefault(pull.user_id, {"handle": handle, "total": Decimal("0"), "count": 0})
        a["count"] += 1
        val = _current_value(pull.card)
        if val is not None:
            a["total"] += val
    ranked = sorted(agg.values(), key=lambda a: a["total"], reverse=True)[:LEADERBOARD_LIMIT]
    return [
        PullLeaderboardEntry(rank=i, handle=a["handle"], score=a["total"], pull_count=a["count"])
        for i, a in enumerate(ranked, start=1)
    ]
