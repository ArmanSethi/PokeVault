"""pack_pulls (virtual pull collection)

Revision ID: a7c9e1f3b5d7
Revises: f6b8d0e2a4c5
Create Date: 2026-07-12 00:00:00.000000

Virtual pull collection for the pack simulator — separate from the IRL collection. Additive.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7c9e1f3b5d7"
down_revision: str | None = "f6b8d0e2a4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pack_pulls",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("card_id", sa.String(length=32), nullable=False),
        sa.Column("price_at_pull", sa.Numeric(12, 2), nullable=True),
        sa.Column(
            "pulled_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("rarity", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pack_pulls_user_id", "pack_pulls", ["user_id"])
    op.create_index("ix_pack_pulls_card_id", "pack_pulls", ["card_id"])
    op.create_index("ix_pack_pulls_pulled_at", "pack_pulls", ["pulled_at"])
    op.create_index("ix_pack_pulls_user_pulled", "pack_pulls", ["user_id", "pulled_at"])


def downgrade() -> None:
    op.drop_index("ix_pack_pulls_user_pulled", table_name="pack_pulls")
    op.drop_index("ix_pack_pulls_pulled_at", table_name="pack_pulls")
    op.drop_index("ix_pack_pulls_card_id", table_name="pack_pulls")
    op.drop_index("ix_pack_pulls_user_id", table_name="pack_pulls")
    op.drop_table("pack_pulls")
