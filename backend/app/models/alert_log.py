"""ORM model for price-drop / target-hit alerts on wishlisted cards.

The daily snapshot job writes one row per (user, card, kind, day) when a wishlisted card's
market price hits the user's target or drops notably. Delivery (email) is deferred — rows
accrue here and are surfaced in-app; a sender plugs in later. The unique key makes the
detection pass idempotent (safe to re-run the job within a day).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base
from app.models.card import Card
from app.models.user import User

# Alert kinds.
KIND_TARGET_HIT = "target_hit"
KIND_DROP = "drop"


class AlertLog(Base):
    """A single fired alert for a user's wishlisted card on a given day."""

    __tablename__ = "alert_log"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "card_id", "kind", "snapshot_date", name="uq_alert_user_card_kind_day"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # target_hit | drop
    triggered_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)
    target_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)
    snapshot_date: Mapped[date] = mapped_column(Date, server_default=func.current_date())
    delivered: Mapped[bool] = mapped_column(default=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    card: Mapped[Card] = relationship()
    user: Mapped[User] = relationship()
