"""simulator: pack_opens + pack_pulls.open_id + leaderboard opt-in

Revision ID: b8dae2f406c9
Revises: a7c9e1f3b5d7
Create Date: 2026-07-13 00:00:00.000000

Server-authoritative pack rolls. Additive: a new ``pack_opens`` table (authoritative roll +
open-time prices, drives the UTC daily quota), an optional ``pack_pulls.open_id`` provenance FK,
and a rename of the vestigial, unused ``users.show_value_on_leaderboard`` column to
``leaderboard_opt_in`` (the explicit best-pulls leaderboard opt-in). No data is dropped.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b8dae2f406c9"
down_revision: str | None = "a7c9e1f3b5d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pack_opens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("set_id", sa.String(length=16), nullable=False),
        sa.Column(
            "opened_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("rolled_cards", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["set_id"], ["sets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pack_opens_user_id", "pack_opens", ["user_id"])
    op.create_index("ix_pack_opens_opened_at", "pack_opens", ["opened_at"])
    op.create_index("ix_pack_opens_user_opened", "pack_opens", ["user_id", "opened_at"])

    op.add_column("pack_pulls", sa.Column("open_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_pack_pulls_open_id",
        "pack_pulls",
        "pack_opens",
        ["open_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_pack_pulls_open_id", "pack_pulls", ["open_id"])

    # Rename the vestigial (unused) leaderboard column to its new, accurate purpose. Preserves
    # the NOT NULL + false default; the column carried no meaningful data.
    op.alter_column("users", "show_value_on_leaderboard", new_column_name="leaderboard_opt_in")


def downgrade() -> None:
    op.alter_column("users", "leaderboard_opt_in", new_column_name="show_value_on_leaderboard")
    op.drop_index("ix_pack_pulls_open_id", table_name="pack_pulls")
    op.drop_constraint("fk_pack_pulls_open_id", "pack_pulls", type_="foreignkey")
    op.drop_column("pack_pulls", "open_id")
    op.drop_index("ix_pack_opens_user_opened", table_name="pack_opens")
    op.drop_index("ix_pack_opens_opened_at", table_name="pack_opens")
    op.drop_index("ix_pack_opens_user_id", table_name="pack_opens")
    op.drop_table("pack_opens")
