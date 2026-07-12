"""Pydantic schemas for price-history and portfolio-value series."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class PriceHistoryPoint(BaseModel):
    date: date
    market_price: Decimal | None = None


class CardPriceHistory(BaseModel):
    """A single (source, variant) market-price series for a card."""

    card_id: str
    source: str
    variant: str | None = None  # None when the card has no history yet
    currency: str = "USD"
    points: list[PriceHistoryPoint] = []


class PortfolioValuePoint(BaseModel):
    date: date
    total_value: Decimal


class PortfolioValueSeries(BaseModel):
    """The user's daily total portfolio value over time (one point per recorded day).

    ``message`` carries a human-readable note when the series can't be built (e.g. a backend
    error) so the UI can degrade gracefully instead of showing a broken chart.
    """

    currency: str = "USD"
    points: list[PortfolioValuePoint] = []
    message: str | None = None
