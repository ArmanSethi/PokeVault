# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## Project purpose

**PokéVault** is a Pokémon-only, multi-user, web-based card collection tracker (an
advanced Collectr clone). Users track the cards they own across sets, variants, and
conditions, with valuation and import tooling. Pokémon cards only — no other TCGs.

## Stack

| Layer     | Tech                                                             |
| --------- | --------------------------------------------------------------- |
| Backend   | FastAPI 0.139 · SQLAlchemy 2.0 (async) · Alembic 1.18 · Python 3.11 |
| DB driver | asyncpg (app) · psycopg 3 (Alembic migrations)                  |
| Models    | Pydantic 2.13 · pydantic-settings 2.14                          |
| Server    | uvicorn 0.49                                                    |
| Frontend  | Vite 8 · React 19 · TypeScript 5.6 · Tailwind CSS 4 (`@tailwindcss/vite`) |
| Database  | Postgres (Supabase-managed)                                     |
| Tooling   | uv (Python) · pnpm 10 (JS) · ruff · eslint · prettier · pre-commit |

Runtimes: Python 3.11 (pinned in `backend/.python-version`), Node `^20.19 || >=22.12`.
`uv` is invoked as `uv` if on PATH, otherwise `python -m uv`.

> **Backend version pins unverified.** The FastAPI 0.139, uvicorn 0.49, Alembic 1.18,
> Pydantic 2.13, and pydantic-settings 2.14 pins above are ahead of the latest versions
> confirmable from official docs (as of 2026-07). Verify each against actual PyPI releases
> before relying on them; keep Pydantic constrained to `>=2.7,<3`. The framework *patterns*
> (async engine, `lifespan` startup, per-request async session dependency, ORM/schema
> separation) are confirmed current and unaffected.

## Directory conventions

```
backend/          FastAPI service (uv project)
  app/
    main.py       app factory + router registration
    core/         config (pydantic-settings), security helpers
    db/           async engine, session factory, declarative Base
    models/       SQLAlchemy ORM models
    schemas/      Pydantic request/response models
    api/          routers + deps; versioned endpoints under api/v1/endpoints/
    services/     business logic (pricing, valuation) — keep out of handlers
    ingest/       pokemontcg.io catalog + price ingestion (client, mappers, sync CLI)
  alembic/        migration env + versions/
  tests/          pytest (async), ASGI client fixture in conftest.py
frontend/         Vite + React SPA (pnpm)
  src/
    lib/          api client + shared utils
    components/   reusable UI
    pages/        route-level views
    hooks/        custom React hooks
    types/        shared TS types (mirror backend schemas)
docs/             architecture, data-model, decision records (ADRs)
```

Conventions:
- New ORM models must be imported in `app/db/base.py` so Alembic autogenerate sees them.
- New endpoints go under `app/api/v1/endpoints/` and are registered in `app/api/v1/router.py`.
- Business logic lives in `app/services/`, not in endpoint handlers.
- The API is versioned; the current prefix is `/api/v1` (see `API_V1_PREFIX`).

## Data sources

### pokemontcg.io (card & set data)

- API v2, base URL: `https://api.pokemontcg.io/v2`
- Auth: send the API key in the **`X-Api-Key`** header (raises rate limits).
- Key is read from the environment — **never** hardcode it. Store it in `backend/.env`
  (gitignored) and add a placeholder to `backend/.env.example`.
- Used to seed/refresh `sets` and `cards`. Fetch logic belongs in `app/services/`.

### Supabase (auth + Postgres)

- Postgres is the primary datastore, reached via SQLAlchemy async using `DATABASE_URL`
  (asyncpg driver). Alembic swaps to psycopg for migrations.
- Supabase Auth is the intended multi-user auth provider (to be wired in; see the
  `security.py` stubs and the deferred `User`/`user_id` in the data model).
- A single `DATABASE_URL` is used for now; a dedicated production DB is added at deploy time.

## Key commands

### Backend (run from `backend/`)

```bash
cp .env.example .env                          # fill DATABASE_URL + API keys
uv sync                                        # install deps, create .venv + uv.lock
uv run uvicorn app.main:app --reload           # dev server → http://localhost:8000
uv run pytest                                  # tests
uv run ruff check . && uv run ruff format .    # lint + format
uv run alembic revision --autogenerate -m "…"  # create a migration
uv run alembic upgrade head                    # apply migrations
uv run python -m app.ingest.sync_catalog --dry-run   # fetch+map catalog, no DB writes
uv run python -m app.ingest.sync_catalog             # full pokemontcg.io sync → DB
```

Health check: `GET http://localhost:8000/api/v1/health` → `{"status":"ok"}`.
API docs: `http://localhost:8000/docs`.

### Frontend (run from `frontend/`)

```bash
cp .env.example .env      # VITE_API_URL points at the backend
pnpm install
pnpm dev                  # dev server → http://localhost:5173
pnpm build                # tsc -b && vite build
pnpm lint                 # eslint
pnpm format               # prettier --write
```

**Tailwind CSS v4 (CSS-first — no `tailwind.config.js` / `postcss.config.js`).** Install
`tailwindcss` + `@tailwindcss/vite`; wire it through Vite (not PostCSS):

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({ plugins: [react(), tailwindcss()] })
```

```css
/* src/index.css — replaces the v3 @tailwind base/components/utilities directives */
@import "tailwindcss";
```

Theme customization moves into CSS via `@theme { … }` rather than a JS config object.

### Repo root

```bash
pre-commit install        # once; runs ruff (backend) + prettier (frontend)
```

## Coding conventions

- **Typed Python everywhere.** Use type hints on all functions; model I/O with Pydantic
  schemas (`app/schemas/`), config with pydantic-settings. Keep ORM models and API
  schemas distinct. Lint/format with ruff (line length 100).
- **Typed TypeScript everywhere.** `strict` is on; no implicit `any`. Frontend types that
  mirror backend schemas live in `src/types/`.
- **No secrets in code.** API keys, DB URLs, and tokens come from the environment only.
  `.env` files are gitignored; only `.env.example` templates (placeholders) are committed.
- **Async by default** on the backend (async SQLAlchemy sessions, async endpoints).
- Prefer small, testable services over logic in route handlers.

## Current status

_Keep this section updated as the project evolves._

**Live on Render (API) + Vercel (SPA) + Supabase (Postgres/Auth), all free tier.** Backend is
covered by pytest against the live Supabase DB; frontend `pnpm build`/`lint` clean. Migrations run
on the Supabase **session pooler** (`+asyncpg` app / `+psycopg` v3 Alembic); current head is
`e1a3c5b7d9f2`. Table is `collection_entries` (code-is-truth).

Shipped features:

- **Catalog** — full English catalog (~173 sets / ~20k cards) from pokemontcg.io; browse/search,
  current TCGPlayer (USD) prices, rarity filter + sort.
- **Auth** — Supabase JWTs verified via JWKS (`app/core/security.py`); thin `users` mirror.
- **Collection & portfolio** — per-user CRUD (quantity, condition, grade, foil, per-unit
  `acquired_price`). Dashboard: portfolio value, **total spent** (Σ `acquired_price`×qty, IRL only,
  nulls skipped), per-set breakdown, and portfolio-value-over-time (per-user `portfolio_value_daily`).
- **Price history** — owned + wishlist + pull card IDs snapshotted daily (GitHub Actions) into
  `price_history`; card + portfolio series endpoints.
- **Scan** — Tesseract OCR proposes catalog matches (propose-only; the Docker image ships Tesseract).
- **Wishlist + alerts**; **Deck** (dream-deck builder).
- **Pack simulator** — its own `/simulator/*` shell (SimulatorLayout); server-authoritative roll
  (`pack_opens` + `rolled_cards`, 2 packs/day UTC quota), flip-stack reveal + original card back +
  sound/mute + reduced-motion. **Vault** (`pack_pulls`, fully separate from the IRL collection;
  duplicates stack ×N). **Best-pulls leaderboard** — daily worldwide top-10 `best_single`;
  day/month/all-time windows for `total_value`; a dedicated `leaderboard_opt_in` (separate from
  `is_public`), first-simulator-entry handle gate.
- **Public showcase** `/u/:handle` + comments. (No report feature — removed everywhere.)
- **Friends + 1:1 direct messaging** — mutual-friend gated (request → accept → message),
  manual-refresh (no realtime), text-only, block/unblock; paper-plane nav + unread badge →
  `/messages` (Chats / Requests).

**Pre-launch (human-only):** custom SMTP (Resend) for Supabase signup emails is still pending; keep
the daily snapshot GitHub Action green; rotate any secrets ever exposed on disk.
