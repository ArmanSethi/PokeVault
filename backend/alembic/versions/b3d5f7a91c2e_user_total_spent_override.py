"""per-user total_spent_override

Revision ID: b3d5f7a91c2e
Revises: a2c4e6f80b1d
Create Date: 2026-07-14 00:00:00.000000

Adds a nullable ``users.total_spent_override`` (Numeric(13, 2)) — the manually-entered
"Total spent" figure shown on the dashboard. NULL means unset (the tile shows a neutral empty
state). There is no auto-calculation; this column is the sole source of the dashboard's Total
spent. Private to the owner; never projected onto the public showcase.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b3d5f7a91c2e"
down_revision: str | None = "a2c4e6f80b1d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("total_spent_override", sa.Numeric(precision=13, scale=2), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "total_spent_override")
