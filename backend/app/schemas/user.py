"""Pydantic schemas for users."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

# Total spent is a manually-entered figure: 0 up to 99,999,999,999 (11 digits).
TOTAL_SPENT_MAX = Decimal("99999999999")


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str | None = None
    handle: str | None = None
    is_public: bool = False
    comments_enabled: bool = True
    leaderboard_opt_in: bool = False
    # Manual Total spent; NULL when the user hasn't set one (dashboard shows an empty state).
    total_spent_override: Decimal | None = None
    created_at: datetime


class UserProfileUpdate(BaseModel):
    """Owner-editable profile fields for the public showcase + dashboard."""

    # Lowercase slug used in the showcase URL (/u/{handle}); 3–30 chars, url-safe.
    handle: str | None = Field(default=None, pattern=r"^[a-z0-9_-]{3,30}$")
    is_public: bool | None = None
    comments_enabled: bool | None = None
    leaderboard_opt_in: bool | None = None
    # Manual Total spent. Explicitly nullable: sending ``null`` clears it back to the empty state
    # (the service distinguishes "sent null" from "field omitted" via model_fields_set).
    total_spent_override: Decimal | None = Field(default=None, ge=0, le=TOTAL_SPENT_MAX)
