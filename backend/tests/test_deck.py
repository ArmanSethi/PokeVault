"""Tests for dream-deck CRUD + valuation (real DB session, rolled back).

Exercises the service layer directly: value reuses the canonical USD unit price (TCGPlayer
USD; CardMarket EUR converted first), decks are per-user, and cards behave as add-or-increment.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models.card import Card, Set
from app.models.deck import DeckCard
from app.models.price import CardPriceCurrent
from app.models.user import User
from app.schemas.deck import DeckCardCreate, DeckCreate, DeckUpdate
from app.services import deck as deck_service
from app.services.collection import UnknownCard

_RATE = 1.10  # deterministic EUR->USD for the test


@pytest.fixture(autouse=True)
def fixed_fx(monkeypatch):
    """Pin the EUR->USD rate so EUR conversions are deterministic."""
    monkeypatch.setattr(deck_service.settings, "EUR_USD_RATE", _RATE)


@pytest.fixture
async def catalog(db_session):
    """A set + three cards: USD-priced, EUR-only, and unpriced."""
    db_session.add(Set(id="dk1", name="Deck Set", printed_total=3, total=3))
    db_session.add_all(
        [
            Card(id="dk1-a", set_id="dk1", name="Alpha", number="1"),
            Card(id="dk1-b", set_id="dk1", name="Beta", number="2"),
            Card(id="dk1-c", set_id="dk1", name="Gamma", number="3"),
        ]
    )
    db_session.add_all(
        [
            # dk1-a: TCGPlayer USD $3.00
            CardPriceCurrent(
                card_id="dk1-a",
                source="tcgplayer",
                variant="normal",
                market=Decimal("3.00"),
                currency="USD",
            ),
            # dk1-b: CardMarket EUR €10.00 (no TCGPlayer market) -> converts to USD
            CardPriceCurrent(
                card_id="dk1-b",
                source="cardmarket",
                variant="normal",
                market=Decimal("10.00"),
                currency="EUR",
            ),
            # dk1-c: no price rows at all
        ]
    )
    await db_session.flush()


async def _uid(db_session, email: str) -> uuid.UUID:
    uid = uuid.uuid4()
    db_session.add(User(id=uid, email=email))
    await db_session.flush()
    return uid


async def test_deck_value_reuses_usd_valuation_with_eur_conversion(db_session, catalog):
    uid = await _uid(db_session, "deck@pokevault.dev")
    deck = await deck_service.create_deck(db_session, uid, DeckCreate(name="Dream", target_size=40))
    assert deck.target_size == 40 and deck.card_count == 0 and deck.total_value == Decimal("0")

    # 2× Alpha ($3) = $6.00
    d = await deck_service.add_card(
        db_session, uid, deck.id, DeckCardCreate(card_id="dk1-a", quantity=2)
    )
    # + 1× Beta (€10 × 1.10 = $11.00) => $17.00, count 3
    d = await deck_service.add_card(
        db_session, uid, deck.id, DeckCardCreate(card_id="dk1-b", quantity=1)
    )
    assert d.card_count == 3
    assert d.total_value == Decimal("17.00")

    # Unpriced card contributes 0 to value but counts toward size.
    d = await deck_service.add_card(
        db_session, uid, deck.id, DeckCardCreate(card_id="dk1-c", quantity=5)
    )
    assert d.card_count == 8
    assert d.total_value == Decimal("17.00")
    gamma = next(c for c in d.cards if c.card_id == "dk1-c")
    assert gamma.market_price is None  # never NaN


async def test_add_existing_card_increments(db_session, catalog):
    uid = await _uid(db_session, "inc@pokevault.dev")
    deck = await deck_service.create_deck(db_session, uid, DeckCreate(name="D", target_size=60))
    await deck_service.add_card(
        db_session, uid, deck.id, DeckCardCreate(card_id="dk1-a", quantity=2)
    )
    d = await deck_service.add_card(
        db_session, uid, deck.id, DeckCardCreate(card_id="dk1-a", quantity=1)
    )
    alpha = next(c for c in d.cards if c.card_id == "dk1-a")
    assert alpha.quantity == 3
    assert d.total_value == Decimal("9.00")  # 3 × $3


async def test_rename_resize_setqty_remove_and_unknown_card(db_session, catalog):
    uid = await _uid(db_session, "edit@pokevault.dev")
    deck = await deck_service.create_deck(db_session, uid, DeckCreate(name="Old", target_size=40))
    await deck_service.add_card(
        db_session, uid, deck.id, DeckCardCreate(card_id="dk1-a", quantity=2)
    )

    d = await deck_service.update_deck(
        db_session, uid, deck.id, DeckUpdate(name="New", target_size=100)
    )
    assert d.name == "New" and d.target_size == 100

    d = await deck_service.set_card_quantity(db_session, uid, deck.id, "dk1-a", 4)
    assert d.total_value == Decimal("12.00")  # 4 × $3

    d = await deck_service.remove_card(db_session, uid, deck.id, "dk1-a")
    assert d.card_count == 0 and d.total_value == Decimal("0")

    with pytest.raises(UnknownCard):
        await deck_service.add_card(db_session, uid, deck.id, DeckCardCreate(card_id="nope-1"))


async def test_decks_are_per_user_and_delete_cascades(db_session, catalog):
    owner = await _uid(db_session, "owner@pokevault.dev")
    other = await _uid(db_session, "other@pokevault.dev")
    deck = await deck_service.create_deck(
        db_session, owner, DeckCreate(name="Mine", target_size=40)
    )
    await deck_service.add_card(
        db_session, owner, deck.id, DeckCardCreate(card_id="dk1-a", quantity=1)
    )

    # Isolation: the other user can't see or fetch it.
    assert await deck_service.list_decks(db_session, other) == []
    assert await deck_service.get_deck(db_session, other, deck.id) is None
    # And can't mutate it (scoped update returns None, no change).
    assert await deck_service.update_deck(db_session, other, deck.id, DeckUpdate(name="x")) is None

    # Delete cascades to deck_cards.
    assert await deck_service.delete_deck(db_session, owner, deck.id) is True
    from sqlalchemy import func, select

    remaining = await db_session.scalar(
        select(func.count()).select_from(DeckCard).where(DeckCard.deck_id == deck.id)
    )
    assert remaining == 0
    assert await deck_service.delete_deck(db_session, owner, deck.id) is False  # already gone
