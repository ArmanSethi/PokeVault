"""PSA grade-aware valuation.

Raw catalog prices (TCGPlayer USD) reflect *ungraded* copies. A professionally graded
copy is worth more — dramatically so at PSA 10 (Gem Mint). We have no free source of real
graded-sale prices, so a graded copy's value is estimated as ``raw_price * multiplier``,
where the multiplier is keyed off the PSA grade. The multipliers are heuristic, uniform
estimates (real premiums vary by card) and are centralized here so they are easy to tune.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from decimal import ROUND_HALF_UP, Decimal

from app.models.price import CardPriceCurrent
from app.services.cards import market_price_for_entry

# PSA grade (1-10) -> multiplier applied to the raw market price. PSA 10 (Gem Mint) carries
# the largest premium; low grades sit near or slightly below raw. Tune these freely.
PSA_MULTIPLIERS: dict[int, Decimal] = {
    10: Decimal("5.0"),
    9: Decimal("2.0"),
    8: Decimal("1.35"),
    7: Decimal("1.1"),
    6: Decimal("1.0"),
    5: Decimal("0.9"),
    4: Decimal("0.8"),
    3: Decimal("0.7"),
    2: Decimal("0.6"),
    1: Decimal("0.5"),
}
RAW_MULTIPLIER = Decimal("1.0")

_PSA_RE = re.compile(r"psa\s*([0-9]{1,2})", re.IGNORECASE)


def parse_psa_grade(grade: str | None) -> int | None:
    """Extract a PSA numeric grade (1-10) from a free-text grade like 'PSA 10'.

    Returns ``None`` for raw/blank grades or non-PSA / out-of-range values.
    """
    if not grade:
        return None
    m = _PSA_RE.search(grade)
    if not m:
        return None
    n = int(m.group(1))
    return n if 1 <= n <= 10 else None


def grade_multiplier(grade: str | None) -> Decimal:
    """Valuation multiplier for a grade string; raw/unknown grades return 1.0."""
    psa = parse_psa_grade(grade)
    return PSA_MULTIPLIERS[psa] if psa is not None else RAW_MULTIPLIER


def graded_unit_price(
    prices: Iterable[CardPriceCurrent], *, is_foil: bool, grade: str | None
) -> Decimal | None:
    """Unit market value for a copy, adjusting the raw TCGPlayer USD price for its grade.

    Returns ``None`` when the card has no usable raw price (nothing to scale).
    """
    raw = market_price_for_entry(prices, is_foil=is_foil)
    if raw is None:
        return None
    return (raw * grade_multiplier(grade)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
