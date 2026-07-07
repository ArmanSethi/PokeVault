# Deployment (all free tier)

PokéVault runs entirely on free tiers: **Supabase** (Postgres + Auth), **Render** (backend),
**Vercel** (frontend), and **GitHub Actions** (daily price snapshot). Nothing here costs money.

The steps below require dashboard/account access, so they are **human-only** — Claude Code
cannot create accounts, paste secrets, or click through dashboards. Config files are already
in the repo (`render.yaml`, `frontend/vercel.json`, `.github/workflows/daily-snapshot.yml`).

## 0. Prerequisites (already done)

- Supabase project exists; `backend/.env` has a working `DATABASE_URL` (session pooler,
  `+asyncpg`, port 5432) + `POKEMONTCG_API_KEY` + `SUPABASE_URL`.
- Catalog is synced (173 sets / ~20k cards).
- Code is committed to a git repo. **Push it to GitHub** (Render + Vercel deploy from GitHub):
  ```bash
  git remote add origin https://github.com/<you>/pokevault.git
  git push -u origin main
  ```

## 1. Supabase Auth (enable email sign-up)

Dashboard → **Authentication → Providers → Email**: enable it. For the smoothest first run you
may disable "Confirm email" (or keep it on — the login page handles the confirmation notice).
Copy from **Project Settings → API**: the **Project URL** and the **anon/public** key (for the
frontend).

## 2. Backend → Render

1. Render → **New + → Blueprint**, point it at your GitHub repo. It reads `render.yaml`.
2. Set the `sync:false` env vars in the service's **Environment** tab:
   - `DATABASE_URL` — the `postgresql+asyncpg://…pooler.supabase.com:5432/postgres` URL.
   - `POKEMONTCG_API_KEY`, `SUPABASE_URL`.
   - `BACKEND_CORS_ORIGINS` — set **after** step 3 to your Vercel URL (comma-separated if more).
3. Deploy. Health check: `https://<your-api>.onrender.com/api/v1/health` → `{"status":"ok"}`.
   (Free web services sleep when idle; the first request after a while cold-starts.)

## 3. Frontend → Vercel

1. Vercel → **Add New → Project**, import the repo. Set **Root Directory = `frontend`**
   (it picks up `frontend/vercel.json`: Vite build, `dist` output, SPA rewrite).
2. **Environment Variables**:
   - `VITE_API_URL` = `https://<your-api>.onrender.com/api/v1`
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
3. Deploy. Then go back to Render and set `BACKEND_CORS_ORIGINS` to the Vercel URL
   (e.g. `https://pokevault.vercel.app`) and redeploy the backend.

## 4. Daily price snapshot → GitHub Actions

Repo → **Settings → Secrets and variables → Actions → New repository secret**, add:
`DATABASE_URL`, `POKEMONTCG_API_KEY`, `SUPABASE_URL`. The workflow
(`.github/workflows/daily-snapshot.yml`) then runs daily at 08:00 UTC (trigger it once manually
from the **Actions** tab to confirm).

## 5. Smoke test (the whole-project definition of done)

Open the Vercel URL → **sign up** → browse the catalog with live prices → **add a card** (and,
if Tesseract-backed scanning is enabled server-side, scan one) → see portfolio value,
set-completion, and a price-history point. All on free tiers.

## Notes / backlog

- The backend is stateless; scale-to-zero on Render's free tier is fine for an MVP.
- Server-side OCR scanning needs the Tesseract binary on the host — Render's native Python env
  does not include it. To enable scanning in production, deploy the backend via a Dockerfile that
  `apt-get install -y tesseract-ocr` (backlog; local dev works once Tesseract is installed).
- `/scan` is currently unauthenticated (propose-only, no writes). Consider requiring auth before
  exposing it publicly to avoid anonymous OCR compute abuse.
