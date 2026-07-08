# PROGRESS

Append-only build log, newest on top. Terse: date · goal · key decisions · gotchas · next.
Detailed rationale lives in `docs/`.

---

## 2026-07-07 — Goal 7: Hardening + free deploy — config ready ⏳ (go-live is human-only)

**Hardening (done in code):** CORS is env-locked to specific origins via `BACKEND_CORS_ORIGINS`
(not `*`); API input is Pydantic-validated; the SPA has consistent loading/empty/error states.

**Deploy artifacts added:**
- `render.yaml` — Render Blueprint for the backend (free plan, uv build, `/api/v1/health`
  health check, `sync:false` secrets).
- `frontend/vercel.json` — Vite build + SPA rewrite (client routing) + output dir.
- `docs/deployment.md` — full free-tier checklist (Supabase Auth → Render → Vercel → GH Actions
  secrets → smoke test).
- Root `README.md` refreshed (features, run steps, deploy pointer).

**Go-live is human-only** (account signups + dashboard secrets): push to GitHub, create the
Render Blueprint + Vercel project, set env/secrets. See `docs/deployment.md`.

**Backend now ships as Docker** (`backend/Dockerfile`, `render.yaml` → `runtime: docker`) on the
`ghcr.io/astral-sh/uv:python3.11-bookworm-slim` base with `tesseract-ocr` installed, so
server-side `/scan` works in production. Layer-cached uv deps (`--no-dev`), venv on PATH,
`$PORT`-aware CMD. `.dockerignore` keeps secrets/caches out (but keeps `README.md` — hatchling
needs it).

**Built + verified locally:** image builds clean; `tesseract --version` → 5.3.0 in-image;
`tests/test_scan.py` → **7/7 passed inside the container**; the running container serves
`/api/v1/health` → ok and `/api/v1/sets` → 173 (live DB reachable from the container). This
also completes Goal 5's verification without any host Tesseract install.

---

## 2026-07-07 — Goal 6: Frontend SPA ✅ (full flow driven end-to-end 2026-07-09)

Full React 19 + Tailwind v4 SPA against the existing API. `pnpm build` (strict TS) + `pnpm lint`
both clean; dev server serves the app. TS types in `src/types` mirror the backend schemas 1:1.

**Interactive e2e (2026-07-09):** with `frontend/.env` configured and both servers up (Docker
backend :8000 + Vite :5173), drove the whole journey via the real API with a genuine Supabase
JWT — auth/`me`, catalog search + browse + card detail + price history, add 2 cards, list +
portfolio summary ($1,893.84 → $2,614.18) + value history, and **scan** a synthetic Charizard
photo (OCR read name+number; ranked candidates with prices) → **confirmed** into the collection.
(Supabase "Confirm email" was toggled off so signups issue a session immediately.)

**Structure:**
- `lib/supabase.ts` (client, session persistence), `lib/api.ts` (auth-aware fetch, typed methods
  for every endpoint, `ApiError`), `lib/format.ts`, `lib/useAsync.ts`.
- `context/AuthContext.tsx` — Supabase auth (sign up/in/out), session persisted + auto-refreshed.
- `components/` — `Layout` (nav), `ProtectedRoute` (auth guard), `CardTile`, `PriceChart`
  (recharts; shows a "history still building" note when sparse), `States` (Spinner/Empty/Error).
- `pages/` — Login (sign up/in), Dashboard (portfolio value + per-set + value chart), Catalog
  (search + set filter + paginated grid), CardDetail (price-history chart + add-to-collection),
  Collection (list/edit-modal/qty stepper/remove), SetCompletion (progress bars), Scan
  (upload → ranked candidates → confirm into collection).
- Loading / empty / error states throughout.

**Decisions/gotchas:**
- React-router v7 layout-route pattern: `ProtectedRoute` wraps `<Layout/>`; `Layout` renders `<Outlet/>`.
- recharts `Tooltip` formatter types are strict — coerce the value with `Number(v)`.
- Collection endpoint returns only `card_id`, so the collection page enriches rows with card
  names via `getCard` (parallel) for display.
- Login page shows a clear banner when Supabase env is unset.

**To finish Goal 6 (human-only):** put `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in
`frontend/.env`, restart `pnpm dev`, then sign up and exercise each flow.

**Next:** Goal 7 — hardening + free-tier deployment (needs hosting signups).

---

## 2026-07-07 — Goal 5: Card scanning (OCR) ✅ (proven in the Docker image)

**Now fully verified.** Rather than require a host Tesseract install, the OCR tests were run
inside the production Docker image (Tesseract 5.3.0): **`tests/test_scan.py` → 7/7 passed**,
including the 3 formerly-skipped OCR tests (clear-photo ranks the correct card + price,
blank→no candidates, name-only fuzzy match). See the Goal 7 Dockerfile entry.

Built the free-OCR scan pipeline; the non-OCR tests were already green.

- Deps added: `pillow`, `pytesseract`, `rapidfuzz`, `python-multipart`.
- `app/services/scan.py`: Pillow preprocess (grayscale/orient/autocontrast/upscale) →
  Tesseract text → `parse_ocr` (collector number regex + best alphabetic name line) →
  rapidfuzz match (number-filtered pool when detected, else `process.extract` over names) →
  ranked candidates with confidence + current price. Lightweight column queries so it scales
  to 20k cards. **Proposes only** — never auto-adds.
- `POST /api/v1/scan` (multipart upload, propose-only): 422 on empty/non-image, 413 over
  10 MB, **503 if Tesseract is not installed**.
- `tests/test_scan.py`: synthetic PIL card images (deterministic, catalog-unique fictional
  names so the shared live catalog can't skew matches) + a no-binary `parse_ocr` unit test.
  Currently: `parse_ocr` tests + reject tests **pass**; 3 OCR tests **skip**.

**To finish Goal 5:** install Tesseract (`winget install UB-Mannheim.TesseractOCR`), then
`uv run pytest tests/test_scan.py` — the 3 skips must turn green.

**Next:** Goal 6 — the React SPA (largest remaining chunk).

---

## 2026-07-07 — Goal 4: Price history + daily schedulers ✅

**Ran the snapshot job for real:** `python -m app.ingest.snapshot_prices` → **51,988**
price_history rows for today. `price_history` now holds **2 distinct snapshot days**, so the
series is already accumulating.

**Endpoints proven:**
- Card price series — `GET /api/v1/cards/base1-4/history` returns the live series
  (Charizard holofoil = $720.34 today).
- Portfolio-value series — green via `test_portfolio_history_and_isolation`.

**Schedulers added (daily cadence):**
- `.github/workflows/daily-snapshot.yml` — 08:00 UTC + manual dispatch; runs `sync_catalog`
  (refreshes current prices from the API + writes today's history) then `snapshot_prices`.
  Needs repo Actions secrets: `DATABASE_URL`, `POKEMONTCG_API_KEY`, `SUPABASE_URL`.
- `backend/scripts/daily_sync.ps1` (Windows Task Scheduler) + `backend/scripts/README.md`
  (schtasks + cron instructions).

**Bug fixed:** `snapshot_prices` crashed when run standalone (`python -m ...`) — it imported
only from `app.models.price`, so `Card` was never registered and the `CardPriceCurrent.card`
relationship failed to map. Now imports `app.db.base` (the full registry). The existing test
passed only because the app import chain pre-registers all models.

**Next:** Goal 5 — commit the scan code; full proof once Tesseract is installed (human).

---

## 2026-07-07 — Goals 2 & 3: Auth + Collections/portfolio ✅ (Goal 2 e2e pending token)

Both were already code-complete; this was verification against the real DB + auth path.

**Goal 2 (auth) — 8/8 green** (`test_auth_verify.py` + `test_me.py`): valid-token→claims,
expired/wrong-aud/bad-sig/missing-sub all rejected (real ES256+JWKS path), `/me` 401 without
token, `/me` returns user + upserts the mirror row, garbage token → 401.
✅ **Live e2e done (2026-07-09):** signed up a real Supabase user via the anon key, called
`GET /me` on the running backend with the genuine JWT → verified via JWKS, returned the user
and created the `users` mirror row. `/collection` without a token → 401.

**Goal 3 (collections & portfolio) — 6/6 green** (`test_collection.py`): requires-auth,
add-increments-stack, unknown-card→404, update+delete, **ownership isolation** (user B cannot
read/mutate user A's items — proven against the real Goal 2 auth, not a stub), portfolio
summary + set-completion math. Plus `test_history` portfolio-value series + isolation green.

**Next:** Goal 4 — run the snapshot job once (show today's rows) + commit the schedulers.

---

## 2026-07-07 — Goal 1: Full catalog + read API ✅

**Data (live Supabase DB, after full sync):**

| table | rows |
| ----- | ---- |
| sets | 173 |
| cards | 20,314 |
| card_prices_current | 52,021 |
| price_history | 52,624 (today's snapshot, written inline by the sync) |

DB size **71 MB** — 14% of the 500 MB free-tier cap, comfortable headroom.

**Done this goal:**

- Added the missing **`/sets` read API** — `GET /api/v1/sets` (list, name-search, paginate)
  and `GET /api/v1/sets/{id}` (404). `app/services/sets.py` + `endpoints/sets.py`, registered
  in the v1 router. (`SetRead` schema already existed; only the endpoint/service were missing.)
- Added **`tests/test_catalog.py`** — 9 tests for `/sets` and `/cards`
  list/search/filter/paginate/get/404, scoped to a unique seeded set id so the shared live
  catalog can't skew assertions. All 9 green.
- Ran the **full pokemontcg.io sync** into the live DB: 173 sets / 20,314 cards / 52,021 prices.
- Full backend suite: **38 passed, 3 skipped** (3 = the Tesseract-dependent scan tests).

**Decisions / gotchas:**

- The per-row upsert sync was far too slow over the session pooler (a round-trip per row →
  hours) and fragile. **Batched the writes** (one multi-row `ON CONFLICT` upsert per table per
  set, with intra-batch conflict-key dedupe); base1 went from stalling-for-minutes to ~23s.
- The pokemontcg.io API **intermittently 404s / times out** under load — a single set's error
  used to abort the whole run. Made the loop **resilient**: skip-and-continue per set, then one
  retry pass at the end. This run had 7 transient failures; all 7 recovered on retry, 0 unsynced.
- Sync must run with echo off (`DEBUG=false`) or SQLAlchemy floods logs and slows to a crawl.

**Next:** Goal 2 — auth is already green in unit/integration; only the genuine-token e2e `/me`
demo remains (needs a real Supabase token — human-only).

---

## 2026-07-07 — Goal 0: Baseline + regressions ✅

**State-of-repo audit (verified, not assumed):**

- Backend far more complete than the brief's "assumed state." Goals 1–4 are code-complete
  with **25 real pytest passing against the live Supabase DB** (189s → genuine DB round-trips,
  not skipped): catalog read API, Supabase JWKS auth (sig/exp/aud/iss + `users` mirror + `/me`
  + 401s), user-scoped collection CRUD + portfolio/summary + **cross-user isolation test**,
  price-history snapshot job + card/portfolio series endpoints.
- Only set **`sv3`** is actually ingested into the live DB (sync tool itself has no such limit).
- DB config correct: `+asyncpg` app driver + `+psycopg` (v3) Alembic, both on the Supabase
  **session pooler** (`...pooler.supabase.com:5432`, dotted `postgres.<ref>`). 3 migrations applied.
- Table is named **`collection_entries`** (not the brief's `collection_items`) — kept per
  "code is ground truth."

**Done this goal:**

- `git init` + baseline commit (`f263208`). Confirmed `backend/.env` is gitignored (secrets
  never staged). Removed stale build artifacts (`vite.config.js`/`.d.ts`, `*.tsbuildinfo`,
  committed `frontend/dist/`) and added ignores for them.
- Frontend migrated to **Tailwind v4 CSS-first**: `@tailwindcss/vite` plugin in `vite.config.ts`,
  `@import "tailwindcss";` + `@theme{}` in `src/index.css`; deleted `tailwind.config.ts`,
  `postcss.config.js`, and `autoprefixer`/`postcss`.
- Upgraded **React 18 → 19.2.7** and **Vite 5 → 8.1.3** (required by `@vitejs/plugin-react@6`,
  whose peer is `vite ^8`).
- `pnpm build` + `pnpm lint` clean; both dev servers boot (vite :5173 → 200, backend
  `/api/v1/health` → `{"status":"ok"}`).

**Decisions:**

- Vite bumped to 8 (not 7 as the older CLAUDE.md table suggested) to satisfy plugin-react@6's
  `vite ^8` peer. Locked decision only pins "Vite" (unversioned) — picked latest/greatest.
- `tsconfig.node.json`: kept `composite` but redirected emit + build-info to `node_modules/.tmp`
  so `tsc -b` no longer regenerates a stale `vite.config.js` in the source tree.

**Gotchas:**

- pnpm 10 blocks `esbuild`'s postinstall by default → Vite can't build. Fixed via
  `pnpm.onlyBuiltDependencies: ["esbuild"]` in `package.json`.
- `composite: true` + `noEmit: true` is illegal (TS6310); use `outDir` redirection instead.

**Human-only follow-up recommended:** rotate the DB password + pokemontcg.io key that were
sitting in the untracked `backend/.env` (they stay out of git, but were exposed on disk).

**Next:** Goal 1 — run the full pokemontcg.io catalog sync into the live DB; report counts;
watch the 500 MB free-tier cap.
