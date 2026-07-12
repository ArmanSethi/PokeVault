"""drop collection_entries.notes

Revision ID: c9e2f4a6b8d1
Revises: b8dae2f406c9
Create Date: 2026-07-13 00:00:00.000000

Removes the per-entry free-text ``notes`` field entirely (feature removed). DESTRUCTIVE — drops
the column and its data. Apply only AFTER the notes-free backend is deployed, so a running
instance never selects a missing column. ``downgrade`` re-adds the (nullable) column but not data.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c9e2f4a6b8d1"
down_revision: str | None = "b8dae2f406c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("collection_entries", "notes")


def downgrade() -> None:
    op.add_column(
        "collection_entries",
        sa.Column("notes", sa.String(length=1024), nullable=True),
    )
