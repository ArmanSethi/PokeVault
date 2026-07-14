"""Card query + pricing-summary business logic.

Kept out of the route handlers per project conventions. The "primary" displayed
price is TCGPlayer (USD); ``select_primary_price`` encodes the variant preference.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from decimal import Decimal
from typing import Literal

from sqlalchemy import Integer, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.card import Card, Set
from app.models.price import CardPriceCurrent
from app.schemas.card import CardPriceRead, CardRead, CardVariantPrice
from app.services.fx import to_usd

# Two markets for the same variant "diverge" (likely an edition mismatch) when, converted to a
# common currency, the higher is at least this multiple of the lower → a "verify edition" flag.
DIVERGENCE_RATIO = Decimal("2.5")

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


def base_variant_for_rarity(rarity: str | None) -> str:
    """The card's base TCGPlayer printing variant: holofoil for holo rarities, else normal.

    Used to assign a concrete variant to simulator pulls so a pull is valued at its own printing.
    """
    return "holofoil" if _is_holo_rarity(rarity) else "normal"


def _collector_number_order() -> tuple:
    """Order-by expressions for numeric-aware collector-number sorting.

    Pokémon collector numbers mix pure integers ("1".."102") with lettered subsets
    ("TG12", "SV107", "GG70"). Sort by the leading non-digit prefix (empty for mainline
    numbers, so they sort first), then the first run of digits cast to an *integer* (so
    2 < 10 < 102, not the lexical 1, 10, 102, 11), then the raw string as a final tiebreak.
    Lettered/edge numbers are kept, never dropped; a number with no digits sorts last within
    its prefix group. Applied in the query, so paging/ordering is correct — not display-only.
    """
    prefix = func.substring(Card.number, "^[^0-9]*")
    digits = cast(func.nullif(func.substring(Card.number, "[0-9]+"), ""), Integer)
    return (prefix.asc(), digits.asc().nullslast(), Card.number.asc())


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
    """Headline ``(market_price, "USD")`` for catalog display — always canonical USD.

    Prefers the rarity-appropriate TCGPlayer USD market price; then falls back to a CardMarket
    (EUR) market price **converted to USD** (via the stored FX rate), then a TCGPlayer
    ``mid``/``low`` estimate — so any card that carries *some* price data shows a value, and the
    number is always USD (never a EUR magnitude mislabeled as the display currency). Returns
    ``None`` only when the card has no usable price at all.
    """
    prices = list(prices)
    primary = select_primary_price(prices, rarity=rarity)
    if primary is not None:
        return primary.market, "USD"
    # Fallback 1: CardMarket market (EUR) → USD, so the headline stays single-currency.
    cardmarket = next(
        (p for p in prices if p.source == "cardmarket" and p.market is not None), None
    )
    if cardmarket is not None:
        usd = to_usd(cardmarket.market, cardmarket.currency, settings.EUR_USD_RATE)
        if usd is not None:
            return usd, "USD"
    # Fallback 2: a TCGPlayer row lacking market but carrying a mid/low estimate (USD).
    by_variant = {p.variant: p for p in prices if p.source == "tcgplayer"}
    for variant in _base_variant_order(rarity):
        row = by_variant.get(variant)
        if row is not None and (row.mid is not None or row.low is not None):
            return (row.mid if row.mid is not None else row.low), "USD"
    return None


def _variant_prices(
    prices: Iterable[CardPriceCurrent], *, rarity: str | None
) -> list[CardVariantPrice]:
    """Pair the two markets per printing for the detail view, flagging divergences.

    Ordered base-printing-first (rarity-aware), then any remaining variants. A variant appears
    if either market has a row for it; ``diverges`` is set only when both are present and, in a
    common currency, one is ≥ DIVERGENCE_RATIO× the other.
    """
    prices = list(prices)
    tcg = {p.variant: p for p in prices if p.source == "tcgplayer"}
    cm = {p.variant: p for p in prices if p.source == "cardmarket"}
    ordered = list(dict.fromkeys([*_base_variant_order(rarity), *tcg, *cm]))
    out: list[CardVariantPrice] = []
    for v in ordered:
        t, c = tcg.get(v), cm.get(v)
        if t is None and c is None:
            continue
        tcg_usd = t.market if t else None
        cm_eur = c.market if c else None
        diverges = False
        if tcg_usd is not None and cm_eur is not None:
            cm_usd = to_usd(cm_eur, "EUR", settings.EUR_USD_RATE)
            if cm_usd and tcg_usd:
                hi, lo = max(tcg_usd, cm_usd), min(tcg_usd, cm_usd)
                diverges = lo > 0 and (hi / lo) >= DIVERGENCE_RATIO
        out.append(
            CardVariantPrice(
                variant=v, tcgplayer_usd=tcg_usd, cardmarket_eur=cm_eur, diverges=diverges
            )
        )
    return out


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
        variants=_variant_prices(card.prices_current, rarity=card.rarity),
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
        # Group by set in chronological release order (oldest first → Base Set first), then
        # numeric collector number within each set. Joins sets for release_date.
        stmt = stmt.join(Card.set).order_by(
            Set.release_date.asc().nullslast(),
            Card.set_id.asc(),
            *_collector_number_order(),
        )

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


def _entry_variant(*, is_foil: bool, variant: str | None) -> str:
    """The TCGPlayer variant to price a copy at: its explicit ``variant`` if recorded, else
    derived from the legacy ``is_foil`` flag (holofoil if foil, else normal)."""
    return variant or ("holofoil" if is_foil else "normal")


def market_price_for_entry(
    prices: Iterable[CardPriceCurrent], *, is_foil: bool, variant: str | None = None
) -> Decimal | None:
    """Unit TCGPlayer USD market price for a collection entry / vault pull.

    Prices at the copy's exact ``variant`` when recorded (e.g. reverseHolofoil, 1stEdition),
    else derives it from ``is_foil``. Falls back through the standard variant priority.
    """
    primary = select_primary_price(prices, prefer=_entry_variant(is_foil=is_foil, variant=variant))
    return primary.market if primary else None


def unit_price_usd(
    prices: Iterable[CardPriceCurrent],
    *,
    is_foil: bool,
    eur_usd_rate: float,
    variant: str | None = None,
) -> Decimal | None:
    """Unit market price in **USD** for a copy, at its variant, for portfolio/vault valuation.

    Prefers the TCGPlayer USD market price for the copy's variant (``market_price_for_entry``);
    when TCGPlayer has none, falls back to the CardMarket (EUR) price of the SAME variant (else
    any CardMarket market), converted to USD (``services/fx.to_usd``) so currencies are never
    mixed in a total. Returns ``None`` only when the card has no usable price in either source.
    """
    prices = list(prices)
    tcg = market_price_for_entry(prices, is_foil=is_foil, variant=variant)
    if tcg is not None:
        return tcg
    prefer = _entry_variant(is_foil=is_foil, variant=variant)
    cms = [p for p in prices if p.source == "cardmarket" and p.market is not None]
    cardmarket = next((p for p in cms if p.variant == prefer), None) or (cms[0] if cms else None)
    if cardmarket is None:
        return None
    return to_usd(cardmarket.market, cardmarket.currency, eur_usd_rate)
