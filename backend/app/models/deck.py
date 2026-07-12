"""ORM models for user "dream decks".

A deck is a private, per-user wishlist-of-a-different-kind: a named list of cards with a
user-chosen *target size* (any number — no 60-card game rule) and per-card quantities. Decks
are entirely separate from what a user owns (``collection_entries``); adding a card to a deck
never touches the collection. Cards may be any card in the catalog, at any quantity.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base
from app.models.card import Card
from app.models.user import User


class Deck(Base):
    """A named deck owned by a user, with a user-defined target size."""

    __tablename__ = "decks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    target_size: Mapped[int] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    cards: Mapped[list[DeckCard]] = relationship(
        back_populates="deck",
        cascade="all, delete-orphan",
        order_by="DeckCard.id",
    )
    user: Mapped[User] = relationship()


class DeckCard(Base):
    """A card slot in a deck, with a quantity. Unique per (deck, card)."""

    __tablename__ = "deck_cards"
    __table_args__ = (UniqueConstraint("deck_id", "card_id", name="uq_deck_card"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    deck_id: Mapped[int] = mapped_column(ForeignKey("decks.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    quantity: Mapped[int] = mapped_column(default=1)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    deck: Mapped[Deck] = relationship(back_populates="cards")
    card: Mapped[Card] = relationship()
