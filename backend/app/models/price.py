"""ORM models for card pricing.

``CardPriceCurrent`` holds the latest snapshot only (one row per card / source /
variant), while ``PriceHistory`` keeps one row per card / source / variant / day
for charting trends over time. Prices come from pokemontcg.io's ``tcgplayer`` and
``cardmarket`` blocks (English catalog).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.card import Card


class CardPriceCurrent(Base):
    """Latest price snapshot for a card, keyed by (card, source, variant).

    The composite primary key means an upsert on ``(card_id, source, variant)``
    always keeps exactly one — the most recent — row per combination.
    """

    __tablename__ = "card_prices_current"

    card_id: Mapped[str] = mapped_column(
        ForeignKey("cards.id", ondelete="CASCADE"),
        primary_key=True,
    )
    source: Mapped[str] = mapped_column(String(16), primary_key=True)  # tcgplayer | cardmarket
    variant: Mapped[str] = mapped_column(String(32), primary_key=True)  # e.g. normal, holofoil

    low: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)
    mid: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)
    high: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)
    market: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)
    direct_low: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    card: Mapped[Card] = relationship(back_populates="prices_current")


class PriceHistory(Base):
    """One market-price observation per card / source / variant / day."""

    __tablename__ = "price_history"
    __table_args__ = (
        UniqueConstraint(
            "card_id",
            "source",
            "variant",
            "snapshot_date",
            name="uq_price_history_card_source_variant_day",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    card_id: Mapped[str] = mapped_column(
        ForeignKey("cards.id", ondelete="CASCADE"),
        index=True,
    )
    source: Mapped[str] = mapped_column(String(16))
    variant: Mapped[str] = mapped_column(String(32))
    market_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    snapshot_date: Mapped[date] = mapped_column(Date, index=True)

    card: Mapped[Card] = relationship(back_populates="price_history")
