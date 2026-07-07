# PokéVault — Backend

FastAPI service for the PokéVault collection tracker.

## Stack

FastAPI · SQLAlchemy 2 (async) · Alembic · Postgres (Supabase) · Python 3.11+ · `uv`.

## Setup

```bash
cp .env.example .env          # fill in DATABASE_URL from your Supabase project
uv sync                       # create the venv and install deps (incl. dev group)
```

## Run

```bash
uv run uvicorn app.main:app --reload
```

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/v1/health

## Migrations (Alembic)

```bash
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

Alembic reads the database URL from the environment (`ALEMBIC_DATABASE_URL`, falling
back to `DATABASE_URL`) and rewrites the async driver to a sync one for migrations.

## Tests & lint

```bash
uv run pytest
uv run ruff check .
uv run ruff format .
```

## Layout

```
app/
├── main.py           # app factory + router registration
├── core/             # config (pydantic-settings), security helpers
├── db/               # engine, session factory, declarative base
├── models/           # SQLAlchemy ORM models
├── schemas/          # Pydantic request/response models
├── api/              # routers, deps, versioned endpoints (v1/)
└── services/         # business logic
```
