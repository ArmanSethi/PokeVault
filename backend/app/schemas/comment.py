"""Schemas for public-showcase comments."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    # Length cap enforced here (server-side): over-long bodies are rejected with 422.
    body: str = Field(min_length=1, max_length=500)


class CommentRead(BaseModel):
    """A comment, projected for display. No user ids are exposed; ``can_delete`` is computed
    per viewer so the client can show a Delete control without learning who authored it."""

    id: int
    author_handle: str | None = None  # display only; "A collector" fallback applied client-side
    body: str
    created_at: datetime
    can_delete: bool = False


class CommentList(BaseModel):
    comments: list[CommentRead] = []
