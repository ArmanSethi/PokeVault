"""Card query + pricing-summary business logic.

Kept out of the route handlers per project conventions. The "primary" displayed
price is TCGPlayer (USD); ``select_primary_price`` encodes the variant preference.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.card import Card
from app.models.price import CardPriceCurrent
from app.schemas.card import CardPriceRead, CardRead

# TCGPlayer variant preference for the single headline price shown per card.
_VARIANT_PRIORITY = ("holofoil", "normal", "reverseHolofoil")


def select_primary_price(
    prices: Iterable[CardPriceCurrent],
    *,
    prefer: str | None = None,
) -> CardPriceCurrent | None:
    """Pick the TCGPlayer USD price row to display for a card.

    Prefers ``prefer`` (if given and present with a market price), then the
    ``_VARIANT_PRIORITY`` order, then any remaining TCGPlayer row with a market price.
    Returns ``None`` when the card has no TCGPlayer market price.
    """
    tcg = [p for p in prices if p.source == "tcgplayer" and p.market is not None]
    if not tcg:
        return None
    by_variant = {p.variant: p for p in tcg}
    order = ((prefer,) if prefer else ()) + _VARIANT_PRIORITY
    for variant in order:
        if variant in by_variant:
            return by_variant[variant]
    return tcg[0]


def _to_card_read(card: Card) -> CardRead:
    primary = select_primary_price(card.prices_current)
    return CardRead(
        id=card.id,
        set_id=card.set_id,
        number=card.number,
        name=card.name,
        rarity=card.rarity,
        image_url=card.image_small,
        prices=[CardPriceRead.model_validate(p) for p in card.prices_current],
        market_price=primary.market if primary else None,
        currency=primary.currency if primary else None,
    )


async def list_cards(
    session: AsyncSession,
    *,
    set_id: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[CardRead]:
    """List cards (with current prices), optionally filtered by set and name."""
    stmt = select(Card).options(selectinload(Card.prices_current))
    if set_id:
        stmt = stmt.where(Card.set_id == set_id)
    if q:
        stmt = stmt.where(Card.name.ilike(f"%{q}%"))
    stmt = stmt.order_by(Card.set_id, Card.number).limit(limit).offset(offset)
    result = await session.execute(stmt)
    cards: Sequence[Card] = result.scalars().all()
    return [_to_card_read(c) for c in cards]


async def get_card(session: AsyncSession, card_id: str) -> CardRead | None:
    """Fetch a single card with its current prices, or ``None`` if missing."""
    stmt = select(Card).options(selectinload(Card.prices_current)).where(Card.id == card_id)
    card = (await session.execute(stmt)).scalar_one_or_none()
    return _to_card_read(card) if card is not None else None


def market_price_for_entry(prices: Iterable[CardPriceCurrent], *, is_foil: bool) -> Decimal | None:
    """Unit TCGPlayer USD market price for a collection entry.

    Foil copies prefer the ``holofoil`` variant; non-foil prefer ``normal``. Both
    fall back through the standard variant priority.
    """
    primary = select_primary_price(prices, prefer="holofoil" if is_foil else "normal")
    return primary.market if primary else None
