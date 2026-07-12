"""1:1 direct messaging.

Guards run on EVERY call (a pair can unfriend/block after a conversation exists):
- send: requires an accepted friendship AND no block in either direction.
- fetch: requires being a participant AND no active block (unfriended-but-not-blocked users can
  still read history, but can't send).
Bodies are stored as plain text (max 2000, enforced here too) and escaped on render. A rolling
per-user rate limit blunts spam (mirrors the comments limiter).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.social import Conversation, Message
from app.models.user import User
from app.schemas.social import (
    ConversationDetail,
    ConversationRead,
    FriendUser,
    LastMessage,
    MessageRead,
)
from app.services import friends as friends_service

RATE_MAX = 20
RATE_WINDOW = timedelta(seconds=60)
MAX_BODY = 2000


class NotAllowed(Exception):
    """No accepted friendship, or a block exists (→ 403)."""


class NotParticipant(Exception):
    """The conversation doesn't exist or isn't the caller's (→ 404)."""


class RateLimited(Exception):
    """Too many messages sent recently (→ 429)."""


def _other_id(conv: Conversation, me_id: uuid.UUID) -> uuid.UUID | None:
    if me_id == conv.user_a_id:
        return conv.user_b_id
    if me_id == conv.user_b_id:
        return conv.user_a_id
    return None


def _fu(user: User) -> FriendUser:
    return FriendUser(user_id=user.id, handle=user.handle, is_public=bool(user.is_public))


async def start_conversation(session: AsyncSession, me: User, friend_user_id: uuid.UUID) -> int:
    """Get-or-create the 1:1 conversation with a friend (guarded)."""
    if not await friends_service.are_friends(session, me.id, friend_user_id):
        raise NotAllowed
    if await friends_service.block_between(session, me.id, friend_user_id):
        raise NotAllowed
    conv = await friends_service.get_or_create_conversation(session, me.id, friend_user_id)
    return conv.id


async def list_conversations(session: AsyncSession, me: User) -> list[ConversationRead]:
    convs = (
        (
            await session.execute(
                select(Conversation).where(
                    or_(Conversation.user_a_id == me.id, Conversation.user_b_id == me.id)
                )
            )
        )
        .scalars()
        .all()
    )
    out: list[ConversationRead] = []
    for conv in convs:
        other_id = _other_id(conv, me.id)
        if other_id is None:
            continue
        other = await session.get(User, other_id)
        if other is None:
            continue
        last = (
            await session.execute(
                select(Message)
                .where(Message.conversation_id == conv.id)
                .order_by(Message.created_at.desc(), Message.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        unread = await session.scalar(
            select(func.count())
            .select_from(Message)
            .where(
                Message.conversation_id == conv.id,
                Message.sender_id != me.id,
                Message.read_at.is_(None),
            )
        )
        out.append(
            ConversationRead(
                id=conv.id,
                other=_fu(other),
                last_message=(
                    LastMessage(
                        body=last.body,
                        created_at=last.created_at,
                        sender_is_me=last.sender_id == me.id,
                    )
                    if last is not None
                    else None
                ),
                unread_count=unread or 0,
            )
        )
    # Newest activity first; conversations with no messages sort by creation.
    out.sort(
        key=lambda c: (
            c.last_message.created_at if c.last_message else datetime.min.replace(tzinfo=UTC)
        ),
        reverse=True,
    )
    return out


async def get_messages(session: AsyncSession, me: User, conversation_id: int) -> ConversationDetail:
    """Thread messages; marks the other party's messages read. Refuses if blocked."""
    conv = await session.get(Conversation, conversation_id)
    other_id = _other_id(conv, me.id) if conv is not None else None
    if conv is None or other_id is None:
        raise NotParticipant
    if await friends_service.block_between(session, me.id, other_id):
        raise NotAllowed
    # Mark the other party's unread messages as read (this fetch = "seen").
    await session.execute(
        update(Message)
        .where(
            Message.conversation_id == conv.id,
            Message.sender_id == other_id,
            Message.read_at.is_(None),
        )
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()
    rows = (
        (
            await session.execute(
                select(Message)
                .where(Message.conversation_id == conv.id)
                .order_by(Message.created_at, Message.id)
            )
        )
        .scalars()
        .all()
    )
    other = await session.get(User, other_id)
    return ConversationDetail(
        id=conv.id,
        other=_fu(other) if other is not None else FriendUser(user_id=other_id),
        messages=[
            MessageRead(
                id=m.id,
                sender_is_me=m.sender_id == me.id,
                body=m.body,
                created_at=m.created_at,
                read_at=m.read_at,
            )
            for m in rows
        ],
    )


async def send_message(
    session: AsyncSession, me: User, conversation_id: int, body: str
) -> MessageRead:
    conv = await session.get(Conversation, conversation_id)
    other_id = _other_id(conv, me.id) if conv is not None else None
    if conv is None or other_id is None:
        raise NotParticipant
    # Re-check the relationship on every send — friendship may have ended or a block appeared.
    if not await friends_service.are_friends(session, me.id, other_id):
        raise NotAllowed
    if await friends_service.block_between(session, me.id, other_id):
        raise NotAllowed

    content = body.strip()
    if not content or len(content) > MAX_BODY:
        raise ValueError("body must be 1..2000 chars")

    # Window computed on the DB clock (server-side) so it's robust to app/DB skew and to the
    # savepoint-frozen now() in tests: created_at and the cutoff share one time source.
    window = text(f"interval '{int(RATE_WINDOW.total_seconds())} seconds'")
    recent = await session.scalar(
        select(func.count())
        .select_from(Message)
        .where(Message.sender_id == me.id, Message.created_at >= func.now() - window)
    )
    if (recent or 0) >= RATE_MAX:
        raise RateLimited

    msg = Message(conversation_id=conv.id, sender_id=me.id, body=content)
    session.add(msg)
    await session.commit()
    await session.refresh(msg)
    return MessageRead(
        id=msg.id,
        sender_is_me=True,
        body=msg.body,
        created_at=msg.created_at,
        read_at=msg.read_at,
    )


async def unread_count(session: AsyncSession, me: User) -> int:
    """Total unread messages across all of the user's conversations (for the top-bar badge)."""
    total = await session.scalar(
        select(func.count())
        .select_from(Message)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(
            or_(Conversation.user_a_id == me.id, Conversation.user_b_id == me.id),
            Message.sender_id != me.id,
            Message.read_at.is_(None),
        )
    )
    return total or 0
