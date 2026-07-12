"""Friendships + blocks.

An unordered pair has one ``friendships`` row (canonical ``user_a_id < user_b_id``). Messaging
elsewhere requires an ``accepted`` friendship and no ``blocks`` row in either direction. Blocking
unfriends and bars future requests/messages until the blocker unblocks. All guards run server-side
here, not just in the UI.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.social import Block, Conversation, Friendship, canonical_pair
from app.models.user import User
from app.schemas.social import FriendRequestRead, FriendState, FriendUser


class SelfAction(Exception):
    """You can't friend/block yourself."""


class Blocked(Exception):
    """A block exists in one direction, so the action is refused."""


class AlreadyExists(Exception):
    """A pending/accepted friendship already exists."""


class NotFound(Exception):
    """The target user or the request row doesn't exist / isn't actionable by this user."""


async def _user_by_handle(session: AsyncSession, handle: str) -> User | None:
    return await session.scalar(select(User).where(User.handle == handle))


async def _friendship(session: AsyncSession, x: uuid.UUID, y: uuid.UUID) -> Friendship | None:
    a, b = canonical_pair(x, y)
    return await session.scalar(
        select(Friendship).where(Friendship.user_a_id == a, Friendship.user_b_id == b)
    )


async def block_between(session: AsyncSession, x: uuid.UUID, y: uuid.UUID) -> bool:
    """True if EITHER user has blocked the other."""
    row = await session.scalar(
        select(Block.id).where(
            or_(
                (Block.blocker_id == x) & (Block.blocked_id == y),
                (Block.blocker_id == y) & (Block.blocked_id == x),
            )
        )
    )
    return row is not None


async def are_friends(session: AsyncSession, x: uuid.UUID, y: uuid.UUID) -> bool:
    """True if x and y have an accepted friendship."""
    fr = await _friendship(session, x, y)
    return fr is not None and fr.status == "accepted"


def _fu(user: User) -> FriendUser:
    return FriendUser(user_id=user.id, handle=user.handle, is_public=bool(user.is_public))


async def friend_state(session: AsyncSession, me_id: uuid.UUID, other_id: uuid.UUID) -> FriendState:
    if me_id == other_id:
        return "self"
    if await block_between(session, me_id, other_id):
        return "blocked"
    fr = await _friendship(session, me_id, other_id)
    if fr is None:
        return "none"
    if fr.status == "accepted":
        return "friends"
    return "pending_out" if fr.requested_by == me_id else "pending_in"


async def state_for_handle(
    session: AsyncSession, me: User, handle: str
) -> tuple[FriendState, uuid.UUID]:
    target = await _user_by_handle(session, handle)
    if target is None:
        raise NotFound
    return await friend_state(session, me.id, target.id), target.id


async def request_friend(session: AsyncSession, me: User, handle: str) -> None:
    target = await _user_by_handle(session, handle)
    if target is None:
        raise NotFound
    if target.id == me.id:
        raise SelfAction
    if await block_between(session, me.id, target.id):
        raise Blocked
    if await _friendship(session, me.id, target.id) is not None:
        raise AlreadyExists
    a, b = canonical_pair(me.id, target.id)
    session.add(Friendship(user_a_id=a, user_b_id=b, status="pending", requested_by=me.id))
    await session.commit()


async def accept_request(session: AsyncSession, me: User, request_id: int) -> None:
    fr = await session.get(Friendship, request_id)
    # Only the recipient of a still-pending request may accept it.
    if fr is None or fr.status != "pending" or me.id not in (fr.user_a_id, fr.user_b_id):
        raise NotFound
    if fr.requested_by == me.id:
        raise NotFound  # can't accept your own outgoing request
    if await block_between(session, fr.user_a_id, fr.user_b_id):
        raise Blocked
    fr.status = "accepted"
    fr.accepted_at = datetime.now(UTC)
    await session.commit()


async def decline_request(session: AsyncSession, me: User, request_id: int) -> None:
    """Decline an incoming request or cancel an outgoing one (either participant, while pending)."""
    fr = await session.get(Friendship, request_id)
    if fr is None or fr.status != "pending" or me.id not in (fr.user_a_id, fr.user_b_id):
        raise NotFound
    await session.execute(delete(Friendship).where(Friendship.id == request_id))
    await session.commit()


async def list_friends(session: AsyncSession, me: User) -> list[FriendUser]:
    rows = (
        (
            await session.execute(
                select(User)
                .join(
                    Friendship,
                    or_(
                        (Friendship.user_a_id == me.id) & (Friendship.user_b_id == User.id),
                        (Friendship.user_b_id == me.id) & (Friendship.user_a_id == User.id),
                    ),
                )
                .where(Friendship.status == "accepted")
                .order_by(User.handle)
            )
        )
        .scalars()
        .all()
    )
    return [_fu(u) for u in rows]


async def list_requests(session: AsyncSession, me: User) -> list[FriendRequestRead]:
    rows = (
        (
            await session.execute(
                select(Friendship).where(
                    Friendship.status == "pending",
                    or_(Friendship.user_a_id == me.id, Friendship.user_b_id == me.id),
                )
            )
        )
        .scalars()
        .all()
    )
    out: list[FriendRequestRead] = []
    for fr in rows:
        other_id = fr.user_b_id if fr.user_a_id == me.id else fr.user_a_id
        other = await session.get(User, other_id)
        if other is None:
            continue
        direction = "outgoing" if fr.requested_by == me.id else "incoming"
        out.append(
            FriendRequestRead(
                id=fr.id, user=_fu(other), direction=direction, created_at=fr.created_at
            )
        )
    out.sort(key=lambda r: r.created_at, reverse=True)
    return out


async def unfriend(session: AsyncSession, me: User, other_id: uuid.UUID) -> None:
    a, b = canonical_pair(me.id, other_id)
    await session.execute(
        delete(Friendship).where(Friendship.user_a_id == a, Friendship.user_b_id == b)
    )
    await session.commit()


async def block(session: AsyncSession, me: User, other_id: uuid.UUID) -> None:
    if me.id == other_id:
        raise SelfAction
    a, b = canonical_pair(me.id, other_id)
    await session.execute(
        delete(Friendship).where(Friendship.user_a_id == a, Friendship.user_b_id == b)
    )
    existing = await session.scalar(
        select(Block.id).where(Block.blocker_id == me.id, Block.blocked_id == other_id)
    )
    if existing is None:
        session.add(Block(blocker_id=me.id, blocked_id=other_id))
    await session.commit()


async def unblock(session: AsyncSession, me: User, other_id: uuid.UUID) -> None:
    """Only the blocker can remove their block."""
    await session.execute(
        delete(Block).where(Block.blocker_id == me.id, Block.blocked_id == other_id)
    )
    await session.commit()


async def get_or_create_conversation(
    session: AsyncSession, x: uuid.UUID, y: uuid.UUID
) -> Conversation:
    """Canonical 1:1 conversation for a pair (created on first use)."""
    a, b = canonical_pair(x, y)
    conv = await session.scalar(
        select(Conversation).where(Conversation.user_a_id == a, Conversation.user_b_id == b)
    )
    if conv is None:
        conv = Conversation(user_a_id=a, user_b_id=b)
        session.add(conv)
        await session.commit()
        await session.refresh(conv)
    return conv
