"""decks + deck_cards

Revision ID: e5a7c9d1f3b4
Revises: d4f6b8c0e2a3
Create Date: 2026-07-12 00:00:00.000000

User dream-decks. ``decks`` holds a named deck with a user-defined target size; ``deck_cards``
holds its cards + quantities (unique per deck/card). Both cascade from their parents. Additive.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5a7c9d1f3b4"
down_revision: str | None = "d4f6b8c0e2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "decks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("target_size", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_decks_user_id", "decks", ["user_id"])

    op.create_table(
        "deck_cards",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("deck_id", sa.Integer(), nullable=False),
        sa.Column("card_id", sa.String(length=32), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["deck_id"], ["decks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("deck_id", "card_id", name="uq_deck_card"),
    )
    op.create_index("ix_deck_cards_deck_id", "deck_cards", ["deck_id"])
    op.create_index("ix_deck_cards_card_id", "deck_cards", ["card_id"])


def downgrade() -> None:
    op.drop_index("ix_deck_cards_card_id", table_name="deck_cards")
    op.drop_index("ix_deck_cards_deck_id", table_name="deck_cards")
    op.drop_table("deck_cards")
    op.drop_index("ix_decks_user_id", table_name="decks")
    op.drop_table("decks")
