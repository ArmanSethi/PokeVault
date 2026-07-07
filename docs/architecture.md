# Architecture

> Draft — fill in as the system takes shape.

## Overview

PokéVault is a two-tier web application:

- **Frontend** — a React SPA (Vite + TypeScript + Tailwind) served as static assets.
  It talks to the backend exclusively over the versioned JSON API (`/api/v1`).
- **Backend** — a FastAPI service exposing the REST API, backed by Postgres via
  SQLAlchemy (async). Schema changes are managed with Alembic migrations.
- **Database** — Supabase-managed Postgres. A single `DATABASE_URL` is used for now;
  a dedicated production database is introduced at deploy time.

## Request flow

```
Browser ──HTTP──▶ Vite dev server (:5173)
   │                   │  (dev proxy / VITE_API_URL)
   └────── JSON ───────┴──▶ FastAPI (:8000) ──asyncpg──▶ Supabase Postgres
```

## Backend layering

- `app/api/` — HTTP layer: routers, endpoint handlers, request dependencies.
- `app/schemas/` — Pydantic models for request/response validation.
- `app/services/` — business logic (pricing, valuation), kept out of handlers.
- `app/ingest/` — pokemontcg.io catalog + price ingestion (client, mappers, sync CLI).
- `app/models/` — SQLAlchemy ORM models (the persistence layer).
- `app/db/` — engine, session factory, declarative base (`base_class.py` holds `Base`;
  `base.py` imports every model so Alembic autogenerate sees them).
- `app/core/` — configuration and cross-cutting concerns (settings, security).

## Catalog ingestion

`app/ingest/` populates `sets`, `cards`, and `card_prices_current` from the
pokemontcg.io v2 API, run as a standalone CLI (`python -m app.ingest.sync_catalog`):

```
pokemontcg.io v2 ──httpx (X-Api-Key)──▶ client.py ──raw JSON──▶ mappers.py ──column values──▶ sync_catalog.py ──upsert──▶ Postgres
```

- `client.py` — async client: pagination (`pageSize=250`), exponential backoff on
  429/5xx (honors `Retry-After`), keyless fallback at reduced rate limits.
- `mappers.py` — pure API-JSON → column-value functions (no DB/session), unit-testable.
- `sync_catalog.py` — idempotent `INSERT ... ON CONFLICT DO UPDATE`, committed per set
  (resumable); flags `--start-at`, `--sets`, `--page-size`, `--dry-run`.

See [data-model.md](data-model.md) for the schema and price-mapping details.

## Open questions

- Authentication model (Supabase Auth vs. app-managed JWT).
- Price-refresh scheduling (how/when to re-run the sync) and backfilling `price_history`
  (currently defined but not written by the sync).
- Caching layer for pricing lookups.
