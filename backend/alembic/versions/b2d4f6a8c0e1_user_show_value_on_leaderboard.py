"""user show_value_on_leaderboard

Revision ID: b2d4f6a8c0e1
Revises: a1c2d3e4f5a6
Create Date: 2026-07-12 00:00:00.000000

Adds the opt-in flag controlling whether a user's exact portfolio value is displayed on the
public leaderboard. Additive; defaults to false (hidden) for all existing rows.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2d4f6a8c0e1"
down_revision: str | None = "a1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "show_value_on_leaderboard",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "show_value_on_leaderboard")
