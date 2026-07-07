# PROGRESS

Append-only build log, newest on top. Terse: date · goal · key decisions · gotchas · next.
Detailed rationale lives in `docs/`.

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
