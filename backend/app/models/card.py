"""ORM models for Pokémon sets and cards.

Schema mirrors the pokemontcg.io v2 catalog (treated as the English catalog).
Primary keys are the string ids from that API (e.g. set ``"sv3"``, card ``"sv3-125"``).
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.collection import CollectionEntry
    from app.models.price import CardPriceCurrent, PriceHistory


class Set(Base):
    """A released expansion / set (e.g. "Obsidian Flames")."""

    __tablename__ = "sets"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # e.g. "sv3"
    name: Mapped[str] = mapped_column(String(255))
    series: Mapped[str | None] = mapped_column(String(255), default=None)
    printed_total: Mapped[int | None] = mapped_column(default=None)
    total: Mapped[int | None] = mapped_column(default=None)
    release_date: Mapped[date | None] = mapped_column(default=None)
    ptcgo_code: Mapped[str | None] = mapped_column(String(16), default=None)
    symbol_url: Mapped[str | None] = mapped_column(String(1024), default=None)
    logo_url: Mapped[str | None] = mapped_column(String(1024), default=None)

    cards: Mapped[list[Card]] = relationship(
        back_populates="set",
        cascade="all, delete-orphan",
    )


class Card(Base):
    """A specific card printing within a set."""

    __tablename__ = "cards"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # e.g. "sv3-125"
    set_id: Mapped[str] = mapped_column(
        ForeignKey("sets.id", ondelete="CASCADE"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), index=True)
    number: Mapped[str] = mapped_column(String(32))
    supertype: Mapped[str | None] = mapped_column(String(32), default=None)
    subtypes: Mapped[list[str] | None] = mapped_column(ARRAY(String), default=None)
    rarity: Mapped[str | None] = mapped_column(String(64), default=None)
    artist: Mapped[str | None] = mapped_column(String(255), default=None)
    image_small: Mapped[str | None] = mapped_column(String(1024), default=None)
    image_large: Mapped[str | None] = mapped_column(String(1024), default=None)
    national_pokedex_numbers: Mapped[list[int] | None] = mapped_column(ARRAY(Integer), default=None)
    tcgplayer_url: Mapped[str | None] = mapped_column(String(1024), default=None)
    cardmarket_url: Mapped[str | None] = mapped_column(String(1024), default=None)
    raw_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)

    set: Mapped[Set] = relationship(back_populates="cards")
    prices_current: Mapped[list[CardPriceCurrent]] = relationship(
        back_populates="card",
        cascade="all, delete-orphan",
    )
    price_history: Mapped[list[PriceHistory]] = relationship(
        back_populates="card",
        cascade="all, delete-orphan",
    )
    collection_entries: Mapped[list[CollectionEntry]] = relationship(
        back_populates="card",
        cascade="all, delete-orphan",
    )
