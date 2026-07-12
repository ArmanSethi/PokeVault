"""Public (unauthenticated) endpoints: showcases + sitemap.

These expose only public-safe projections (see ``app/services/public.py``). The sitemap
is registered separately (in the v1 router) so it resolves at ``/sitemap.xml`` behind a
Vercel rewrite, not under the ``/public`` prefix.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.schemas.public import PublicCollection, PublicProfile
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
    """A public showcase's card list — public-safe fields only (no cost basis / notes)."""
    collection = await public_service.public_collection(session, handle)
    if collection is None:
        raise HTTPException(status_code=404, detail="Showcase not found")
    return collection
