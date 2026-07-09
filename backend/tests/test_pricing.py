"""Unit tests for pricing-summary logic and price-history mapping (no DB)."""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

from app.ingest import mappers
from app.services.cards import (
    market_price_for_entry,
    select_display_price,
    select_primary_price,
)


def _price(source: str, variant: str, market, currency: str = "USD", *, low=None, mid=None):
    """A CardPriceCurrent-like stand-in (services only read these attributes)."""
    return SimpleNamespace(
        source=source, variant=variant, market=market, currency=currency, low=low, mid=mid
    )


def test_select_primary_price_is_rarity_aware() -> None:
    """Holo cards headline on the holofoil price; non-holo cards on the normal price.

    A single fixed order inflated commons (their pricey holofoil variant won). The
    base printing — and thus the headline — is chosen from the card's rarity.
    """
    prices = [
        _price("tcgplayer", "normal", Decimal("1.00")),
        _price("tcgplayer", "holofoil", Decimal("5.00")),
        _price("cardmarket", "normal", Decimal("9.99"), currency="EUR"),
    ]
    holo = select_primary_price(prices, rarity="Rare Holo")
    assert holo is not None and holo.variant == "holofoil" and holo.currency == "USD"

    common = select_primary_price(prices, rarity="Common")
    assert common is not None and common.variant == "normal"

    # No rarity context defaults to the base (normal) printing, never the pricey holofoil.
    assert select_primary_price(prices).variant == "normal"


def test_select_primary_price_ignores_cardmarket_and_null_market() -> None:
    prices = [
        _price("cardmarket", "normal", Decimal("9.99"), currency="EUR"),
        _price("tcgplayer", "normal", None),  # no market → skipped
    ]
    assert select_primary_price(prices) is None


def test_select_primary_price_falls_back_to_any_tcgplayer_row() -> None:
    prices = [_price("tcgplayer", "1stEditionHolofoil", Decimal("42.00"))]
    primary = select_primary_price(prices)
    assert primary is not None and primary.market == Decimal("42.00")


def test_display_price_prefers_tcgplayer_market() -> None:
    prices = [
        _price("tcgplayer", "normal", Decimal("1.00")),
        _price("cardmarket", "normal", Decimal("9.99"), currency="EUR"),
    ]
    assert select_display_price(prices, rarity="Common") == (Decimal("1.00"), "USD")


def test_display_price_falls_back_to_cardmarket_when_no_tcg_market() -> None:
    """Cards with only a CardMarket price still show a value (in EUR), not a blank."""
    prices = [
        _price("tcgplayer", "normal", None),  # no market
        _price("cardmarket", "normal", Decimal("9.99"), currency="EUR"),
    ]
    assert select_display_price(prices) == (Decimal("9.99"), "EUR")


def test_display_price_falls_back_to_tcg_mid_then_low() -> None:
    """When no market price exists anywhere, a mid/low estimate is shown (USD)."""
    prices = [_price("tcgplayer", "normal", None, mid=Decimal("3.50"), low=Decimal("2.00"))]
    assert select_display_price(prices) == (Decimal("3.50"), "USD")

    low_only = [_price("tcgplayer", "normal", None, low=Decimal("2.00"))]
    assert select_display_price(low_only) == (Decimal("2.00"), "USD")


def test_display_price_none_when_no_usable_price() -> None:
    prices = [_price("tcgplayer", "normal", None)]
    assert select_display_price(prices) is None


def test_market_price_for_entry_respects_foil_flag() -> None:
    prices = [
        _price("tcgplayer", "normal", Decimal("1.00")),
        _price("tcgplayer", "holofoil", Decimal("5.00")),
    ]
    assert market_price_for_entry(prices, is_foil=True) == Decimal("5.00")
    assert market_price_for_entry(prices, is_foil=False) == Decimal("1.00")


def test_history_rows_from_card_keeps_only_market_rows() -> None:
    card = {
        "id": "sv3-1",
        "tcgplayer": {
            "prices": {
                "normal": {"market": 1.5, "low": 1.0},
                "holofoil": {"market": None},  # dropped — no market price
            }
        },
        "cardmarket": {"prices": {"trendPrice": 2.0}},
    }
    rows = mappers.history_rows_from_card(card)
    keys = {(r["source"], r["variant"]) for r in rows}
    assert keys == {("tcgplayer", "normal"), ("cardmarket", "normal")}
    for r in rows:
        assert r["market_price"] is not None
        assert "snapshot_date" not in r  # writer sets this to the DB's current date
