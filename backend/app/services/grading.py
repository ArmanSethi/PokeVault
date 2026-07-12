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

from app.core.config import settings
from app.models.price import CardPriceCurrent
from app.services.cards import unit_price_usd

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

# BGS / CGC / SGC premium estimates. We still have no real graded-sale feed, so these are
# heuristic like PSA's: a base premium curve keyed by numeric grade (supports the half-grades
# BGS/CGC/SGC use, e.g. 9.5, 8.5) times a per-company factor (BGS trades at a slight premium to
# PSA; CGC/SGC a bit below). "Other" and free-text grades still get no premium (RAW).
_GRADE_CURVE: dict[float, Decimal] = {
    10.0: Decimal("5.0"),
    9.5: Decimal("3.0"),
    9.0: Decimal("2.0"),
    8.5: Decimal("1.6"),
    8.0: Decimal("1.35"),
    7.5: Decimal("1.2"),
    7.0: Decimal("1.1"),
    6.5: Decimal("1.05"),
    6.0: Decimal("1.0"),
    5.5: Decimal("0.95"),
    5.0: Decimal("0.9"),
    4.5: Decimal("0.85"),
    4.0: Decimal("0.8"),
    3.5: Decimal("0.75"),
    3.0: Decimal("0.7"),
    2.5: Decimal("0.65"),
    2.0: Decimal("0.6"),
    1.5: Decimal("0.55"),
    1.0: Decimal("0.5"),
}
_COMPANY_FACTOR: dict[str, Decimal] = {
    "BGS": Decimal("1.05"),
    "CGC": Decimal("0.90"),
    "SGC": Decimal("0.85"),
}

_PSA_RE = re.compile(r"psa\s*([0-9]{1,2})", re.IGNORECASE)
_OTHER_RE = re.compile(r"(BGS|CGC|SGC)\s*([0-9]+(?:\.[0-9])?)", re.IGNORECASE)


def _parse_graded_company(grade: str | None) -> tuple[str, float] | None:
    """Extract (company, numeric grade) for a BGS/CGC/SGC grade like 'BGS 9.5'; else None."""
    if not grade:
        return None
    m = _OTHER_RE.search(grade)
    if not m:
        return None
    company = m.group(1).upper()
    try:
        value = float(m.group(2))
    except ValueError:
        return None
    return (company, value) if 1.0 <= value <= 10.0 else None


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
    """Valuation multiplier for a grade string.

    PSA uses its own table; BGS/CGC/SGC use the shared grade curve × a per-company factor
    (estimates). Raw/ungraded and "Other"/unrecognized graders return 1.0 (no premium).
    """
    psa = parse_psa_grade(grade)
    if psa is not None:
        return PSA_MULTIPLIERS[psa]
    parsed = _parse_graded_company(grade)
    if parsed is not None:
        company, value = parsed
        base = _GRADE_CURVE.get(value)
        if base is not None:
            return base * _COMPANY_FACTOR[company]
    return RAW_MULTIPLIER


def graded_unit_price(
    prices: Iterable[CardPriceCurrent],
    *,
    is_foil: bool,
    grade: str | None,
    eur_usd_rate: float | None = None,
) -> Decimal | None:
    """Unit market value for a copy in USD, adjusting the raw price for its grade.

    The raw unit price is USD (TCGPlayer, or CardMarket EUR converted — see
    ``cards.unit_price_usd``); the PSA grade multiplier is then applied. ``eur_usd_rate``
    defaults to ``settings.EUR_USD_RATE``. Returns ``None`` when the card has no usable
    price in either source (nothing to scale).
    """
    rate = eur_usd_rate if eur_usd_rate is not None else settings.EUR_USD_RATE
    raw = unit_price_usd(prices, is_foil=is_foil, eur_usd_rate=rate)
    if raw is None:
        return None
    return (raw * grade_multiplier(grade)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
