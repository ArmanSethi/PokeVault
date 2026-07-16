"""ORM model for scan events.

Scanning is propose-only (OCR → catalog matches; nothing is added to the collection). We persist a
lightweight row per scan solely to enforce the daily scan quota — counting how many a user has run
so far today (UTC), mirroring ``pack_opens`` for the pack quota. No reset job: "today" is computed
query-time via ``date_trunc('day', now() AT TIME ZONE 'UTC')``.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class Scan(Base):
    """One OCR scan performed by a user (recorded only for daily-quota counting)."""

    __tablename__ = "scans"
    __table_args__ = (Index("ix_scans_user_scanned", "user_id", "scanned_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    scanned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
