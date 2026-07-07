# PokéVault

A Pokémon-only, web-based collection tracker — track the cards you own across sets,
variants, and conditions, with valuation and import tooling. (An advanced Collectr clone.)

## Tech stack

- **Backend:** FastAPI · SQLAlchemy · Alembic · Python 3.11+ (managed with `uv`)
- **Frontend:** Vite · React · TypeScript · Tailwind CSS (managed with `pnpm`)
- **Database:** Postgres (Supabase managed)
- **Tooling:** pre-commit · ruff · eslint · prettier

## Repository layout

| Path        | What lives here                                |
| ----------- | ---------------------------------------------- |
| `backend/`  | FastAPI service, ORM models, migrations, tests |
| `frontend/` | React SPA (Vite + Tailwind)                    |
| `docs/`     | Architecture, data model, decision records     |

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
cp .env.example .env
pnpm install
pnpm dev
```

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
