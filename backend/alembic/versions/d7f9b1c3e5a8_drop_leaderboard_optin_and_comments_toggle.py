"""drop users.leaderboard_opt_in and users.comments_enabled

Revision ID: d7f9b1c3e5a8
Revises: c4e6a8b02d3f
Create Date: 2026-07-15 00:00:00.000000

DESTRUCTIVE. Removes two now-unused ``users`` columns:

* ``leaderboard_opt_in`` — the best-pulls leaderboard no longer has an opt-in gate. Eligibility
  is now simply "has a handle + ≥1 kept pull". Dropping this permanently discards each user's
  stored opt-in choice.
* ``comments_enabled`` — the "Allow comments on my showcase" toggle was removed; comments are
  always enabled on a public showcase. Dropping this permanently discards any per-user
  "comments off" preference (those showcases now accept comments like everyone else).

The downgrade re-adds both columns with their original defaults
(``leaderboard_opt_in`` → false, ``comments_enabled`` → true) but CANNOT restore prior values.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d7f9b1c3e5a8"
down_revision: str | None = "c4e6a8b02d3f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("users", "leaderboard_opt_in")
    op.drop_column("users", "comments_enabled")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("comments_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "users",
        sa.Column("leaderboard_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
