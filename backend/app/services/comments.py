"""Public-showcase comments: create / list / delete / report.

Boundary: this service reads and writes ONLY ``showcase_comments`` rows, plus a single
``users`` lookup (reusing ``public._public_user``) to resolve the handle, enforce the
public-only rule, read the owner's ``comments_enabled`` flag, and authorize deletes. It never
touches collection / cost / notes or any other private data.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import ShowcaseComment
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentList, CommentRead
from app.services.public import _public_user

# Backend rate limit: at most RATE_MAX comments per author within RATE_WINDOW seconds.
RATE_MAX = 5
RATE_WINDOW = timedelta(seconds=60)


class ProfileNotPublic(Exception):
    """The handle doesn't resolve to a public profile (→ 404)."""


class CommentsDisabled(Exception):
    """The owner has turned comments off for their showcase (→ 403)."""


class RateLimited(Exception):
    """The author has posted too many comments recently (→ 429)."""


def _to_read(c: ShowcaseComment, author_handle: str | None, can_delete: bool) -> CommentRead:
    return CommentRead(
        id=c.id,
        author_handle=author_handle,
        body=c.body,
        created_at=c.created_at,
        is_reported=c.is_reported,
        can_delete=can_delete,
    )


async def list_comments(
    session: AsyncSession, handle: str, viewer: User | None
) -> CommentList | None:
    """Comments for a public profile, newest first. None if the profile isn't public."""
    profile = await _public_user(session, handle)
    if profile is None:
        return None
    rows = (
        await session.execute(
            select(ShowcaseComment, User.handle)
            .join(User, User.id == ShowcaseComment.author_user_id)
            .where(ShowcaseComment.profile_user_id == profile.id)
            .order_by(ShowcaseComment.created_at.desc(), ShowcaseComment.id.desc())
        )
    ).all()
    out: list[CommentRead] = []
    for c, author_handle in rows:
        can_delete = viewer is not None and viewer.id in (c.author_user_id, profile.id)
        out.append(_to_read(c, author_handle, can_delete))
    return CommentList(comments_enabled=profile.comments_enabled, comments=out)


async def add_comment(
    session: AsyncSession, handle: str, author: User, data: CommentCreate
) -> CommentRead:
    """Post a comment. Raises ProfileNotPublic / CommentsDisabled / RateLimited."""
    profile = await _public_user(session, handle)
    if profile is None:
        raise ProfileNotPublic
    if not profile.comments_enabled:
        raise CommentsDisabled

    cutoff = datetime.now(UTC) - RATE_WINDOW
    recent = await session.scalar(
        select(func.count())
        .select_from(ShowcaseComment)
        .where(
            ShowcaseComment.author_user_id == author.id,
            ShowcaseComment.created_at >= cutoff,
        )
    )
    if (recent or 0) >= RATE_MAX:
        raise RateLimited

    comment = ShowcaseComment(
        profile_user_id=profile.id,
        author_user_id=author.id,
        body=data.body.strip(),
    )
    session.add(comment)
    await session.commit()
    await session.refresh(comment)
    return _to_read(comment, author.handle, can_delete=True)


async def delete_comment(session: AsyncSession, handle: str, viewer: User, comment_id: int) -> bool:
    """Delete a comment if the viewer is its author or the profile owner. False otherwise."""
    profile = await _public_user(session, handle)
    if profile is None:
        return False
    comment = await session.get(ShowcaseComment, comment_id)
    if comment is None or comment.profile_user_id != profile.id:
        return False
    if viewer.id not in (comment.author_user_id, profile.id):
        return False
    await session.execute(delete(ShowcaseComment).where(ShowcaseComment.id == comment_id))
    await session.commit()
    return True


async def report_comment(session: AsyncSession, handle: str, comment_id: int) -> bool:
    """Flag a comment for owner/admin review. False if not found on this public profile."""
    profile = await _public_user(session, handle)
    if profile is None:
        return False
    comment = await session.get(ShowcaseComment, comment_id)
    if comment is None or comment.profile_user_id != profile.id:
        return False
    comment.is_reported = True
    await session.commit()
    return True
