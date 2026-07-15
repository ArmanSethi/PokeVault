"""ORM model for the local mirror of Supabase Auth users.

Supabase owns the canonical `auth.users` table. We keep a thin mirror in our own schema,
keyed by the same UUID (the JWT ``sub``), so app tables (e.g. collection entries) can
carry a foreign key to a user we control. Rows are upserted on each authenticated request.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, Integer, Numeric, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class User(Base):
    """A user, mirrored from Supabase Auth by their token ``sub`` UUID."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)  # == Supabase auth uid
    email: Mapped[str | None] = mapped_column(String(320), default=None)
    # Public-showcase profile. ``handle`` is the URL slug (/u/{handle}); nullable until the
    # user claims one. ``is_public`` gates whether the showcase is exposed at all. Neither is
    # touched by the per-request upsert in api/deps.py, so they survive normal auth traffic.
    handle: Mapped[str | None] = mapped_column(String(30), unique=True, index=True, default=None)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # NB: comments on public showcases are always enabled (no per-user toggle), and best-pulls
    # leaderboard eligibility is simply "has a handle + ≥1 kept pull" — neither is gated by a
    # user column anymore. The old `comments_enabled` / `leaderboard_opt_in` columns were dropped.
    # Per-user override for the daily pack-open cap. NULL = use the default (see
    # simulator.DAILY_PACK_LIMIT); a value overrides it for this account only. Lets us grant a
    # higher limit (e.g. testing) without hardcoding a username in the quota logic. Not touched by
    # the per-request upsert in api/deps.py, so it survives normal auth traffic.
    daily_pack_limit: Mapped[int | None] = mapped_column(Integer, default=None)
    # Manual "Total spent" figure the user types on the dashboard. NULL = unset (the tile shows a
    # neutral empty state). There is no auto-calculation — this value is the sole source of the
    # dashboard's Total spent. Private to the owner; never projected onto the public showcase.
    total_spent_override: Mapped[Decimal | None] = mapped_column(Numeric(13, 2), default=None)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
