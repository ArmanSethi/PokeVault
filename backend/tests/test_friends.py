"""Friends + blocks service tests (real DB via db_session)."""

from __future__ import annotations

import uuid

import pytest

from app.models.user import User
from app.services import friends as fs


async def _user(db_session) -> User:
    u = User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4().hex[:8]}@pv.dev",
        handle="u" + uuid.uuid4().hex[:12],
        is_public=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


async def _accept(db_session, a, b) -> None:
    await fs.request_friend(db_session, a, b.handle)
    req = next(r for r in await fs.list_requests(db_session, b) if r.direction == "incoming")
    await fs.accept_request(db_session, b, req.id)


async def test_request_accept_flow(db_session):
    a = await _user(db_session)
    b = await _user(db_session)
    await fs.request_friend(db_session, a, b.handle)
    assert await fs.friend_state(db_session, a.id, b.id) == "pending_out"
    assert await fs.friend_state(db_session, b.id, a.id) == "pending_in"

    reqs = await fs.list_requests(db_session, b)
    assert len(reqs) == 1 and reqs[0].direction == "incoming" and reqs[0].user.user_id == a.id
    await fs.accept_request(db_session, b, reqs[0].id)

    assert await fs.are_friends(db_session, a.id, b.id)
    assert await fs.friend_state(db_session, a.id, b.id) == "friends"
    assert [f.user_id for f in await fs.list_friends(db_session, a)] == [b.id]


async def test_cannot_request_self(db_session):
    a = await _user(db_session)
    with pytest.raises(fs.SelfAction):
        await fs.request_friend(db_session, a, a.handle)


async def test_duplicate_request_rejected(db_session):
    a = await _user(db_session)
    b = await _user(db_session)
    await fs.request_friend(db_session, a, b.handle)
    with pytest.raises(fs.AlreadyExists):
        await fs.request_friend(db_session, a, b.handle)


async def test_block_unfriends_and_bars_both_directions(db_session):
    a = await _user(db_session)
    b = await _user(db_session)
    await _accept(db_session, a, b)
    assert await fs.are_friends(db_session, a.id, b.id)

    await fs.block(db_session, a, b.id)
    assert not await fs.are_friends(db_session, a.id, b.id)  # block unfriended
    assert await fs.friend_state(db_session, a.id, b.id) == "blocked"
    assert await fs.friend_state(db_session, b.id, a.id) == "blocked"  # symmetric effect
    with pytest.raises(fs.Blocked):
        await fs.request_friend(db_session, a, b.handle)
    with pytest.raises(fs.Blocked):
        await fs.request_friend(db_session, b, a.handle)


async def test_only_blocker_can_unblock(db_session):
    a = await _user(db_session)
    b = await _user(db_session)
    await fs.block(db_session, a, b.id)
    # b is not the blocker → their unblock is a no-op.
    await fs.unblock(db_session, b, a.id)
    assert await fs.block_between(db_session, a.id, b.id)
    # the blocker removes it → requests possible again.
    await fs.unblock(db_session, a, b.id)
    assert not await fs.block_between(db_session, a.id, b.id)
    await fs.request_friend(db_session, a, b.handle)
    assert await fs.friend_state(db_session, a.id, b.id) == "pending_out"


async def test_decline_removes_pending(db_session):
    a = await _user(db_session)
    b = await _user(db_session)
    await fs.request_friend(db_session, a, b.handle)
    req = (await fs.list_requests(db_session, b))[0]
    await fs.decline_request(db_session, b, req.id)
    assert await fs.friend_state(db_session, a.id, b.id) == "none"
