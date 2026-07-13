# PokéVault

A free, Pokémon-only, multi-user web app to track the cards you own across every English
set — with live market prices, total portfolio value, set-completion progress, self-built
price-history charts, and free photo scanning. A free clone of Collectr: every dependency and
hosted service runs on a free tier; the features Collectr paywalls (unlimited scanning, full
price visibility) are free here.

## Features

- **Full English catalog** — ~173 sets / ~20k cards from pokemontcg.io, browsable/searchable with
  current TCGPlayer (USD) prices, rarity filter + sort.
- **Auth** — Supabase accounts; the API verifies Supabase JWTs (JWKS).
- **Collection & portfolio** — per-user cards (quantity, condition, grade, foil, per-unit acquired
  price); portfolio value, total spent, per-set breakdown, and portfolio value over time.
- **Price history** — pokemontcg.io has none, so PokéVault snapshots tracked cards **daily** into
  its own table; card + portfolio charts fill in over time.
- **Wishlist & alerts** and a **dream-deck builder**.
- **Pack simulator** — server-rolled packs (approximate odds) with an animated flip-stack reveal, a
  virtual **Vault** (kept pulls, fully separate from your real collection), and an opt-in
  **best-pulls leaderboard** (daily worldwide top-10 + total-value day/month/all-time windows).
- **Public showcase** at `/u/:handle` with comments.
- **Friends & direct messaging** — mutual-friend-gated 1:1 text chat (manual refresh), with block.
- **Free OCR scanning** — upload a photo; Tesseract + fuzzy matching propose catalog candidates
  (never auto-adds).

## Tech stack

- **Backend:** FastAPI · SQLAlchemy 2 (async) · Alembic · Python 3.11+ (managed with `uv`)
- **Frontend:** Vite · React 19 · TypeScript · Tailwind CSS v4 (managed with `pnpm`)
- **Database / Auth:** Supabase (Postgres + Auth)
- **OCR / matching:** Tesseract (`pytesseract`) · Pillow · RapidFuzz
- **Deploy (all free):** Render (API) · Vercel (SPA) · GitHub Actions (daily snapshot)
- **Tooling:** pre-commit · ruff · eslint · prettier

## Repository layout

| Path        | What lives here                                |
| ----------- | ---------------------------------------------- |
| `backend/`  | FastAPI service, ORM models, migrations, tests |
| `frontend/` | React SPA (Vite + Tailwind)                    |

## Prerequisites

- Python 3.11+ and [`uv`](https://docs.astral.sh/uv/)
- Node 20+ and [`pnpm`](https://pnpm.io/)
- A Supabase project (for the Postgres `DATABASE_URL`)

## Getting started

### Backend

```bash
cd backend
cp .env.example .env          # then fill in DATABASE_URL from Supabase
uv sync                       # create venv + install deps
uv run alembic upgrade head   # apply migrations
uv run uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
cp .env.example .env          # fill VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
pnpm install
pnpm dev
```

### Load the catalog + build price history

```bash
cd backend
uv run python -m app.ingest.sync_catalog     # full pokemontcg.io sync (idempotent, resumable)
uv run python -m app.ingest.snapshot_prices  # today's price-history snapshot (idempotent)
```

Scanning also needs the **Tesseract** binary locally
(`winget install UB-Mannheim.TesseractOCR`, then confirm `tesseract --version`).

## Deployment

All free tier (Render + Vercel + Supabase + GitHub Actions). See
[docs/deployment.md](docs/deployment.md) for the step-by-step checklist.

### Pre-commit (once, from repo root)

```bash
pre-commit install
```

## Environment variables

See `backend/.env.example` and `frontend/.env.example`. Real `.env` files are
gitignored — never commit secrets.

## Project docs

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Decision records](docs/decisions/)

## License

TBD.
