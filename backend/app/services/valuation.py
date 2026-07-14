"""Collection valuation — join a user's entries against current TCGPlayer prices."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.card import Card
from app.models.collection import CollectionEntry
from app.models.user import User
from app.schemas.collection import CollectionEntryRead, CollectionSummary, SetHolding
from app.services.cards import market_price_for_entry
from app.services.grading import grade_multiplier, graded_unit_price


def _to_entry_read(entry: CollectionEntry) -> CollectionEntryRead:
    # Grade-aware: PSA-graded copies are worth a multiple of the raw price (see grading.py).
    # Priced at the entry's exact variant when recorded (else derived from is_foil).
    unit = graded_unit_price(
        entry.card.prices_current,
        is_foil=entry.is_foil,
        grade=entry.grade,
        variant=entry.variant,
    )
    value = unit * entry.quantity if unit is not None else None
    return CollectionEntryRead(
        id=entry.id,
        card_id=entry.card_id,
        quantity=entry.quantity,
        condition=entry.condition,
        grade=entry.grade,
        is_foil=entry.is_foil,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        market_price=unit,
        market_value=value,
        grade_multiplier=float(grade_multiplier(entry.grade)),
    )


async def _load_entries(session: AsyncSession, user_id: uuid.UUID) -> Sequence[CollectionEntry]:
    # Eager-load each entry's card, its prices, and its set so valuation + the per-set
    # breakdown need no per-entry queries.
    stmt = (
        select(CollectionEntry)
        .where(CollectionEntry.user_id == user_id)
        .options(
            selectinload(CollectionEntry.card).selectinload(Card.prices_current),
            selectinload(CollectionEntry.card).selectinload(Card.set),
        )
    )
    return (await session.execute(stmt)).scalars().all()


async def list_entries_with_value(
    session: AsyncSession, user_id: uuid.UUID
) -> list[CollectionEntryRead]:
    """A user's collection entries, each with its unit price and total market value."""
    entries = await _load_entries(session, user_id)
    return [_to_entry_read(e) for e in entries]


@dataclass
class _SetAgg:
    set_name: str
    set_size: int | None
    owned_quantity: int = 0
    market_value: Decimal = field(default_factory=lambda: Decimal("0"))
    card_ids: set[str] = field(default_factory=set)


async def collection_summary(
    session: AsyncSession, user_id: uuid.UUID, *, graded: bool = True
) -> CollectionSummary:
    """Portfolio totals plus a per-set breakdown with completion (TCGPlayer USD).

    ``graded=True`` (the owner's view) applies the PSA grade multiplier to values.
    ``graded=False`` (the public showcase) uses raw prices so the headline total, the
    per-set values, and the per-card values shown publicly all agree — grading is not
    revealed publicly.
    """
    entries = await _load_entries(session, user_id)

    total_quantity = 0
    total_market_value = Decimal("0")
    all_card_ids: set[str] = set()
    by_set: dict[str, _SetAgg] = {}

    for entry in entries:
        card = entry.card
        if graded:
            unit = graded_unit_price(
                card.prices_current, is_foil=entry.is_foil, grade=entry.grade, variant=entry.variant
            )
        else:
            unit = market_price_for_entry(
                card.prices_current, is_foil=entry.is_foil, variant=entry.variant
            )
        line_value = unit * entry.quantity if unit is not None else Decimal("0")

        total_quantity += entry.quantity
        total_market_value += line_value
        all_card_ids.add(card.id)

        agg = by_set.get(card.set_id)
        if agg is None:
            set_obj = card.set
            agg = _SetAgg(
                set_name=set_obj.name if set_obj else card.set_id,
                set_size=(set_obj.printed_total or set_obj.total) if set_obj else None,
            )
            by_set[card.set_id] = agg
        agg.owned_quantity += entry.quantity
        agg.market_value += line_value
        agg.card_ids.add(card.id)

    sets = [
        SetHolding(
            set_id=set_id,
            set_name=agg.set_name,
            owned_quantity=agg.owned_quantity,
            distinct_cards_owned=len(agg.card_ids),
            set_size=agg.set_size,
            market_value=agg.market_value,
        )
        for set_id, agg in by_set.items()
    ]
    sets.sort(key=lambda s: s.market_value, reverse=True)

    # "Total spent" is the owner's manual override (no auto-calculation); None when unset. It is
    # never surfaced publicly — the public showcase reads PublicProfile, which omits total_cost.
    owner = await session.get(User, user_id)
    total_cost = owner.total_spent_override if owner else None

    return CollectionSummary(
        total_quantity=total_quantity,
        total_distinct_cards=len(all_card_ids),
        total_market_value=total_market_value,
        total_cost=total_cost,
        currency="USD",
        sets=sets,
    )
