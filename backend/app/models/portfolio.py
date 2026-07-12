"""ORM model for per-user daily portfolio value.

The daily snapshot job computes each user's TOTAL portfolio value (USD) once per day and
stores it here as one row per ``(user_id, snapshot_date)``. The Dashboard's "portfolio value
over time" chart reads these rows directly instead of reconstructing value from per-card
price history — so each day's point reflects that day's cards, quantities, and grades.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class PortfolioValueDaily(Base):
    """One user's total portfolio value (USD) on one day.

    The composite primary key ``(user_id, snapshot_date)`` makes the daily write idempotent:
    re-running the job for the same day upserts the single row in place.
    """

    __tablename__ = "portfolio_value_daily"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    snapshot_date: Mapped[date] = mapped_column(Date, primary_key=True)
    total_value_usd: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
