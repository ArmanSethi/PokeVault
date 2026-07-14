"""per-variant pricing: collection_entries.variant + pack_pulls.variant

Revision ID: d5b7e9f1a2c3
Revises: b3d5f7a91c2e
Create Date: 2026-07-14 00:00:00.000000

Adds a nullable ``variant`` (String(32)) to ``collection_entries`` and ``pack_pulls`` so an owned
copy / a vault pull records the exact TCGplayer printing it represents (normal, holofoil,
reverseHolofoil, 1stEdition, …) and is valued at THAT variant's market price. NULL = legacy row;
valuation falls back to the is_foil-derived variant for those (holofoil if foil else normal).

Chained BEFORE the (still-unapplied, destructive) acquired_price drop so these additive columns
can be applied without running the drop.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5b7e9f1a2c3"
down_revision: str | None = "b3d5f7a91c2e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("collection_entries", sa.Column("variant", sa.String(length=32), nullable=True))
    op.add_column("pack_pulls", sa.Column("variant", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("pack_pulls", "variant")
    op.drop_column("collection_entries", "variant")
