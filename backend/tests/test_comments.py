"""Showcase-comments tests: real DB via db_session (service layer), plus pure schema checks."""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.models.user import User
from app.schemas.comment import CommentCreate
from app.services import comments as svc


def _h() -> str:
    return "u" + uuid.uuid4().hex[:12]


async def _user(db_session, *, public=True, comments_enabled=True) -> User:
    u = User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4().hex[:8]}@pokevault.dev",
        handle=_h(),
        is_public=public,
        comments_enabled=comments_enabled,
    )
    db_session.add(u)
    await db_session.flush()
    return u


def test_length_cap_and_empty_rejected():
    CommentCreate(body="ok")
    CommentCreate(body="x" * 500)
    with pytest.raises(ValidationError):
        CommentCreate(body="x" * 501)
    with pytest.raises(ValidationError):
        CommentCreate(body="")


async def test_post_list_newest_first_and_body_verbatim(db_session):
    owner = await _user(db_session)
    author = await _user(db_session)
    await svc.add_comment(db_session, owner.handle, author, CommentCreate(body="first"))
    xss = "<img src=x onerror=alert(1)>"  # stored raw; the frontend escapes on render
    await svc.add_comment(db_session, owner.handle, author, CommentCreate(body=xss))
    lst = await svc.list_comments(db_session, owner.handle, viewer=author)
    assert lst is not None and lst.comments_enabled is True
    assert [c.body for c in lst.comments] == [xss, "first"]  # newest first, verbatim
    assert lst.comments[0].author_handle == author.handle
    assert all(c.can_delete for c in lst.comments)  # author can delete own


async def test_rate_limit(db_session):
    owner = await _user(db_session)
    author = await _user(db_session)
    for _ in range(svc.RATE_MAX):
        await svc.add_comment(db_session, owner.handle, author, CommentCreate(body="hi"))
    with pytest.raises(svc.RateLimited):
        await svc.add_comment(db_session, owner.handle, author, CommentCreate(body="one too many"))


async def test_disabled_and_not_public(db_session):
    off = await _user(db_session, comments_enabled=False)
    author = await _user(db_session)
    with pytest.raises(svc.CommentsDisabled):
        await svc.add_comment(db_session, off.handle, author, CommentCreate(body="nope"))
    private = await _user(db_session, public=False)
    assert await svc.list_comments(db_session, private.handle, viewer=None) is None
    with pytest.raises(svc.ProfileNotPublic):
        await svc.add_comment(db_session, private.handle, author, CommentCreate(body="nope"))


async def test_delete_permissions(db_session):
    owner = await _user(db_session)
    author = await _user(db_session)
    stranger = await _user(db_session)
    c = await svc.add_comment(db_session, owner.handle, author, CommentCreate(body="hey"))

    # Stranger cannot delete.
    assert await svc.delete_comment(db_session, owner.handle, stranger, c.id) is False
    # Owner can delete any comment on their showcase.
    assert await svc.delete_comment(db_session, owner.handle, owner, c.id) is True
    assert (await svc.list_comments(db_session, owner.handle, viewer=owner)).comments == []

    # Author can delete their own.
    c2 = await svc.add_comment(db_session, owner.handle, author, CommentCreate(body="again"))
    assert await svc.delete_comment(db_session, owner.handle, author, c2.id) is True


async def test_viewer_can_delete_flags(db_session):
    owner = await _user(db_session)
    author = await _user(db_session)
    stranger = await _user(db_session)
    await svc.add_comment(db_session, owner.handle, author, CommentCreate(body="x"))
    # Owner sees can_delete; stranger does not; anonymous does not.
    assert (await svc.list_comments(db_session, owner.handle, viewer=owner)).comments[0].can_delete
    assert (
        not (await svc.list_comments(db_session, owner.handle, viewer=stranger))
        .comments[0]
        .can_delete
    )
    assert (
        not (await svc.list_comments(db_session, owner.handle, viewer=None)).comments[0].can_delete
    )
