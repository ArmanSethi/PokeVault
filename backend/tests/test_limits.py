"""Numeric-limit enforcement at the schema boundary (pure, no DB)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.collection import CollectionEntryCreate, CollectionEntryUpdate
from app.schemas.deck import DeckCardCreate, DeckCardUpdate, DeckCreate, DeckUpdate
from app.schemas.wishlist import WishlistItemCreate


def test_card_quantity_bounds():
    assert CollectionEntryCreate(card_id="x-1", quantity=99).quantity == 99
    with pytest.raises(ValidationError):
        CollectionEntryCreate(card_id="x-1", quantity=100)
    with pytest.raises(ValidationError):
        CollectionEntryCreate(card_id="x-1", quantity=0)
    with pytest.raises(ValidationError):
        CollectionEntryUpdate(quantity=100)


def test_money_bounds_allow_decimals():
    assert CollectionEntryCreate(
        card_id="x-1", acquired_price=Decimal("12.34")
    ).acquired_price == Decimal("12.34")
    CollectionEntryCreate(card_id="x-1", acquired_price=Decimal("1000000"))  # cap ok
    with pytest.raises(ValidationError):
        CollectionEntryCreate(card_id="x-1", acquired_price=Decimal("1000000.01"))
    with pytest.raises(ValidationError):
        CollectionEntryCreate(card_id="x-1", acquired_price=Decimal("-1"))


def test_deck_bounds():
    assert DeckCreate(name="d", target_size=100).target_size == 100
    with pytest.raises(ValidationError):
        DeckCreate(name="d", target_size=101)
    with pytest.raises(ValidationError):
        DeckCreate(name="d", target_size=0)
    with pytest.raises(ValidationError):
        DeckUpdate(target_size=101)
    assert DeckCardCreate(card_id="x-1", quantity=99).quantity == 99
    with pytest.raises(ValidationError):
        DeckCardCreate(card_id="x-1", quantity=100)
    with pytest.raises(ValidationError):
        DeckCardUpdate(quantity=100)


def test_wishlist_target_bounds():
    WishlistItemCreate(card_id="x-1", target_price=Decimal("1000000"))
    with pytest.raises(ValidationError):
        WishlistItemCreate(card_id="x-1", target_price=Decimal("1000001"))
    with pytest.raises(ValidationError):
        WishlistItemCreate(card_id="x-1", target_price=Decimal("-0.01"))
