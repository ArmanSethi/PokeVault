"""Pydantic schemas for users."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str | None = None
    handle: str | None = None
    is_public: bool = False
    show_value_on_leaderboard: bool = False
    created_at: datetime


class UserProfileUpdate(BaseModel):
    """Owner-editable profile fields for the public showcase."""

    # Lowercase slug used in the showcase URL (/u/{handle}); 3–30 chars, url-safe.
    handle: str | None = Field(default=None, pattern=r"^[a-z0-9_-]{3,30}$")
    is_public: bool | None = None
    show_value_on_leaderboard: bool | None = None
