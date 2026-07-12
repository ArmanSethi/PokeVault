"""ORM model for an opened pack (the authoritative server-side roll).

One row per opened pack. It drives two things: the daily quota (count today's rows per user,
UTC) and server-authoritative keeps. ``rolled_cards`` is the server's record of exactly what was
rolled and each card's price at open; the keep step trusts ONLY this, never client-supplied cards
or prices. Opening consumes quota even if every card is later discarded (no row is deleted here).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class PackOpen(Base):
    """One opened pack: the authoritative rolled result + open-time prices."""

    __tablename__ = "pack_opens"
    __table_args__ = (Index("ix_pack_opens_user_opened", "user_id", "opened_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    set_id: Mapped[str] = mapped_column(String(16), ForeignKey("sets.id", ondelete="CASCADE"))
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    # Authoritative roll: [{card_id, slot_kind, rarity, name, number, image_url, price_at_open}].
    # price_at_open is stored as a string (Decimal is not JSON-native); parsed back on keep.
    rolled_cards: Mapped[list[dict]] = mapped_column(JSONB)
