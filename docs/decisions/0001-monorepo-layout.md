# 0001 — Monorepo layout

- **Status:** Accepted
- **Date:** 2026-07-03

## Context

PokéVault needs a repository structure agreed before feature work begins, covering a
FastAPI backend and a React frontend, plus shared docs and tooling.

## Decision

Use a single repository with two top-level app directories and shared root tooling:

- `backend/` — FastAPI + SQLAlchemy + Alembic, Python 3.11+, managed with **uv**
  (`pyproject.toml` + `uv.lock`).
- `frontend/` — Vite + React + TypeScript + Tailwind, managed with **pnpm**.
- `docs/` — architecture, data model, and decision records.
- Root — `.gitignore`, `README.md`, and a `.pre-commit-config.yaml` running ruff
  (backend) and prettier (frontend).

Database is **Postgres only**, via **Supabase**-managed Postgres, addressed through a
single `DATABASE_URL`. No local or Docker Postgres. No Docker Compose and no CI
workflows are included in the initial scaffold.

## Consequences

- Backend and frontend version together in one repo; simple to keep API and client in
  sync.
- Contributors need both `uv` and `pnpm` installed.
- A dedicated production database and CI/CD are deferred and added at deploy time.
