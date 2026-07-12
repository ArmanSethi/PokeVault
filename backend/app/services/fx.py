"""Currency conversion for single-currency (USD) portfolio valuation.

Card prices arrive from two sources in two currencies: TCGPlayer (USD) and CardMarket
(EUR). Portfolio totals are computed in USD, so any EUR-sourced price must be converted
*before* it is summed — EUR and USD magnitudes are never added together. Conversion uses a
configurable rate (see ``settings.EUR_USD_RATE``); unknown currencies convert to ``None``
so a mystery-currency price is treated as "no usable price" rather than silently mixed in.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal


def to_usd(amount: Decimal | None, currency: str | None, eur_usd_rate: float) -> Decimal | None:
    """Convert ``amount`` in ``currency`` to USD, or ``None`` if it can't be converted.

    ``USD`` passes through; ``EUR`` is multiplied by ``eur_usd_rate``. Any other currency
    (or a null amount) returns ``None`` so callers never mix currencies into a USD total.
    """
    if amount is None or currency is None:
        return None
    if currency == "USD":
        return Decimal(amount)
    if currency == "EUR":
        return (Decimal(amount) * Decimal(str(eur_usd_rate))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    return None
