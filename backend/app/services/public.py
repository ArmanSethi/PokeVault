"""Public-showcase business logic + sitemap generation.

Everything here is reachable without authentication, so it must expose only public-safe
data. Ownership stats and per-card market values are fine; cost basis (``acquired_price``)
and private ``notes`` are never projected.
"""

from __future__ import annotations

import time
from decimal import Decimal
from xml.sax.saxutils import escape

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.card import Card, Set
from app.models.collection import CollectionEntry
from app.models.price import CardPriceCurrent
from app.models.user import User
from app.schemas.public import LeaderboardEntry, PublicCollection, PublicEntry, PublicProfile
from app.services.achievements import CollectorStats, compute_xp, level_for_xp
from app.services.cards import market_price_for_entry
from app.services.valuation import collection_summary


async def _public_user(session: AsyncSession, handle: str) -> User | None:
    """The user owning ``handle`` iff their showcase is public, else None."""
    stmt = select(User).where(User.handle == handle, User.is_public.is_(True))
    return (await session.execute(stmt)).scalar_one_or_none()


async def public_profile(session: AsyncSession, handle: str) -> PublicProfile | None:
    """Headline stats for a public showcase, or None if the handle isn't public."""
    user = await _public_user(session, handle)
    if user is None:
        return None
    # graded=False: public values (headline total, per-set, per-card) all use raw prices,
    # so the profile total agrees with the sum of the publicly shown cards.
    summary = await collection_summary(session, user.id, graded=False)
    sets_completed = sum(1 for s in summary.sets if s.completion_pct >= 1.0)
    # Collector level uses the public-safe subset of the same XP formula (no cost basis).
    xp = compute_xp(
        CollectorStats(
            distinct_cards=summary.total_distinct_cards,
            total_quantity=summary.total_quantity,
            total_value=float(summary.total_market_value),
            sets_completed=sets_completed,
            has_foil=False,
            has_graded=False,
        )
    )
    level, _into, _need = level_for_xp(xp)
    return PublicProfile(
        handle=handle,
        level=level,
        total_distinct_cards=summary.total_distinct_cards,
        total_quantity=summary.total_quantity,
        total_market_value=summary.total_market_value,
        currency=summary.currency,
        sets_completed=sets_completed,
        sets=summary.sets,
    )


async def public_collection(session: AsyncSession, handle: str) -> PublicCollection | None:
    """A public showcase's card list, projected to public-safe fields only."""
    user = await _public_user(session, handle)
    if user is None:
        return None
    stmt = (
        select(CollectionEntry)
        .where(CollectionEntry.user_id == user.id)
        .options(selectinload(CollectionEntry.card).selectinload(Card.prices_current))
        .order_by(CollectionEntry.id)
    )
    entries = (await session.execute(stmt)).scalars().all()
    projected: list[PublicEntry] = []
    for e in entries:
        card = e.card
        unit = market_price_for_entry(card.prices_current, is_foil=e.is_foil)
        projected.append(
            PublicEntry(
                card_id=e.card_id,
                name=card.name,
                set_id=card.set_id,
                number=card.number,
                image_url=card.image_small,
                rarity=card.rarity,
                is_foil=e.is_foil,
                quantity=e.quantity,
                market_price=unit,
                market_value=(unit * e.quantity if unit is not None else None),
            )
        )
    return PublicCollection(handle=handle, entries=projected)


# ---- public leaderboard ---------------------------------------------------

# The leaderboard is identical for every viewer and expensive-ish to compute, so cache it
# briefly in-process. A user toggling private / hide-value reflects within this window.
_LB_TTL_SECONDS = 60.0
_lb_cache: dict[int, tuple[float, list[LeaderboardEntry]]] = {}


async def leaderboard(session: AsyncSession, *, limit: int = 100) -> list[LeaderboardEntry]:
    """Top ``limit`` PUBLIC users ranked by true portfolio value (TCGPlayer USD, descending).

    Privacy: the ``is_public`` filter is the sole gate — private users are never selected,
    counted, or valued. Ranking always uses the true value; a user's hide-value preference only
    nulls ``value_usd`` in the response (they keep their rank). One aggregate query, cached.
    """
    now = time.monotonic()
    hit = _lb_cache.get(limit)
    if hit is not None and now - hit[0] < _LB_TTL_SECONDS:
        return hit[1]

    # Pivot each card's TCGPlayer (USD) market prices by variant — same source as the rest of
    # the app's valuation (CardMarket/EUR is intentionally excluded, so no currency mixing).
    tcg = (
        select(
            CardPriceCurrent.card_id,
            func.max(case((CardPriceCurrent.variant == "normal", CardPriceCurrent.market))).label(
                "normal"
            ),
            func.max(case((CardPriceCurrent.variant == "holofoil", CardPriceCurrent.market))).label(
                "holofoil"
            ),
            func.max(
                case((CardPriceCurrent.variant == "reverseHolofoil", CardPriceCurrent.market))
            ).label("reverse"),
        )
        .where(CardPriceCurrent.source == "tcgplayer")
        .group_by(CardPriceCurrent.card_id)
        .subquery()
    )
    holo = Card.rarity.ilike("%holo%")
    # Per-entry unit price, mirroring market_price_for_entry (prefer holofoil for foil / normal
    # otherwise, with a rarity-aware fallback). NULL (no TCGPlayer price) contributes nothing.
    unit = case(
        (
            CollectionEntry.is_foil.is_(True) & holo,
            func.coalesce(tcg.c.holofoil, tcg.c.reverse, tcg.c.normal),
        ),
        (
            CollectionEntry.is_foil.is_(True),
            func.coalesce(tcg.c.holofoil, tcg.c.normal, tcg.c.reverse),
        ),
        (holo, func.coalesce(tcg.c.normal, tcg.c.holofoil, tcg.c.reverse)),
        else_=func.coalesce(tcg.c.normal, tcg.c.reverse, tcg.c.holofoil),
    )
    line_value = func.coalesce(unit, 0) * CollectionEntry.quantity
    value_col = func.coalesce(func.sum(line_value), 0)

    stmt = (
        select(
            User.handle,
            User.show_value_on_leaderboard,
            func.count(func.distinct(CollectionEntry.card_id)).label("card_count"),
            value_col.label("value"),
        )
        .join(CollectionEntry, CollectionEntry.user_id == User.id)
        .join(Card, Card.id == CollectionEntry.card_id)
        .outerjoin(tcg, tcg.c.card_id == CollectionEntry.card_id)
        .where(User.is_public.is_(True), User.handle.is_not(None))
        .group_by(User.id, User.handle, User.show_value_on_leaderboard)
        .order_by(value_col.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()

    entries = [
        LeaderboardEntry(
            rank=i,
            handle=r.handle,
            card_count=r.card_count,
            value_usd=(Decimal(str(r.value)) if r.show_value_on_leaderboard else None),
            value_hidden=not r.show_value_on_leaderboard,
        )
        for i, r in enumerate(rows, start=1)
    ]
    _lb_cache[limit] = (now, entries)
    return entries


def _url(path: str) -> str:
    return escape(f"{settings.PUBLIC_WEB_ORIGIN.rstrip('/')}{path}")


async def build_sitemap(session: AsyncSession) -> str:
    """Build a sitemap.xml enumerating sets, cards, and public showcases.

    URLs point at the public web origin (the indexable SPA), not the API host — see
    ``PUBLIC_WEB_ORIGIN``. One flat sitemap is well within the 50k-URL spec limit.
    """
    set_ids = (await session.execute(select(Set.id))).scalars().all()
    card_ids = (await session.execute(select(Card.id))).scalars().all()
    handles = (
        (await session.execute(select(User.handle).where(User.is_public.is_(True)))).scalars().all()
    )

    parts: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f"<url><loc>{_url('/')}</loc></url>",
    ]
    parts.extend(f"<url><loc>{_url(f'/sets/{sid}')}</loc></url>" for sid in set_ids)
    parts.extend(f"<url><loc>{_url(f'/cards/{cid}')}</loc></url>" for cid in card_ids)
    parts.extend(f"<url><loc>{_url(f'/u/{h}')}</loc></url>" for h in handles if h)
    parts.append("</urlset>")
    return "".join(parts)
