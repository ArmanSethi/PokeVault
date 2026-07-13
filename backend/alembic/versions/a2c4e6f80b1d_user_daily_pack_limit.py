"""per-user daily_pack_limit override

Revision ID: a2c4e6f80b1d
Revises: e1a3c5b7d9f2
Create Date: 2026-07-13 00:00:00.000000

Adds a nullable ``users.daily_pack_limit`` override for the pack-simulator daily cap. NULL means
"use the default" (``simulator.DAILY_PACK_LIMIT``, currently 2); a value overrides it for that
account only. The quota logic reads the effective cap from this column and never names a user.

Also seeds the one current override: handle ``ash`` gets 100/day (testing). Keyed by handle so it
targets the intended account without hardcoding a UUID; a no-op if that handle doesn't exist.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a2c4e6f80b1d"
down_revision: str | None = "e1a3c5b7d9f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("daily_pack_limit", sa.Integer(), nullable=True))
    op.execute("UPDATE users SET daily_pack_limit = 100 WHERE handle = 'ash'")


def downgrade() -> None:
    op.drop_column("users", "daily_pack_limit")
