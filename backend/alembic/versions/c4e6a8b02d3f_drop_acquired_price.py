"""drop collection_entries.acquired_price

Revision ID: c4e6a8b02d3f
Revises: b3d5f7a91c2e
Create Date: 2026-07-14 00:00:00.000000

DESTRUCTIVE. Removes the ``collection_entries.acquired_price`` column. The "acquired price"
(cost-basis) concept has been removed everywhere; "Total spent" is now driven solely by the
manual ``users.total_spent_override``. Dropping this column permanently discards any stored
per-entry acquired prices.

The downgrade re-adds the column (nullable) but CANNOT restore the dropped values.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4e6a8b02d3f"
down_revision: str | None = "d5b7e9f1a2c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("collection_entries", "acquired_price")


def downgrade() -> None:
    op.add_column(
        "collection_entries",
        sa.Column("acquired_price", sa.Numeric(precision=10, scale=2), nullable=True),
    )
