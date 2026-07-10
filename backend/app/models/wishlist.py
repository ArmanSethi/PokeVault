"""ORM model for a user's wishlist.

A wishlist item is a card the user wants (but may not own), with an optional target price.
The daily snapshot job (``app/ingest/snapshot_prices.py``) watches wishlisted cards and
writes an ``AlertLog`` row when the market price hits the target or drops notably.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base
from app.models.card import Card
from app.models.user import User


class WishlistItem(Base):
    """A card a user wants, with an optional target price for alerts."""

    __tablename__ = "wishlist_items"
    __table_args__ = (UniqueConstraint("user_id", "card_id", name="uq_wishlist_user_card"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    target_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    card: Mapped[Card] = relationship()
    user: Mapped[User] = relationship()
