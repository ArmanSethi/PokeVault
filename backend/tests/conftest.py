"""Shared pytest fixtures."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.db.session import get_session
from app.main import app


@pytest.fixture
async def client() -> AsyncClient:
    """An HTTPX client wired to the ASGI app (no network, no server)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def db_session() -> AsyncSession:
    """A session bound to an outer transaction that is rolled back after the test.

    Uses ``join_transaction_mode="create_savepoint"`` so the app's own ``commit()`` calls
    become savepoint releases inside the outer transaction — nothing persists. Skips the
    test if no database is reachable, so DB-dependent tests are opt-in on infra.

    A dedicated NullPool engine is built per test so each connection lives on that test's
    own event loop (pytest-asyncio uses a fresh loop per test); sharing the app's pooled
    engine across loops raises cross-loop asyncpg errors.
    """
    test_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        conn = await test_engine.connect()
    except Exception as exc:  # noqa: BLE001 - any connection failure means "no DB here"
        await test_engine.dispose()
        pytest.skip(f"No database available: {exc}")
    trans = await conn.begin()
    session = AsyncSession(
        bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )
    try:
        yield session
    finally:
        await session.close()
        await trans.rollback()
        await conn.close()
        await test_engine.dispose()


@pytest.fixture
async def auth_client(db_session: AsyncSession) -> AsyncClient:
    """ASGI client whose ``get_session`` dependency uses the rollback session."""

    async def _override_session():
        yield db_session

    app.dependency_overrides[get_session] = _override_session
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_session, None)
