"""Pure unit tests for PSA grade-aware valuation (no DB needed)."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models.price import CardPriceCurrent
from app.services.grading import (
    PSA_MULTIPLIERS,
    grade_multiplier,
    graded_unit_price,
    parse_psa_grade,
)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("PSA 10", 10),
        ("psa10", 10),
        ("  PSA  9 ", 9),
        ("PSA 1", 1),
        ("Graded PSA 8 Gem", 8),
        ("PSA 11", None),  # out of range
        ("PSA 0", None),
        ("BGS 10", None),  # non-PSA grader
        ("Gem Mint", None),
        ("", None),
        (None, None),
    ],
)
def test_parse_psa_grade(text: str | None, expected: int | None) -> None:
    assert parse_psa_grade(text) == expected


def test_grade_multiplier_psa10_is_highest() -> None:
    assert grade_multiplier("PSA 10") == Decimal("5.0")
    # PSA 10 must be the top multiplier of the table.
    assert PSA_MULTIPLIERS[10] == max(PSA_MULTIPLIERS.values())


def test_grade_multiplier_raw_and_unknown_are_1() -> None:
    assert grade_multiplier(None) == Decimal("1.0")
    assert grade_multiplier("") == Decimal("1.0")
    assert grade_multiplier("BGS 9.5") == Decimal("1.0")
    assert grade_multiplier("PSA 5") == Decimal("0.9")


def _price(market: str, variant: str = "normal") -> CardPriceCurrent:
    return CardPriceCurrent(
        card_id="x-1", source="tcgplayer", variant=variant, market=Decimal(market), currency="USD"
    )


def test_graded_unit_price_scales_raw() -> None:
    prices = [_price("10.00")]
    # PSA 10 → 5× raw.
    assert graded_unit_price(prices, is_foil=False, grade="PSA 10") == Decimal("50.00")
    # PSA 9 → 2× raw.
    assert graded_unit_price(prices, is_foil=False, grade="PSA 9") == Decimal("20.00")
    # Raw/ungraded → unchanged.
    assert graded_unit_price(prices, is_foil=False, grade=None) == Decimal("10.00")


def test_graded_unit_price_rounds_to_cents() -> None:
    # 2.51 * 5.0 = 12.55 — a fractional-cent raw price scaled and quantized to cents.
    assert graded_unit_price([_price("2.51")], is_foil=False, grade="PSA 10") == Decimal("12.55")


def test_graded_unit_price_none_without_price() -> None:
    assert graded_unit_price([], is_foil=False, grade="PSA 10") is None
