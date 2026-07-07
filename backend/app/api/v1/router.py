"""Aggregates all v1 endpoint routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import auth, cards, collection, scan, sets

api_router = APIRouter()


@api_router.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok"}


api_router.include_router(auth.router, prefix="/me", tags=["auth"])
api_router.include_router(sets.router, prefix="/sets", tags=["sets"])
api_router.include_router(cards.router, prefix="/cards", tags=["cards"])
api_router.include_router(collection.router, prefix="/collection", tags=["collection"])
api_router.include_router(scan.router, prefix="/scan", tags=["scan"])
