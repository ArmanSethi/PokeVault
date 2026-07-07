"""Unit tests for pricing-summary logic and price-history mapping (no DB)."""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

from app.ingest import mappers
from app.services.cards import market_price_for_entry, select_primary_price


def _price(source: str, variant: str, market, currency: str = "USD"):
    """A CardPriceCurrent-like stand-in (services only read these attributes)."""
    return SimpleNamespace(source=source, variant=variant, market=market, currency=currency)


def test_select_primary_price_prefers_holofoil_over_normal() -> None:
    prices = [
        _price("tcgplayer", "normal", Decimal("1.00")),
        _price("tcgplayer", "holofoil", Decimal("5.00")),
        _price("cardmarket", "normal", Decimal("9.99"), currency="EUR"),
    ]
    primary = select_primary_price(prices)
    assert primary is not None
    assert primary.variant == "holofoil"
    assert primary.currency == "USD"


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
