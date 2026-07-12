"""Pack simulator: approximate, rarity-weighted pack opening for any set.

The odds are intentionally APPROXIMATE — Pokémon doesn't publish official pull rates and real
pack structure varies by set/era. We use a fixed slot template (commons + uncommons + one
rarity-weighted "hit") and estimated cross-tier weights, keyed off each card's ``rarity``.
Pulls are generated server-side so the odds can't be manipulated by the client.

The odds logic (``build_pack``) is pure and operates on cards already bucketed by tier, so it
is unit-testable without a database.
"""

from __future__ import annotations

import random
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.card import Card, Set
from app.models.pack_open import PackOpen
from app.schemas.card import CardRead
from app.schemas.simulator import PackResult, PulledCard
from app.services.cards import _to_card_read, unit_price_usd

COMMON = "common"
UNCOMMON = "uncommon"

# Free packs per user per UTC day. Opening consumes quota even if every card is discarded.
DAILY_PACK_LIMIT = 2


class QuotaExceeded(Exception):
    """Raised when a user has already opened their daily pack allowance."""


# Default slot template (tunable). 6 commons + 3 uncommons + 1 rarity-weighted hit = 10.
SLOT_TEMPLATE: list[tuple[str, int]] = [(COMMON, 6), (UNCOMMON, 3), ("hit", 1)]

# Hit-slot tiers, rarest weight last. Weights are relative + approximate; only tiers actually
# present in the chosen set are used, then normalized across those.
HIT_TIERS = ["rare", "holo", "ultra", "illustration", "secret"]
HIT_WEIGHTS = {"rare": 50, "holo": 26, "ultra": 15, "illustration": 6, "secret": 3}

# Map each real pokemontcg.io rarity string to a hit tier (Common/Uncommon handled separately;
# Promo/unknown/null fall through to the generic fallback pool).
_TIER_RARITIES: dict[str, list[str]] = {
    "rare": ["Rare"],
    "holo": [
        "Rare Holo",
        "Rare Shining",
        "Rare Holo Star",
        "Rare Prime",
        "Rare BREAK",
        "LEGEND",
        "Classic Collection",
        "Black White Rare",
    ],
    "ultra": [
        "Rare Ultra",
        "Ultra Rare",
        "Rare Holo EX",
        "Rare Holo GX",
        "Rare Holo V",
        "Rare Holo VMAX",
        "Rare Holo VSTAR",
        "Double Rare",
        "Rare Holo LV.X",
        "ACE SPEC Rare",
        "Rare ACE",
        "Rare Prism Star",
        "Amazing Rare",
        "Radiant Rare",
    ],
    "illustration": ["Illustration Rare", "Special Illustration Rare", "Trainer Gallery Rare Holo"],
    "secret": [
        "Rare Secret",
        "Rare Rainbow",
        "Hyper Rare",
        "Mega Hyper Rare",
        "Rare Shiny",
        "Shiny Rare",
        "Rare Shiny GX",
        "Shiny Ultra Rare",
    ],
}
_RARITY_TO_HIT = {rarity: tier for tier, rarities in _TIER_RARITIES.items() for rarity in rarities}

TEMPLATE_DESC = "6 commons + 3 uncommons + 1 rarity-weighted hit (Rare or better)"
DISCLAIMER = (
    "Approximate odds. Pokémon doesn't publish official pull rates and real pack structure "
    "varies by set and era — this uses a default slot template with estimated rarity weights, "
    "not exact real odds."
)


def tier_for_rarity(rarity: str | None) -> str | None:
    """Map a card's rarity to a pack tier, or None for promo/unknown/null (fallback only)."""
    if not rarity:
        return None
    r = rarity.strip()
    if r == "Common":
        return COMMON
    if r == "Uncommon":
        return UNCOMMON
    return _RARITY_TO_HIT.get(r)


def _pick_hit_tier(by_tier: dict[str, list[Card]], rng: random.Random) -> str | None:
    """Weighted choice among the hit tiers actually present in the set (normalized)."""
    present = [(t, HIT_WEIGHTS[t]) for t in HIT_TIERS if by_tier.get(t)]
    if not present:
        return None
    tiers, weights = zip(*present, strict=True)
    return rng.choices(tiers, weights=weights, k=1)[0]


def _draw(pool: list[Card], used: set[str], rng: random.Random) -> Card | None:
    """Pick a random card from ``pool``, preferring one not already in the pack."""
    if not pool:
        return None
    fresh = [c for c in pool if c.id not in used]
    chosen = rng.choice(fresh) if fresh else rng.choice(pool)
    used.add(chosen.id)
    return chosen


def build_pack(by_tier: dict[str, list[Card]], rng: random.Random) -> list[tuple[str, Card]]:
    """Pure odds engine: fill the slot template from tier-bucketed cards. Returns
    ``[(slot_kind, card), …]``. Never returns fewer cards than slots unless the set is empty."""
    used: set[str] = set()
    any_pool = [c for cards in by_tier.values() for c in cards]
    out: list[tuple[str, Card]] = []
    for kind, count in SLOT_TEMPLATE:
        for _ in range(count):
            if kind == COMMON:
                pool = (
                    by_tier.get(COMMON) or by_tier.get(UNCOMMON) or by_tier.get("rare") or any_pool
                )
            elif kind == UNCOMMON:
                pool = (
                    by_tier.get(UNCOMMON) or by_tier.get(COMMON) or by_tier.get("rare") or any_pool
                )
            else:  # hit — rare or better
                hit_tier = _pick_hit_tier(by_tier, rng)
                if hit_tier is not None:
                    pool = by_tier[hit_tier]
                else:
                    non_common = [c for t, cards in by_tier.items() if t != COMMON for c in cards]
                    pool = by_tier.get("rare") or non_common or any_pool
            card = _draw(pool, used, rng)
            if card is not None:
                out.append((kind, card))
    return out


def _bucket(cards: list[Card]) -> dict[str, list[Card]]:
    by_tier: dict[str, list[Card]] = {}
    for c in cards:
        by_tier.setdefault(tier_for_rarity(c.rarity) or "_other", []).append(c)
    return by_tier


def _utc_day_start():
    """Postgres date_trunc('day', now() AT TIME ZONE 'UTC') — start of the current UTC day."""
    return func.date_trunc("day", func.timezone("UTC", func.now()))


async def opens_today_count(session: AsyncSession, user_id: uuid.UUID) -> int:
    """How many packs the user has opened so far this UTC day (query-time, no reset job)."""
    return (
        await session.scalar(
            select(func.count())
            .select_from(PackOpen)
            .where(PackOpen.user_id == user_id, PackOpen.opened_at >= _utc_day_start())
        )
        or 0
    )


async def packs_remaining_today(session: AsyncSession, user_id: uuid.UUID) -> int:
    return max(0, DAILY_PACK_LIMIT - await opens_today_count(session, user_id))


def _price_at_open(card: Card) -> Decimal | None:
    """Open-time value via the one price source (same fn the vault + leaderboard use)."""
    return unit_price_usd(card.prices_current, is_foil=False, eur_usd_rate=settings.EUR_USD_RATE)


async def open_pack(session: AsyncSession, user_id: uuid.UUID, set_id: str) -> PackResult | None:
    """Open one pack for ``set_id``, persisting the authoritative roll.

    Returns None if the set is unknown or has no cards. Raises ``QuotaExceeded`` if the user has
    already used their daily allowance. The rolled result (with open-time prices) is stored so the
    keep step trusts only the server, never the client.
    """
    if await opens_today_count(session, user_id) >= DAILY_PACK_LIMIT:
        raise QuotaExceeded

    set_obj = await session.get(Set, set_id)
    if set_obj is None:
        return None
    cards = (
        (
            await session.execute(
                select(Card).options(selectinload(Card.prices_current)).where(Card.set_id == set_id)
            )
        )
        .scalars()
        .all()
    )
    if not cards:
        return None

    pulled = build_pack(_bucket(list(cards)), random.Random())
    rolled: list[dict] = []
    out: list[PulledCard] = []
    for kind, card in pulled:
        price = _price_at_open(card)
        rolled.append(
            {
                "card_id": card.id,
                "slot_kind": kind,
                "rarity": card.rarity,
                "name": card.name,
                "number": card.number,
                "image_url": card.image_small,
                "price_at_open": str(price) if price is not None else None,
            }
        )
        card_read: CardRead = _to_card_read(card)
        out.append(
            PulledCard(
                slot_kind=kind, tier=card.rarity or "Unknown", price_at_open=price, card=card_read
            )
        )

    pack_open = PackOpen(user_id=user_id, set_id=set_id, rolled_cards=rolled)
    session.add(pack_open)
    await session.commit()
    await session.refresh(pack_open)

    return PackResult(
        open_id=pack_open.id,
        set_id=set_id,
        set_name=set_obj.name,
        template=TEMPLATE_DESC,
        disclaimer=DISCLAIMER,
        packs_remaining_today=await packs_remaining_today(session, user_id),
        cards=out,
    )
