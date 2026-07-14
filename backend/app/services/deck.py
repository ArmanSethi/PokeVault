"""Dream-deck CRUD + valuation.

Decks are private and user-scoped (like the collection/wishlist) but stored separately — a
deck says nothing about what a user owns. A deck's value reuses the canonical USD unit price
(``cards.unit_price_usd``: TCGPlayer USD, CardMarket EUR converted first), summed over
``price × quantity``. Decks carry no grade/foil, so no PSA multiplier applies; a card with no
usable price contributes 0 (never NaN).
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.limits import MAX_CARD_QTY, MIN_CARD_QTY, clamp_int
from app.models.card import Card
from app.models.deck import Deck, DeckCard
from app.schemas.deck import DeckCardCreate, DeckCardRead, DeckCreate, DeckRead, DeckUpdate
from app.services.cards import unit_price_usd
from app.services.collection import UnknownCard


def _to_deck_read(deck: Deck, *, eur_usd_rate: float) -> DeckRead:
    """Build the enriched read model: per-card USD price, count, and total value."""
    cards: list[DeckCardRead] = []
    total = Decimal("0")
    count = 0
    for dc in deck.cards:
        card = dc.card
        unit = unit_price_usd(card.prices_current, is_foil=False, eur_usd_rate=eur_usd_rate)
        count += dc.quantity
        if unit is not None:
            total += unit * dc.quantity
        cards.append(
            DeckCardRead(
                card_id=dc.card_id,
                quantity=dc.quantity,
                name=card.name,
                set_id=card.set_id,
                number=card.number,
                image_url=card.image_small,
                market_price=unit,
            )
        )
    return DeckRead(
        id=deck.id,
        name=deck.name,
        target_size=deck.target_size,
        created_at=deck.created_at,
        card_count=count,
        total_value=total,
        cards=cards,
    )


async def _load_deck(session: AsyncSession, user_id: uuid.UUID, deck_id: int) -> Deck | None:
    """Load one of the user's decks with its cards + prices eager-loaded, or None."""
    stmt = (
        select(Deck)
        .where(Deck.id == deck_id, Deck.user_id == user_id)
        .options(
            selectinload(Deck.cards).selectinload(DeckCard.card).selectinload(Card.prices_current)
        )
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_decks(session: AsyncSession, user_id: uuid.UUID) -> list[DeckRead]:
    """All of the user's decks (each with cards, count, and total value)."""
    rate = settings.EUR_USD_RATE
    stmt = (
        select(Deck)
        .where(Deck.user_id == user_id)
        .options(
            selectinload(Deck.cards).selectinload(DeckCard.card).selectinload(Card.prices_current)
        )
        .order_by(Deck.created_at, Deck.id)
    )
    decks = (await session.execute(stmt)).scalars().all()
    return [_to_deck_read(d, eur_usd_rate=rate) for d in decks]


async def get_deck(session: AsyncSession, user_id: uuid.UUID, deck_id: int) -> DeckRead | None:
    deck = await _load_deck(session, user_id, deck_id)
    return _to_deck_read(deck, eur_usd_rate=settings.EUR_USD_RATE) if deck is not None else None


async def create_deck(session: AsyncSession, user_id: uuid.UUID, data: DeckCreate) -> DeckRead:
    deck = Deck(user_id=user_id, name=data.name, target_size=data.target_size)
    session.add(deck)
    await session.flush()
    deck_id = deck.id
    await session.commit()
    result = await get_deck(session, user_id, deck_id)
    assert result is not None  # just created
    return result


async def update_deck(
    session: AsyncSession, user_id: uuid.UUID, deck_id: int, data: DeckUpdate
) -> DeckRead | None:
    deck = await _load_deck(session, user_id, deck_id)
    if deck is None:
        return None
    if data.name is not None:
        deck.name = data.name
    if data.target_size is not None:
        deck.target_size = data.target_size
    await session.commit()
    return await get_deck(session, user_id, deck_id)


async def delete_deck(session: AsyncSession, user_id: uuid.UUID, deck_id: int) -> bool:
    """Delete a deck (cards cascade); False if it isn't the user's or doesn't exist."""
    result = await session.execute(delete(Deck).where(Deck.id == deck_id, Deck.user_id == user_id))
    await session.commit()
    return result.rowcount > 0


async def add_card(
    session: AsyncSession, user_id: uuid.UUID, deck_id: int, data: DeckCardCreate
) -> DeckRead | None:
    """Add a card to the deck, or increment its quantity if already present.

    Returns None if the deck isn't the user's; raises ``UnknownCard`` if the card_id is
    not in the catalog.
    """
    deck = await _load_deck(session, user_id, deck_id)
    if deck is None:
        return None
    if await session.get(Card, data.card_id) is None:
        raise UnknownCard(data.card_id)

    # The deck's target size is a hard cap on total cards: never add past it. Add only as many as
    # fit; once the deck is full (total == target_size), adding is a no-op.
    current_total = sum(c.quantity for c in deck.cards)
    room = deck.target_size - current_total
    if room <= 0:
        return await get_deck(session, user_id, deck_id)
    add_qty = min(data.quantity, room)

    existing = next((c for c in deck.cards if c.card_id == data.card_id), None)
    if existing is not None:
        # Clamp the running total (schema only bounds the incoming delta).
        existing.quantity = clamp_int(existing.quantity + add_qty, MIN_CARD_QTY, MAX_CARD_QTY)
    else:
        # Mutate through the relationship so the loaded deck (and the reload below, which
        # returns the same identity-mapped instance) reflects the change immediately.
        deck.cards.append(DeckCard(card_id=data.card_id, quantity=add_qty))
    await session.commit()
    return await get_deck(session, user_id, deck_id)


async def set_card_quantity(
    session: AsyncSession, user_id: uuid.UUID, deck_id: int, card_id: str, quantity: int
) -> DeckRead | None:
    """Set a deck card's quantity. Returns None if the deck/card isn't found for the user."""
    deck = await _load_deck(session, user_id, deck_id)
    if deck is None:
        return None
    dc = next((c for c in deck.cards if c.card_id == card_id), None)
    if dc is None:
        return None
    # Respect the deck's target-size cap: this card's quantity can't push the deck past target.
    others = sum(c.quantity for c in deck.cards if c.card_id != card_id)
    ceiling = min(MAX_CARD_QTY, max(MIN_CARD_QTY, deck.target_size - others))
    dc.quantity = clamp_int(quantity, MIN_CARD_QTY, ceiling)
    await session.commit()
    return await get_deck(session, user_id, deck_id)


async def remove_card(
    session: AsyncSession, user_id: uuid.UUID, deck_id: int, card_id: str
) -> DeckRead | None:
    """Remove a card from the deck. Returns None if the deck isn't the user's."""
    deck = await _load_deck(session, user_id, deck_id)
    if deck is None:
        return None
    dc = next((c for c in deck.cards if c.card_id == card_id), None)
    if dc is not None:
        # Remove via the relationship (delete-orphan cascades the row delete) so the loaded
        # deck reflects the removal without a stale reload.
        deck.cards.remove(dc)
    await session.commit()
    return await get_deck(session, user_id, deck_id)
