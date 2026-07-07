"""Smoke test for the health endpoint."""

from __future__ import annotations

from httpx import AsyncClient

from app.core.config import settings


async def test_health(client: AsyncClient) -> None:
    resp = await client.get(f"{settings.API_V1_PREFIX}/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
