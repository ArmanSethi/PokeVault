"""ORM model for comments on public showcase pages.

One flat thread per public profile. Every comment ties to a real account (``author_user_id``)
with a ``created_at`` for accountability; ``is_reported`` flags it for owner/admin review.
Separate from every other table — comments never touch collection/wishlist/deck data.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base
from app.models.user import User


class ShowcaseComment(Base):
    """A comment left on a user's public showcase (/u/<handle>)."""

    __tablename__ = "showcase_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    author_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    body: Mapped[str] = mapped_column(String(500))
    is_reported: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    author: Mapped[User] = relationship(foreign_keys=[author_user_id])
