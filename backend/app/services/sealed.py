"""User-scoped CRUD for sealed product.

Every read and mutation is bounded by ``user_id`` so one user can never see or touch another's
items. Fully separate from ``collection_entries`` and ``pack_pulls`` — no cross-writes. Unlike
collection cards, sealed items do NOT stack: each create is its own row; ``quantity`` is edited in
place via update.
"""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.limits import MAX_SEALED_QTY, MIN_SEALED_QTY, clamp_int
from app.models.card import Set
from app.models.sealed_item import SealedItem
from app.schemas.sealed import SealedItemCreate, SealedItemRead, SealedItemUpdate


class UnknownSet(Exception):
    """Raised when a create/update references a set id that isn't in the catalog."""


def to_read(item: SealedItem) -> SealedItemRead:
    """Serialize an ORM item, resolving the linked set's name (``set`` must be eager-loaded)."""
    return SealedItemRead(
        id=item.id,
        product_type=item.product_type,
        set_id=item.set_id,
        set_name=item.set.name if item.set is not None else None,
        quantity=item.quantity,
        value=item.value,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


async def _reload(session: AsyncSession, item_id: int) -> SealedItem:
    """Reload an item with its set eager-loaded for a complete response."""
    stmt = select(SealedItem).options(selectinload(SealedItem.set)).where(SealedItem.id == item_id)
    return (await session.execute(stmt)).scalar_one()


async def _validate_set(session: AsyncSession, set_id: str | None) -> None:
    if set_id is not None and await session.get(Set, set_id) is None:
        raise UnknownSet(set_id)


async def list_items(session: AsyncSession, user_id: uuid.UUID) -> list[SealedItem]:
    """List the user's sealed items, newest first."""
    stmt = (
        select(SealedItem)
        .options(selectinload(SealedItem.set))
        .where(SealedItem.user_id == user_id)
        .order_by(SealedItem.created_at.desc(), SealedItem.id.desc())
    )
    return list((await session.execute(stmt)).scalars().all())


async def create_item(
    session: AsyncSession, user_id: uuid.UUID, data: SealedItemCreate
) -> SealedItem:
    """Add a sealed product (no stacking — always a new row)."""
    await _validate_set(session, data.set_id)
    item = SealedItem(
        user_id=user_id,
        product_type=data.product_type,
        set_id=data.set_id,
        quantity=clamp_int(data.quantity, MIN_SEALED_QTY, MAX_SEALED_QTY),
        value=data.value,
    )
    session.add(item)
    await session.flush()
    item_id = item.id
    await session.commit()
    return await _reload(session, item_id)


async def update_item(
    session: AsyncSession,
    user_id: uuid.UUID,
    item_id: int,
    data: SealedItemUpdate,
) -> SealedItem | None:
    """Edit an owned item; returns None if it doesn't exist or isn't the user's."""
    stmt = select(SealedItem).where(SealedItem.id == item_id, SealedItem.user_id == user_id)
    item = (await session.execute(stmt)).scalar_one_or_none()
    if item is None:
        return None

    fields = data.model_dump(exclude_unset=True)
    if "set_id" in fields:
        await _validate_set(session, fields["set_id"])
    for field, value in fields.items():
        setattr(item, field, value)
    await session.commit()
    return await _reload(session, item_id)


async def delete_item(session: AsyncSession, user_id: uuid.UUID, item_id: int) -> bool:
    """Remove an owned item; returns False if it doesn't exist or isn't the user's."""
    stmt = delete(SealedItem).where(SealedItem.id == item_id, SealedItem.user_id == user_id)
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount > 0
