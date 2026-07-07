"""initial schema

Creates the catalog + collection + pricing tables: sets, cards, collection_entries,
card_prices_current, price_history. Schema mirrors the ORM models under app/models/.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-07-06

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sets",
        sa.Column("id", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("series", sa.String(length=255), nullable=True),
        sa.Column("printed_total", sa.Integer(), nullable=True),
        sa.Column("total", sa.Integer(), nullable=True),
        sa.Column("release_date", sa.Date(), nullable=True),
        sa.Column("ptcgo_code", sa.String(length=16), nullable=True),
        sa.Column("symbol_url", sa.String(length=1024), nullable=True),
        sa.Column("logo_url", sa.String(length=1024), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "cards",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("set_id", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("number", sa.String(length=32), nullable=False),
        sa.Column("supertype", sa.String(length=32), nullable=True),
        sa.Column("subtypes", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("rarity", sa.String(length=64), nullable=True),
        sa.Column("artist", sa.String(length=255), nullable=True),
        sa.Column("image_small", sa.String(length=1024), nullable=True),
        sa.Column("image_large", sa.String(length=1024), nullable=True),
        sa.Column("national_pokedex_numbers", postgresql.ARRAY(sa.Integer()), nullable=True),
        sa.Column("tcgplayer_url", sa.String(length=1024), nullable=True),
        sa.Column("cardmarket_url", sa.String(length=1024), nullable=True),
        sa.Column("raw_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["set_id"], ["sets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cards_name", "cards", ["name"])
    op.create_index("ix_cards_set_id", "cards", ["set_id"])

    op.create_table(
        "card_prices_current",
        sa.Column("card_id", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("variant", sa.String(length=32), nullable=False),
        sa.Column("low", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("mid", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("high", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("market", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("direct_low", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("card_id", "source", "variant"),
    )

    op.create_table(
        "collection_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("card_id", sa.String(length=32), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("condition", sa.String(length=32), nullable=True),
        sa.Column("is_foil", sa.Boolean(), nullable=False),
        sa.Column("acquired_price", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("notes", sa.String(length=1024), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_collection_entries_card_id", "collection_entries", ["card_id"])

    op.create_table(
        "price_history",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("card_id", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("variant", sa.String(length=32), nullable=False),
        sa.Column("market_price", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "card_id",
            "source",
            "variant",
            "snapshot_date",
            name="uq_price_history_card_source_variant_day",
        ),
    )
    op.create_index("ix_price_history_card_id", "price_history", ["card_id"])
    op.create_index("ix_price_history_snapshot_date", "price_history", ["snapshot_date"])


def downgrade() -> None:
    op.drop_index("ix_price_history_snapshot_date", table_name="price_history")
    op.drop_index("ix_price_history_card_id", table_name="price_history")
    op.drop_table("price_history")

    op.drop_index("ix_collection_entries_card_id", table_name="collection_entries")
    op.drop_table("collection_entries")

    op.drop_table("card_prices_current")

    op.drop_index("ix_cards_set_id", table_name="cards")
    op.drop_index("ix_cards_name", table_name="cards")
    op.drop_table("cards")

    op.drop_table("sets")
