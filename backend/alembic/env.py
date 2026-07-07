"""Alembic migration environment.

Resolves the database URL from the environment and rewrites the async driver to a
synchronous one (psycopg) for running migrations.
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

from app.db.base import Base  # noqa: F401 — populates Base.metadata via model imports

# Load backend/.env so DATABASE_URL is available when running Alembic directly
# (the app uses pydantic-settings for this; Alembic reads os.environ). An explicit
# environment variable still wins over the .env file.
load_dotenv(override=False)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _sync_database_url() -> str:
    """Return a sync SQLAlchemy URL for migrations.

    Prefers ALEMBIC_DATABASE_URL, falls back to DATABASE_URL, and swaps the async
    asyncpg driver for the sync psycopg driver.
    """
    url = os.getenv("ALEMBIC_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "Set ALEMBIC_DATABASE_URL or DATABASE_URL in the environment to run migrations."
        )
    return url.replace("+asyncpg", "+psycopg")


def run_migrations_offline() -> None:
    context.configure(
        url=_sync_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _sync_database_url()
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
