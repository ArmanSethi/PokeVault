"""profile columns, wishlist, user stats, alert log

Revision ID: a1c2d3e4f5a6
Revises: fb4fc2a4be0c
Create Date: 2026-07-10 00:00:00.000000

Adds public-showcase profile columns to ``users`` and three new tables backing the
differentiation features: ``wishlist_items``, ``user_stats``, and ``alert_log``.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1c2d3e4f5a6"
down_revision: str | None = "fb4fc2a4be0c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- users: public-showcase profile columns ---
    op.add_column("users", sa.Column("handle", sa.String(length=30), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "is_public", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
    )
    op.create_index(op.f("ix_users_handle"), "users", ["handle"], unique=True)

    # --- wishlist_items ---
    op.create_table(
        "wishlist_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("card_id", sa.String(length=32), nullable=False),
        sa.Column("target_price", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "card_id", name="uq_wishlist_user_card"),
    )
    op.create_index(
        op.f("ix_wishlist_items_card_id"), "wishlist_items", ["card_id"], unique=False
    )
    op.create_index(
        op.f("ix_wishlist_items_user_id"), "wishlist_items", ["user_id"], unique=False
    )

    # --- user_stats ---
    op.create_table(
        "user_stats",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "current_streak", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "longest_streak", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column("last_active_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )

    # --- alert_log ---
    op.create_table(
        "alert_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("card_id", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("triggered_price", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("target_price", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column(
            "snapshot_date", sa.Date(), server_default=sa.func.current_date(), nullable=False
        ),
        sa.Column(
            "delivered", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "card_id", "kind", "snapshot_date", name="uq_alert_user_card_kind_day"
        ),
    )
    op.create_index(op.f("ix_alert_log_card_id"), "alert_log", ["card_id"], unique=False)
    op.create_index(op.f("ix_alert_log_user_id"), "alert_log", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_alert_log_user_id"), table_name="alert_log")
    op.drop_index(op.f("ix_alert_log_card_id"), table_name="alert_log")
    op.drop_table("alert_log")

    op.drop_table("user_stats")

    op.drop_index(op.f("ix_wishlist_items_user_id"), table_name="wishlist_items")
    op.drop_index(op.f("ix_wishlist_items_card_id"), table_name="wishlist_items")
    op.drop_table("wishlist_items")

    op.drop_index(op.f("ix_users_handle"), table_name="users")
    op.drop_column("users", "is_public")
    op.drop_column("users", "handle")
