"""Public-showcase business logic + sitemap generation.

Everything here is reachable without authentication, so it must expose only public-safe
data. Ownership stats and per-card market values are fine; cost basis (``acquired_price``)
and private ``notes`` are never projected.
"""

from __future__ import annotations

from xml.sax.saxutils import escape

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.card import Card, Set
from app.models.collection import CollectionEntry
from app.models.user import User
from app.schemas.public import PublicCollection, PublicEntry, PublicProfile
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
