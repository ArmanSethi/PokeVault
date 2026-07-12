"""Virtual pull collection + best-pulls leaderboard.

Boundary: reads/writes ONLY ``pack_pulls`` (+ ``pack_opens`` to validate a keep, ``cards`` /
``card_prices_current`` for valuation, and ``users`` for the leaderboard). It NEVER touches
``collection_entries`` — keeping a pull writes here, not to the IRL collection. Value uses the
one-source ``cards.unit_price_usd`` (TCGPlayer USD, CardMarket EUR converted; missing → 0).

Server authority: a keep names a ``pack_opens`` row and a subset of its stored ``rolled_cards``.
The frozen ``price_at_pull`` is copied from the server's ``price_at_open`` — never client-supplied.
"""

from __future__ import annotations

import uuid
from collections import Counter
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.card import Card
from app.models.pack_open import PackOpen
from app.models.pack_pull import PackPull
from app.models.user import User
from app.schemas.pull import (
    LeaderboardCard,
    LeaderboardMode,
    LeaderboardWindow,
    PackPullRead,
    PullLeaderboardEntry,
)
from app.services.cards import unit_price_usd

LEADERBOARD_LIMIT = 100
BEST_SINGLE_LIMIT = 10  # best_single is a worldwide daily top-10 board


class OpenNotFound(Exception):
    """The open doesn't exist or doesn't belong to this user."""


class AlreadyKept(Exception):
    """A keep was already recorded for this open (keep is idempotent per open)."""


class InvalidKeep(Exception):
    """A kept card_id isn't in the open's rolled cards (or was kept more times than rolled)."""

    def __init__(self, card_id: str) -> None:
        super().__init__(card_id)
        self.card_id = card_id


def _current_value(card: Card) -> Decimal | None:
    return unit_price_usd(card.prices_current, is_foil=False, eur_usd_rate=settings.EUR_USD_RATE)


async def keep_from_open(
    session: AsyncSession,
    user_id: uuid.UUID,
    open_id: uuid.UUID,
    kept_card_ids: list[str],
) -> list[PackPullRead]:
    """Keep a subset of an open's rolled cards into the virtual collection.

    Trusts only the server-stored roll: the frozen ``price_at_pull`` is the stored
    ``price_at_open``, and every kept id must be present in ``rolled_cards`` (a card kept more
    times than it was rolled is rejected). Idempotent per open. Never touches the IRL collection.
    """
    pack_open = await session.get(PackOpen, open_id)
    if pack_open is None or pack_open.user_id != user_id:
        raise OpenNotFound

    already = await session.scalar(
        select(func.count()).select_from(PackPull).where(PackPull.open_id == open_id)
    )
    if already:
        raise AlreadyKept

    # Index the authoritative roll: available count + frozen price/rarity per card_id.
    rolled_counts: Counter[str] = Counter()
    rolled_by_id: dict[str, dict] = {}
    for rc in pack_open.rolled_cards:
        cid = rc["card_id"]
        rolled_counts[cid] += 1
        price = rc.get("price_at_open")
        rolled_by_id[cid] = {
            "price": Decimal(price) if price is not None else None,
            "rarity": rc.get("rarity"),
        }

    # Reject anything not in the roll (or kept more times than it was rolled).
    for cid, n in Counter(kept_card_ids).items():
        if rolled_counts[cid] < n:
            raise InvalidKeep(cid)

    created: list[PackPull] = []
    for cid in kept_card_ids:
        info = rolled_by_id[cid]
        pull = PackPull(
            user_id=user_id,
            open_id=open_id,
            card_id=cid,
            price_at_pull=info["price"],
            rarity=info["rarity"],
        )
        session.add(pull)
        created.append(pull)
    await session.commit()

    if not created:
        return []

    # Load card metadata + live prices for the response (kept ids are few).
    ids = {p.card_id for p in created}
    cards = (
        (
            await session.execute(
                select(Card).options(selectinload(Card.prices_current)).where(Card.id.in_(ids))
            )
        )
        .scalars()
        .all()
    )
    by_id = {c.id: c for c in cards}
    out: list[PackPullRead] = []
    for p in created:
        await session.refresh(p)
        card = by_id[p.card_id]
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


async def list_pulls(session: AsyncSession, user_id: uuid.UUID) -> list[PackPullRead]:
    """The user's virtual collection, newest first, with frozen + live current value.

    Row-level (one row per kept card, duplicates included). The vault UI stacks duplicates into
    one tile with a ×N badge; scoring reads rows, not tiles.
    """
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


def _day_start():
    """Postgres date_trunc('day', now() AT TIME ZONE 'UTC') — start of the current UTC day."""
    return func.date_trunc("day", func.timezone("UTC", func.now()))


async def leaderboard(
    session: AsyncSession, mode: LeaderboardMode, window: LeaderboardWindow
) -> list[PullLeaderboardEntry]:
    """Top pullers. Eligibility = leaderboard opt-in + a handle + ≥1 pull; ranked by real market
    price. ``showcase_public`` tells the UI whether it may link the handle to /u/{handle}.

    ``best_single`` is the worldwide DAILY top 10 (today, UTC; ignores ``window``) — it resets at
    UTC midnight so the top spot stays competitive. ``total_value`` honors ``window`` (daily /
    monthly / all_time)."""
    eligible = (User.leaderboard_opt_in.is_(True), User.handle.is_not(None))
    if window == "daily":
        window_filter = [PackPull.pulled_at >= _day_start()]
    elif window == "monthly":
        window_filter = [PackPull.pulled_at >= _month_start()]
    else:  # all_time
        window_filter = []

    if mode == "best_single":
        # One row per user = their highest FROZEN pull TODAY (DISTINCT ON), ranked by that score.
        # Window is ignored here: best_single is always the current UTC day.
        stmt = (
            select(
                PackPull.user_id,
                User.handle,
                User.is_public,
                PackPull.price_at_pull.label("score"),
                Card.id.label("cid"),
                Card.name,
                Card.set_id,
                Card.image_small,
            )
            .join(User, User.id == PackPull.user_id)
            .join(Card, Card.id == PackPull.card_id)
            .where(
                *eligible, PackPull.price_at_pull.is_not(None), PackPull.pulled_at >= _day_start()
            )
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
                showcase_public=r.is_public,
                card=LeaderboardCard(
                    card_id=r.cid, name=r.name, set_id=r.set_id, image_url=r.image_small
                ),
            )
            for i, r in enumerate(rows[:BEST_SINGLE_LIMIT], start=1)
        ]

    # total_value: sum the LIVE current value of each eligible user's pulls (null → 0).
    stmt = (
        select(PackPull, User.handle, User.is_public)
        .join(User, User.id == PackPull.user_id)
        .options(selectinload(PackPull.card).selectinload(Card.prices_current))
        .where(*eligible, *window_filter)
    )
    rows = (await session.execute(stmt)).all()
    agg: dict[uuid.UUID, dict] = {}
    for pull, handle, is_public in rows:
        a = agg.setdefault(
            pull.user_id,
            {"handle": handle, "is_public": is_public, "total": Decimal("0"), "count": 0},
        )
        a["count"] += 1
        val = _current_value(pull.card)
        if val is not None:
            a["total"] += val
    ranked = sorted(agg.values(), key=lambda a: a["total"], reverse=True)[:LEADERBOARD_LIMIT]
    return [
        PullLeaderboardEntry(
            rank=i,
            handle=a["handle"],
            score=a["total"],
            showcase_public=a["is_public"],
            pull_count=a["count"],
        )
        for i, a in enumerate(ranked, start=1)
    ]
