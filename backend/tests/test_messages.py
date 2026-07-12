"""Direct-messaging service tests (real DB via db_session)."""

from __future__ import annotations

import uuid

import pytest

from app.models.user import User
from app.services import friends as fs
from app.services import messages as ms


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


async def _friends(db_session, a, b) -> None:
    await fs.request_friend(db_session, a, b.handle)
    req = next(r for r in await fs.list_requests(db_session, b) if r.direction == "incoming")
    await fs.accept_request(db_session, b, req.id)


async def test_message_flow_and_unread(db_session):
    a = await _user(db_session)
    b = await _user(db_session)
    await _friends(db_session, a, b)
    cid = await ms.start_conversation(db_session, a, b.id)

    m = await ms.send_message(db_session, a, cid, "  hello <script>alert(1)</script>  ")
    assert (
        m.body == "hello <script>alert(1)</script>"
    )  # trimmed, stored verbatim (escaped on render)

    assert await ms.unread_count(db_session, b) == 1
    assert await ms.unread_count(db_session, a) == 0

    detail = await ms.get_messages(db_session, b, cid)  # fetch marks read
    assert [msg.body for msg in detail.messages] == ["hello <script>alert(1)</script>"]
    assert await ms.unread_count(db_session, b) == 0


async def test_non_friend_cannot_start(db_session):
    a = await _user(db_session)
    b = await _user(db_session)
    with pytest.raises(ms.NotAllowed):
        await ms.start_conversation(db_session, a, b.id)


async def test_send_guard_after_unfriend(db_session):
    a = await _user(db_session)
    b = await _user(db_session)
    await _friends(db_session, a, b)
    cid = await ms.start_conversation(db_session, a, b.id)
    await ms.send_message(db_session, a, cid, "hi")
    await fs.unfriend(db_session, a, b.id)
    with pytest.raises(ms.NotAllowed):
        await ms.send_message(db_session, a, cid, "still there?")


async def test_send_and_fetch_refused_after_block(db_session):
    a = await _user(db_session)
    b = await _user(db_session)
    await _friends(db_session, a, b)
    cid = await ms.start_conversation(db_session, a, b.id)
    await fs.block(db_session, b, a.id)  # b blocks a
    with pytest.raises(ms.NotAllowed):
        await ms.send_message(db_session, a, cid, "hello?")
    with pytest.raises(ms.NotAllowed):
        await ms.get_messages(db_session, a, cid)


async def test_rate_limit(db_session):
    a = await _user(db_session)
    b = await _user(db_session)
    await _friends(db_session, a, b)
    cid = await ms.start_conversation(db_session, a, b.id)
    for _ in range(ms.RATE_MAX):
        await ms.send_message(db_session, a, cid, "spam")
    with pytest.raises(ms.RateLimited):
        await ms.send_message(db_session, a, cid, "one too many")


async def test_body_length_rejected(db_session):
    a = await _user(db_session)
    b = await _user(db_session)
    await _friends(db_session, a, b)
    cid = await ms.start_conversation(db_session, a, b.id)
    with pytest.raises(ValueError):
        await ms.send_message(db_session, a, cid, "x" * (ms.MAX_BODY + 1))
