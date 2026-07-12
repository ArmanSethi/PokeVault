"""User-scoped collection CRUD.

Every read and mutation is bounded by ``user_id`` so one user can never see or touch
another's entries. A "stack" is identified by
``(user_id, card_id, condition, is_foil, grade)`` — adding a matching stack increments its
quantity rather than creating a duplicate row.
"""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.limits import MAX_CARD_QTY, MIN_CARD_QTY, clamp_int
from app.models.card import Card
from app.models.collection import CollectionEntry
from app.schemas.collection import CollectionEntryCreate, CollectionEntryUpdate


class UnknownCard(Exception):
    """Raised when a create references a card id that isn't in the catalog."""


async def _reload_valued(session: AsyncSession, entry_id: int) -> CollectionEntry:
    """Reload an entry with its card + prices eager-loaded for a valued response."""
    stmt = (
        select(CollectionEntry)
        .options(selectinload(CollectionEntry.card).selectinload(Card.prices_current))
        .where(CollectionEntry.id == entry_id)
    )
    return (await session.execute(stmt)).scalar_one()


async def add_or_increment(
    session: AsyncSession, user_id: uuid.UUID, data: CollectionEntryCreate
) -> CollectionEntry:
    """Add a card to the user's collection, or bump quantity if the stack exists."""
    if await session.get(Card, data.card_id) is None:
        raise UnknownCard(data.card_id)

    stmt = select(CollectionEntry).where(
        CollectionEntry.user_id == user_id,
        CollectionEntry.card_id == data.card_id,
        CollectionEntry.condition.is_not_distinct_from(data.condition),
        CollectionEntry.grade.is_not_distinct_from(data.grade),
        CollectionEntry.is_foil == data.is_foil,
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()

    if existing is not None:
        # Clamp so repeated adds can't push a stack past the max (schema only bounds the
        # incoming delta, not the running total).
        existing.quantity = clamp_int(existing.quantity + data.quantity, MIN_CARD_QTY, MAX_CARD_QTY)
        entry_id = existing.id
    else:
        entry = CollectionEntry(
            user_id=user_id,
            card_id=data.card_id,
            quantity=data.quantity,
            condition=data.condition,
            grade=data.grade,
            is_foil=data.is_foil,
            acquired_price=data.acquired_price,
        )
        session.add(entry)
        await session.flush()
        entry_id = entry.id

    await session.commit()
    return await _reload_valued(session, entry_id)


async def update_entry(
    session: AsyncSession,
    user_id: uuid.UUID,
    entry_id: int,
    data: CollectionEntryUpdate,
) -> CollectionEntry | None:
    """Edit an owned entry; returns None if it doesn't exist or isn't the user's."""
    stmt = select(CollectionEntry).where(
        CollectionEntry.id == entry_id, CollectionEntry.user_id == user_id
    )
    entry = (await session.execute(stmt)).scalar_one_or_none()
    if entry is None:
        return None

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    await session.commit()
    return await _reload_valued(session, entry_id)


async def delete_entry(session: AsyncSession, user_id: uuid.UUID, entry_id: int) -> bool:
    """Remove an owned entry; returns False if it doesn't exist or isn't the user's."""
    stmt = delete(CollectionEntry).where(
        CollectionEntry.id == entry_id, CollectionEntry.user_id == user_id
    )
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount > 0
