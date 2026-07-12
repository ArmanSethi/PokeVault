"""showcase_comments + users.comments_enabled

Revision ID: f6b8d0e2a4c5
Revises: e5a7c9d1f3b4
Create Date: 2026-07-12 00:00:00.000000

Comments on public showcases. Adds the `showcase_comments` table and a per-user
`comments_enabled` toggle. Additive.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f6b8d0e2a4c5"
down_revision: str | None = "e5a7c9d1f3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "comments_enabled", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    op.create_table(
        "showcase_comments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("profile_user_id", sa.Uuid(), nullable=False),
        sa.Column("author_user_id", sa.Uuid(), nullable=False),
        sa.Column("body", sa.String(length=500), nullable=False),
        sa.Column("is_reported", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["profile_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_showcase_comments_profile_user_id", "showcase_comments", ["profile_user_id"])
    op.create_index("ix_showcase_comments_author_user_id", "showcase_comments", ["author_user_id"])
    op.create_index("ix_showcase_comments_created_at", "showcase_comments", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_showcase_comments_created_at", table_name="showcase_comments")
    op.drop_index("ix_showcase_comments_author_user_id", table_name="showcase_comments")
    op.drop_index("ix_showcase_comments_profile_user_id", table_name="showcase_comments")
    op.drop_table("showcase_comments")
    op.drop_column("users", "comments_enabled")
