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
| Frontend  | Vite 7 · React 19 · TypeScript 5.6 · Tailwind CSS 4 (`@tailwindcss/vite`) |
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

**As of 2026-07-07 — Goal 0 complete; backend Goals 1–4 code-complete (see `PROGRESS.md`).**

Backend is substantially built and covered by **25 real pytest passing against the live
Supabase DB** (not stubs, not skipped). The prior "scaffold only" status below was outdated.

- ✅ Repo under **git** (baseline `f263208`); `backend/.env` gitignored.
- ✅ ORM models: `Set`, `Card`, `CollectionEntry` (has `user_id`), `CardPriceCurrent`,
  `PriceHistory`, `User`. 3 migrations applied on the Supabase **session pooler**
  (`...pooler.supabase.com:5432`, `postgres.<ref>`); `+asyncpg` app / `+psycopg` (v3) Alembic.
- ✅ **Real** endpoints: cards list/get/history, collection CRUD + summary + history, `/me`.
  Auth is genuine Supabase JWKS verification (sig/exp/aud/iss) — `app/core/security.py`.
- ✅ Ingest (`app/ingest/`): idempotent resumable sync CLI + DB-only `snapshot_prices` job.
- ✅ Frontend on **Tailwind v4 CSS-first + React 19 + Vite 8**; `pnpm build`/`lint` clean;
  both dev servers boot.

- ✅ **Goal 1 done:** full catalog synced — **173 sets / 20,314 cards / 52,021 prices**
  (DB 71 MB). Added `/sets` read API + `tests/test_catalog.py`. Sync is now batched (multi-row
  upserts per set) and resilient (per-set skip + end-of-run retry). Full suite: 38 pass, 3 skip.

**Data reality:** full English catalog ingested.
**Table naming:** `collection_entries` (not `collection_items`) — kept per code-is-truth.

- ✅ **Goal 4 done:** snapshot job runs (fixed standalone import bug); daily schedulers added
  (GitHub Actions + Task Scheduler + cron). Card + portfolio series endpoints verified.
  **Price history is owned-cards-only** (snapshot filters to `collection_entries`; `sync_catalog`
  no longer writes history) — keeps daily growth <1 MB/day within the Supabase free tier.
- ✅ **Goal 6 built:** full React 19 + Tailwind v4 SPA (auth, catalog, collection, dashboard,
  set-completion, price charts, scan). `pnpm build`/`lint` clean.
- ✅ **Goal 5 done:** OCR scan pipeline built + **verified in the Docker image** (Tesseract 5.3.0,
  `test_scan.py` 7/7 green in-container). No host Tesseract needed.
- ✅ **Goal 7 config-ready + Docker verified:** `render.yaml` (runtime: docker),
  `backend/Dockerfile` (builds clean; container serves health + 173 sets), `frontend/vercel.json`,
  `docs/deployment.md`.

**All 8 goals functionally verified.** On 2026-07-09 the full flow was driven end-to-end against
the running stack (Docker backend :8000 + Vite :5173) with a real Supabase JWT: auth/`me`,
catalog, collection + portfolio, and scan→confirm. Repo pushed to GitHub (`ArmanSethi/PokeVault`).

**Outstanding (human-only):**

- Goal 7 go-live: create Render/Vercel from the committed config (`render.yaml`,
  `frontend/vercel.json`) + set dashboard secrets; add GitHub Actions secrets for the daily snapshot.
- Recommended: rotate the DB password + API key that were exposed in `backend/.env`.
- Note: Supabase "Confirm email" is currently OFF (enabled headless signup for the e2e). Re-enable
  it (and add email templates) before real public launch.
