# PROGRESS

Append-only build log, newest on top. Terse: date · goal · key decisions · gotchas · next.
Detailed rationale lives in `docs/`.

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
⏳ **Remaining (human-only):** one genuine Supabase-token e2e `/me` call. Not blocking later
goals — will demo when a real token is provided.

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
