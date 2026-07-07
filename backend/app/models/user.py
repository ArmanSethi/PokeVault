"""ORM model for the local mirror of Supabase Auth users.

Supabase owns the canonical `auth.users` table. We keep a thin mirror in our own schema,
keyed by the same UUID (the JWT ``sub``), so app tables (e.g. collection entries) can
carry a foreign key to a user we control. Rows are upserted on each authenticated request.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class User(Base):
    """A user, mirrored from Supabase Auth by their token ``sub`` UUID."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)  # == Supabase auth uid
    email: Mapped[str | None] = mapped_column(String(320), default=None)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
