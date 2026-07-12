"""ORM model for the local mirror of Supabase Auth users.

Supabase owns the canonical `auth.users` table. We keep a thin mirror in our own schema,
keyed by the same UUID (the JWT ``sub``), so app tables (e.g. collection entries) can
carry a foreign key to a user we control. Rows are upserted on each authenticated request.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, String, Uuid, func
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
    # NB: the DB still has a vestigial `show_value_on_leaderboard` column from the removed
    # leaderboard feature; it's NOT NULL with a server default, so inserts that omit it are
    # fine. Left in place to avoid a destructive migration; can be dropped later.
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
