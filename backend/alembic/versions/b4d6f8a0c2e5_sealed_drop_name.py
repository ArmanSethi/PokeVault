"""drop sealed_items.name

Revision ID: b4d6f8a0c2e5
Revises: a3c5e7b9d1f4
Create Date: 2026-07-16 00:00:00.000000

The sealed add/edit form no longer has a name/label field, so the column is unused; drop it.
Downgrade re-adds it (nullable). Additive/reversible.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4d6f8a0c2e5"
down_revision: str | None = "a3c5e7b9d1f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("sealed_items", "name")


def downgrade() -> None:
    op.add_column("sealed_items", sa.Column("name", sa.String(length=200), nullable=True))
