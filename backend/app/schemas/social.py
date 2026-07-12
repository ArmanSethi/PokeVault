"""Schemas for friends + direct messaging."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Add-friend button state on a profile. "blocked" covers a block in EITHER direction (we don't
# reveal which side blocked). "pending_out" = you requested; "pending_in" = they requested you.
FriendState = Literal["none", "pending_out", "pending_in", "friends", "blocked", "self"]


class FriendRequestCreate(BaseModel):
    handle: str


class FriendUser(BaseModel):
    """A user as shown in friend/conversation lists."""

    user_id: uuid.UUID
    handle: str | None = None
    is_public: bool = False


class FriendRequestRead(BaseModel):
    id: int
    user: FriendUser  # the other party
    direction: Literal["incoming", "outgoing"]
    created_at: datetime


class FriendStateRead(BaseModel):
    state: FriendState
    user_id: uuid.UUID | None = None  # the viewed user's id (authed viewer only), to start a chat


# ---- messaging ----


class StartConversationRequest(BaseModel):
    friend_user_id: uuid.UUID


class LastMessage(BaseModel):
    body: str
    created_at: datetime
    sender_is_me: bool


class ConversationRead(BaseModel):
    id: int
    other: FriendUser
    last_message: LastMessage | None = None
    unread_count: int = 0


class MessageRead(BaseModel):
    id: int
    sender_is_me: bool
    body: str
    created_at: datetime
    read_at: datetime | None = None


class ConversationDetail(BaseModel):
    id: int
    other: FriendUser
    messages: list[MessageRead] = []


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class UnreadCount(BaseModel):
    unread: int
