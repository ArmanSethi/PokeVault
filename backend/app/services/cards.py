"""Card query + pricing-summary business logic.

Kept out of the route handlers per project conventions. The "primary" displayed
price is TCGPlayer (USD); ``select_primary_price`` encodes the variant preference.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from decimal import Decimal
from typing import Literal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.card import Card
from app.models.price import CardPriceCurrent
from app.schemas.card import CardPriceRead, CardRead

# Sort options exposed by the catalog list endpoint.
CardSort = Literal["number", "name", "rarity", "price_desc", "price_asc"]

# TCGPlayer variant preference for a card's single headline price. The *base printing*
# differs by card type: a "Rare Holo" is fundamentally the holofoil, while a Common is the
# normal. Using one fixed order inflates commons (their pricey holofoil variant wins) and
# would understate holo rares. So the order is chosen from the card's rarity.
_HOLO_VARIANT_ORDER = ("holofoil", "reverseHolofoil", "normal")
_NONHOLO_VARIANT_ORDER = ("normal", "reverseHolofoil", "holofoil")

# Back-compat: the generic order used by the history service's default-variant pick.
_VARIANT_PRIORITY = ("holofoil", "normal", "reverseHolofoil")


def _is_holo_rarity(rarity: str | None) -> bool:
    """True when a card's base printing is a holofoil (its rarity mentions 'Holo')."""
    return rarity is not None and "holo" in rarity.lower()


def _base_variant_order(rarity: str | None) -> tuple[str, ...]:
    """Variant preference for the card's base printing, keyed off its rarity."""
    return _HOLO_VARIANT_ORDER if _is_holo_rarity(rarity) else _NONHOLO_VARIANT_ORDER


def select_primary_price(
    prices: Iterable[CardPriceCurrent],
    *,
    prefer: str | None = None,
    rarity: str | None = None,
) -> CardPriceCurrent | None:
    """Pick the TCGPlayer USD price row to display for a card.

    Prefers ``prefer`` (if given and present with a market price), then the rarity-appropriate
    base-printing order (``rarity``), then any remaining TCGPlayer row with a market price.
    Returns ``None`` when the card has no TCGPlayer market price.
    """
    tcg = [p for p in prices if p.source == "tcgplayer" and p.market is not None]
    if not tcg:
        return None
    by_variant = {p.variant: p for p in tcg}
    order = ((prefer,) if prefer else ()) + _base_variant_order(rarity)
    for variant in order:
        if variant in by_variant:
            return by_variant[variant]
    return tcg[0]


def select_display_price(
    prices: Iterable[CardPriceCurrent],
    *,
    rarity: str | None = None,
) -> tuple[Decimal, str] | None:
    """Headline ``(market_price, currency)`` for catalog display.

    Prefers the rarity-appropriate TCGPlayer USD market price; then falls back to a
    CardMarket (EUR) market price, then a TCGPlayer ``mid``/``low`` estimate — so any card
    that carries *some* price data shows a value instead of a blank. Returns ``None`` only
    when the card has no usable price at all.

    Display only. Portfolio valuation stays single-currency TCGPlayer-USD (see
    ``market_price_for_entry``); this must not feed collection totals or the EUR fallback
    would corrupt them.
    """
    prices = list(prices)
    primary = select_primary_price(prices, rarity=rarity)
    if primary is not None:
        return primary.market, primary.currency
    # Fallback 1: CardMarket market price (EUR) — cards with no TCGPlayer market row.
    cardmarket = next(
        (p for p in prices if p.source == "cardmarket" and p.market is not None), None
    )
    if cardmarket is not None:
        return cardmarket.market, cardmarket.currency
    # Fallback 2: a TCGPlayer row lacking market but carrying a mid/low estimate (USD).
    by_variant = {p.variant: p for p in prices if p.source == "tcgplayer"}
    for variant in _base_variant_order(rarity):
        row = by_variant.get(variant)
        if row is not None and (row.mid is not None or row.low is not None):
            return (row.mid if row.mid is not None else row.low), row.currency
    return None


def _to_card_read(card: Card) -> CardRead:
    headline = select_display_price(card.prices_current, rarity=card.rarity)
    market_price, currency = headline if headline is not None else (None, None)
    return CardRead(
        id=card.id,
        set_id=card.set_id,
        number=card.number,
        name=card.name,
        rarity=card.rarity,
        image_url=card.image_small,
        prices=[CardPriceRead.model_validate(p) for p in card.prices_current],
        market_price=market_price,
        currency=currency,
    )


async def list_cards(
    session: AsyncSession,
    *,
    set_id: str | None = None,
    q: str | None = None,
    rarity: str | None = None,
    sort: CardSort = "number",
    limit: int = 50,
    offset: int = 0,
) -> list[CardRead]:
    """List cards (with current prices), filtered by set/name/rarity and sorted.

    ``q`` matches the card name or collector number (case-insensitive). Price sorts rank
    by the same rarity-aware headline value shown on each card (see ``select_display_price``):
    the base-printing TCGPlayer variant, falling back to CardMarket. Cards without a usable
    price sort last either way. (The fallback mixes USD/EUR magnitudes, as the display does;
    this is a browse-ordering proxy, not a currency-normalized ranking.)
    """
    stmt = select(Card).options(selectinload(Card.prices_current))
    if set_id:
        stmt = stmt.where(Card.set_id == set_id)
    if q:
        stmt = stmt.where(Card.name.ilike(f"%{q}%") | Card.number.ilike(f"%{q}%"))
    if rarity:
        stmt = stmt.where(Card.rarity == rarity)

    if sort in ("price_desc", "price_asc"):
        # Pivot each card's TCGPlayer market prices out by variant so the headline variant
        # can be chosen per card (matching select_display_price / _base_variant_order).
        tcg = (
            select(
                CardPriceCurrent.card_id,
                func.max(
                    case((CardPriceCurrent.variant == "normal", CardPriceCurrent.market))
                ).label("normal"),
                func.max(
                    case((CardPriceCurrent.variant == "holofoil", CardPriceCurrent.market))
                ).label("holofoil"),
                func.max(
                    case((CardPriceCurrent.variant == "reverseHolofoil", CardPriceCurrent.market))
                ).label("reverse"),
            )
            .where(CardPriceCurrent.source == "tcgplayer")
            .group_by(CardPriceCurrent.card_id)
            .subquery()
        )
        # CardMarket market as the display fallback for cards with no TCGPlayer market.
        cm = (
            select(
                CardPriceCurrent.card_id,
                func.max(CardPriceCurrent.market).label("market"),
            )
            .where(CardPriceCurrent.source == "cardmarket")
            .group_by(CardPriceCurrent.card_id)
            .subquery()
        )
        stmt = stmt.outerjoin(tcg, Card.id == tcg.c.card_id).outerjoin(cm, Card.id == cm.c.card_id)
        # Holo rarities headline on the holofoil printing; everything else on normal — with
        # the same fallbacks as the displayed price. NULL rarity falls into the else branch.
        tcg_headline = case(
            (
                Card.rarity.ilike("%holo%"),
                func.coalesce(tcg.c.holofoil, tcg.c.reverse, tcg.c.normal),
            ),
            else_=func.coalesce(tcg.c.normal, tcg.c.reverse, tcg.c.holofoil),
        )
        col = func.coalesce(tcg_headline, cm.c.market)
        order = col.desc() if sort == "price_desc" else col.asc()
        stmt = stmt.order_by(order.nullslast(), Card.set_id, Card.number)
    elif sort == "name":
        stmt = stmt.order_by(Card.name, Card.set_id, Card.number)
    elif sort == "rarity":
        stmt = stmt.order_by(Card.rarity.nullslast(), Card.set_id, Card.number)
    else:  # "number"
        stmt = stmt.order_by(Card.set_id, Card.number)

    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    cards: Sequence[Card] = result.scalars().all()
    return [_to_card_read(c) for c in cards]


async def list_rarities(session: AsyncSession) -> list[str]:
    """Distinct non-null rarities present in the catalog (for a filter dropdown)."""
    rows = (
        (
            await session.execute(
                select(Card.rarity).where(Card.rarity.is_not(None)).distinct().order_by(Card.rarity)
            )
        )
        .scalars()
        .all()
    )
    return list(rows)


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
