"""Public (unauthenticated) endpoints: showcases + sitemap.

These expose only public-safe projections (see ``app/services/public.py``). The sitemap
is registered separately (in the v1 router) so it resolves at ``/sitemap.xml`` behind a
Vercel rewrite, not under the ``/public`` prefix.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, OptionalUser, get_session
from app.schemas.comment import CommentCreate, CommentList, CommentRead
from app.schemas.public import PublicCollection, PublicProfile
from app.services import comments as comment_service
from app.services import public as public_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("/u/{handle}", response_model=PublicProfile)
async def get_public_profile(handle: str, session: SessionDep) -> PublicProfile:
    """Headline stats for a public showcase (404 if the handle is unknown or private)."""
    profile = await public_service.public_profile(session, handle)
    if profile is None:
        raise HTTPException(status_code=404, detail="Showcase not found")
    return profile


@router.get("/u/{handle}/collection", response_model=PublicCollection)
async def get_public_collection(handle: str, session: SessionDep) -> PublicCollection:
    """A public showcase's card list — public-safe fields only (no cost basis)."""
    collection = await public_service.public_collection(session, handle)
    if collection is None:
        raise HTTPException(status_code=404, detail="Showcase not found")
    return collection


@router.get("/u/{handle}/comments", response_model=CommentList)
async def list_comments(handle: str, session: SessionDep, viewer: OptionalUser) -> CommentList:
    """Comments on a public showcase, newest first (public; 404 if the profile isn't public)."""
    result = await comment_service.list_comments(session, handle, viewer)
    if result is None:
        raise HTTPException(status_code=404, detail="Showcase not found")
    return result


@router.post("/u/{handle}/comments", response_model=CommentRead, status_code=201)
async def post_comment(
    handle: str, session: SessionDep, user: CurrentUser, data: CommentCreate
) -> CommentRead:
    """Post a comment (auth required). 403 if comments are disabled; 429 if rate-limited."""
    try:
        return await comment_service.add_comment(session, handle, user, data)
    except comment_service.ProfileNotPublic:
        raise HTTPException(status_code=404, detail="Showcase not found") from None
    except comment_service.CommentsDisabled:
        raise HTTPException(
            status_code=403, detail="Comments are turned off for this showcase."
        ) from None
    except comment_service.RateLimited:
        raise HTTPException(
            status_code=429, detail="You're commenting too fast — try again in a moment."
        ) from None


@router.delete("/u/{handle}/comments/{comment_id}", status_code=204)
async def delete_comment(
    handle: str, session: SessionDep, user: CurrentUser, comment_id: int
) -> None:
    """Delete a comment (auth required; must be the comment's author or the profile owner)."""
    if not await comment_service.delete_comment(session, handle, user, comment_id):
        raise HTTPException(status_code=404, detail="Comment not found")
