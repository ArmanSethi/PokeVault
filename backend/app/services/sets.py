"""Set query business logic (read-only catalog browsing).

Kept out of the route handlers per project conventions. Sets are returned newest-first
(by release date) so a browse UI leads with the latest expansions.
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card import Set
from app.schemas.card import SetRead


async def list_sets(
    session: AsyncSession,
    *,
    q: str | None = None,
    limit: int = 250,
    offset: int = 0,
) -> list[SetRead]:
    """List sets newest-first, optionally filtered by a case-insensitive name search."""
    stmt = select(Set)
    if q:
        stmt = stmt.where(Set.name.ilike(f"%{q}%"))
    stmt = stmt.order_by(Set.release_date.desc().nullslast(), Set.id).limit(limit).offset(offset)
    rows: Sequence[Set] = (await session.execute(stmt)).scalars().all()
    return [SetRead.model_validate(s) for s in rows]


async def get_set(session: AsyncSession, set_id: str) -> SetRead | None:
    """Fetch a single set by id (e.g. ``sv3``), or ``None`` if missing."""
    s = (await session.execute(select(Set).where(Set.id == set_id))).scalar_one_or_none()
    return SetRead.model_validate(s) if s is not None else None
