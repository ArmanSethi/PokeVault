"""ORM model for a user's collection entries.

Each entry is owned by a user (``user_id``) and represents a "stack" of identical copies,
keyed conceptually by ``(user_id, card_id, condition, is_foil, grade)``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base
from app.models.card import Card
from app.models.user import User


class CollectionEntry(Base):
    """A card the owner holds, with copy-level detail."""

    __tablename__ = "collection_entries"
    __table_args__ = (Index("ix_collection_entries_user_card", "user_id", "card_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    quantity: Mapped[int] = mapped_column(default=1)
    condition: Mapped[str | None] = mapped_column(String(32), default=None)  # e.g. NM, LP
    grade: Mapped[str | None] = mapped_column(String(32), default=None)  # e.g. "PSA 10"
    is_foil: Mapped[bool] = mapped_column(default=False)
    acquired_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)
    notes: Mapped[str | None] = mapped_column(String(1024), default=None)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    card: Mapped[Card] = relationship(back_populates="collection_entries")
    user: Mapped[User] = relationship()
