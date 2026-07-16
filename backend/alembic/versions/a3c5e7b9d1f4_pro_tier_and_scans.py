"""pro tier flag + scans table

Revision ID: a3c5e7b9d1f4
Revises: f1a3d5b7c9e2
Create Date: 2026-07-16 00:00:00.000000

Free/Pro tier gating. Adds ``users.is_pro`` (default false) — the whole entitlement for now
(granted manually; a future Stripe integration will just set this same flag). Adds the ``scans``
table so the daily scan quota can be counted query-time from UTC timestamps (mirrors pack_opens),
with no reset job. Additive.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3c5e7b9d1f4"
down_revision: str | None = "f1a3d5b7c9e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_pro", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.create_table(
        "scans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "scanned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scans_user_id", "scans", ["user_id"])
    op.create_index("ix_scans_scanned_at", "scans", ["scanned_at"])
    op.create_index("ix_scans_user_scanned", "scans", ["user_id", "scanned_at"])


def downgrade() -> None:
    op.drop_index("ix_scans_user_scanned", table_name="scans")
    op.drop_index("ix_scans_scanned_at", table_name="scans")
    op.drop_index("ix_scans_user_id", table_name="scans")
    op.drop_table("scans")
    op.drop_column("users", "is_pro")
