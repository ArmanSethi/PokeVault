"""ORM model for the virtual pull collection.

Kept pack-simulator pulls land here — a SEPARATE collection from the user's real IRL
``collection_entries``. One row per kept card (duplicates are distinct rows). ``price_at_pull``
is frozen at keep time; current value is looked up at query time from ``card_prices_current``
(the one price source), so it stays fresh via the daily snapshot without duplicating prices here.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Numeric, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base
from app.models.card import Card


class PackPull(Base):
    """One kept pack pull in a user's virtual collection."""

    __tablename__ = "pack_pulls"
    __table_args__ = (Index("ix_pack_pulls_user_pulled", "user_id", "pulled_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Provenance: the pack this card was kept from. Nullable — legacy pulls predate pack_opens,
    # and SET NULL keeps the permanent vault row if the open is ever removed.
    open_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("pack_opens.id", ondelete="SET NULL"), index=True, default=None
    )
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    # Frozen market value (USD) at the instant of keep. Nullable: a card may be unpriced then.
    price_at_pull: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), default=None)
    pulled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    rarity: Mapped[str | None] = mapped_column(String(64), default=None)  # display cache

    card: Mapped[Card] = relationship()
