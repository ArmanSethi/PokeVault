"""sealed_items

Revision ID: f1a3d5b7c9e2
Revises: d7f9b1c3e5a8
Create Date: 2026-07-16 00:00:00.000000

User-owned sealed product (packs, booster boxes, ETBs, bundles, …) — a domain separate from card
singles. Manual ``value`` (nullable). Optionally tied to a set via ``set_id`` (SET NULL when a set
is deleted, so the holding survives). Additive.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a3d5b7c9e2"
down_revision: str | None = "d7f9b1c3e5a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sealed_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("product_type", sa.String(length=16), nullable=False),
        sa.Column("set_id", sa.String(length=16), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("value", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["set_id"], ["sets.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sealed_items_user_id", "sealed_items", ["user_id"])
    op.create_index("ix_sealed_items_set_id", "sealed_items", ["set_id"])


def downgrade() -> None:
    op.drop_index("ix_sealed_items_set_id", table_name="sealed_items")
    op.drop_index("ix_sealed_items_user_id", table_name="sealed_items")
    op.drop_table("sealed_items")
