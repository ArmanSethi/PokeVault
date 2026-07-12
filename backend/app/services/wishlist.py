"""Wishlist CRUD + valuation.

Each item is user-scoped and unique per (user, card). Adding an existing card updates its
target price rather than duplicating. Current market price is the card's rarity-appropriate
TCGPlayer USD value (same primary-price logic used everywhere else).
"""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.card import Card
from app.models.wishlist import WishlistItem
from app.schemas.wishlist import WishlistItemCreate, WishlistItemRead
from app.services.cards import select_primary_price
from app.services.collection import UnknownCard


async def add_or_update(
    session: AsyncSession, user_id: uuid.UUID, data: WishlistItemCreate
) -> WishlistItem:
    """Add a card to the wishlist, or update its target price if already present."""
    if await session.get(Card, data.card_id) is None:
        raise UnknownCard(data.card_id)

    stmt = select(WishlistItem).where(
        WishlistItem.user_id == user_id, WishlistItem.card_id == data.card_id
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        existing.target_price = data.target_price
        item_id = existing.id
    else:
        item = WishlistItem(user_id=user_id, card_id=data.card_id, target_price=data.target_price)
        session.add(item)
        await session.flush()
        item_id = item.id
    await session.commit()
    return await session.get(WishlistItem, item_id)


async def remove(session: AsyncSession, user_id: uuid.UUID, item_id: int) -> bool:
    """Delete an owned wishlist item; False if it isn't the user's or doesn't exist."""
    stmt = delete(WishlistItem).where(WishlistItem.id == item_id, WishlistItem.user_id == user_id)
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount > 0


async def list_with_value(session: AsyncSession, user_id: uuid.UUID) -> list[WishlistItemRead]:
    """List the user's wishlist, each enriched with the card's current market price."""
    stmt = (
        select(WishlistItem)
        .where(WishlistItem.user_id == user_id)
        .options(selectinload(WishlistItem.card).selectinload(Card.prices_current))
        .order_by(WishlistItem.id)
    )
    items = (await session.execute(stmt)).scalars().all()
    out: list[WishlistItemRead] = []
    for item in items:
        card = item.card
        primary = select_primary_price(card.prices_current, rarity=card.rarity)
        out.append(
            WishlistItemRead(
                id=item.id,
                card_id=item.card_id,
                target_price=item.target_price,
                created_at=item.created_at,
                name=card.name,
                set_id=card.set_id,
                number=card.number,
                image_url=card.image_small,
                market_price=primary.market if primary else None,
                currency=primary.currency if primary else None,
            )
        )
    return out
