"""Aggregates all v1 endpoint routers."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.api.v1.endpoints import (
    auth,
    cards,
    collection,
    deck,
    friends,
    importer,
    messages,
    public,
    pulls,
    scan,
    sealed,
    sets,
    simulator,
    wishlist,
)
from app.services import public as public_service

api_router = APIRouter()


@api_router.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok"}


@api_router.get("/sitemap.xml", include_in_schema=False)
async def sitemap(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """XML sitemap of sets, cards, and public showcases (served behind a Vercel rewrite)."""
    body = await public_service.build_sitemap(session)
    return Response(content=body, media_type="application/xml")


api_router.include_router(auth.router, prefix="/me", tags=["auth"])
api_router.include_router(sets.router, prefix="/sets", tags=["sets"])
api_router.include_router(cards.router, prefix="/cards", tags=["cards"])
api_router.include_router(collection.router, prefix="/collection", tags=["collection"])
api_router.include_router(importer.router, prefix="/collection", tags=["collection"])
api_router.include_router(sealed.router, prefix="/sealed", tags=["sealed"])
api_router.include_router(scan.router, prefix="/scan", tags=["scan"])
api_router.include_router(wishlist.router, prefix="/wishlist", tags=["wishlist"])
api_router.include_router(deck.router, prefix="/decks", tags=["decks"])
api_router.include_router(simulator.router, prefix="/simulator", tags=["simulator"])
api_router.include_router(pulls.router, prefix="/simulator", tags=["pulls"])
api_router.include_router(friends.router, prefix="/friends", tags=["friends"])
api_router.include_router(messages.router, prefix="/messages", tags=["messages"])
api_router.include_router(public.router, prefix="/public", tags=["public"])
