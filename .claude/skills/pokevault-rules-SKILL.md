---
name: pokevault-rules
description: >
  Project rules and hard-won constraints for the PokéVault app (a free, web-based
  Pokémon card collection tracker). Load and follow these on EVERY task in this repo —
  backend, frontend, deploy, data, or DB work. These encode decisions already made and
  bugs already fixed; violating them reintroduces problems that took real effort to
  solve. When a task conflicts with a rule here, follow the rule and tell the user.
---

# PokéVault — Project Rules

Apply these automatically to all work in this repository. They are locked decisions,
not suggestions. If a request conflicts with one, do not silently comply — follow the
rule and surface the conflict to the user.

## Verification discipline (most important)

- **"Tests pass" ≠ "it works."** A feature is done only when its real, user-facing
  behavior is demonstrated. Prove behavior, not green checkmarks.
- **Never weaken, stub, skip, or `# type: ignore` a test to make it pass.** A failing
  test is a finding, not an obstacle. Doing this counts as a failure, not a fix.
- **Diagnose before fixing.** For any bug, first show what the code actually does
  (the real query, the real error, the real value) before proposing a change. Don't
  fix blind, and don't re-attempt a "fix" that already failed without finding root cause.
- **The code is ground truth**, not any summary or handoff doc. If they conflict, trust
  the code.

## Database & connection (this has broken repeatedly — do not deviate)

- App driver: `postgresql+asyncpg://` (async engine, AsyncSession, all DB routes async
  + awaited). Alembic migrations: sync `postgresql+psycopg://` (v3).
- **Always the Supabase SESSION POOLER**: host contains `pooler.supabase.com`, port
  `5432`, username tenant-qualified `postgres.<project-ref>` (dotted).
- **NEVER** the IPv6 direct host `db.<ref>.supabase.co`. **NEVER** the transaction
  pooler (port 6543). **NEVER** `psycopg2` or a sync app layer.
- This same trap recurs in every new environment (local, Render, GitHub Actions) — any
  `DATABASE_URL` set anywhere must be the tenant-qualified pooler string.
- **No destructive migrations.** Additive-only against the live Supabase DB. Plan and
  show any schema change before applying. Leave vestigial columns rather than dropping.

## Dependencies

- Do NOT mass-update dependencies to "latest." Update deliberately, one at a time, for a
  specific fix/CVE, testing between. Security audits (`pnpm audit`, uv) are fine; blanket
  bumps are not.
- Ranges in `pyproject.toml`; exact versions live in `uv.lock`. Don't hand-pin versions
  in docs.

## Frontend

- Tailwind **v4, CSS-first only**: `@tailwindcss/vite`, `@import "tailwindcss";`,
  `@theme` in CSS. NO `tailwind.config.js`, NO PostCSS, NO v3 `@tailwind` directives.
- Vite env vars are baked at BUILD time — setting one requires a REDEPLOY to take effect,
  and it must be prefixed `VITE_`. The deployed frontend reads env vars from Vercel
  settings, never from local `.env`.
- Use TanStack Query for data fetching (cache-first, background refresh). Don't hand-roll
  a fetch layer alongside it.

## Deploy

- Backend on Render (session-pooler URL), frontend on Vercel (Root Directory = `frontend`),
  DB + auth on Supabase. All free tier.
- Order: deploy backend → set frontend's `VITE_API_URL` to the Render URL (+ `/api/v1`) →
  deploy frontend → set backend `BACKEND_CORS_ORIGINS` + `PUBLIC_WEB_ORIGIN` to the
  Vercel URL → redeploy backend. Exact origins, `https://`, no trailing slash.
- **Commits authored as the user** (their real email matching their GitHub/Vercel
  account). **No `Co-Authored-By: Claude` trailers.** No synthetic authors — Vercel
  Hobby blocks unrecognized authors.
- **Never force-push `main`** to rewrite history for cosmetic reasons.

## Valuation (one source of truth)

- Reuse the existing USD valuation logic everywhere (collection, deck, dashboard,
  leaderboard/simulator). Do NOT reimplement it — one path, so fixes apply everywhere.
- Convert EUR-sourced (Cardmarket) prices to USD before summing into any total. Never
  mix currencies in a total. Native currency is shown ONLY in the per-source display
  table, never in totals.
- Holo cards must read the **holofoil** price variant, not the base/normal variant.
- Grading value: PSA, BGS, CGC, SGC get an **estimated** premium multiplier that **varies by
  grade** (10 > 9.5 > 9 …) — a shared grade curve × a per-company factor (BGS ×1.05, CGC ×0.90,
  SGC ×0.85; PSA has its own table). All estimates (no real graded-sale feed). Only **"Other"**
  / free-text graders show RAW value, labeled "graded premium not applied".
- Missing price → contributes 0 to a total, never NaN, and log which card lacked a price.

## Data freshness

- Prices come from pokemontcg.io (embedded, daily). Price HISTORY is self-snapshotted
  daily into our own table — the free feed has no history.
- The daily snapshot job (GitHub Actions) is what keeps prices current AND backfills new
  sets. If it's failing, prices are frozen and new sets stay unpriced. Keep it green.
- Snapshot only cards users OWN (collection), wishlist, or have in their virtual pull
  collection (`pack_pulls`) — never all ~20k cards daily, or the free-tier 500 MB Supabase
  cap is breached in months. (Tracked-ID set = union of those three; bounded by the ~20k universe.)

## Feature-specific rules

- **Pack simulator:** odds are APPROXIMATE — never claim exact/real pull rates; label as
  an estimate in UI + API. Pull is **server-authoritative**: `POST /simulator/open` rolls
  server-side (never client randomness), persists the roll + open-time prices in `pack_opens`
  (`rolled_cards` jsonb), and enforces a **2-packs/UTC-day quota** derived at query time (no reset
  job). Keep is `POST /simulator/keep {open_id, kept_card_ids}` — it trusts ONLY the stored roll
  (validates membership, idempotent per open) and freezes `price_at_pull` from the stored
  `price_at_open`. **Keep writes to the VIRTUAL pull collection (`pack_pulls`), NOT the IRL
  `collection_entries` — the two are fully separate; pulls never touch the real collection.**
  Duplicates are separate `pack_pulls` rows (no 99-cap on pulls); the vault UI stacks them ×N.
  The simulator lives in its own `/simulator/*` shell (SimulatorLayout). Reveal = **swipe-to-decide**:
  cards auto-reveal one at a time (best/hit last), and each is kept (swipe/drag right) or discarded
  (left), with visible Keep/Discard buttons + ←/→ keys + a brief Undo (covers the last card too).
  Earlier cards keep the flip + restrained rare+ tells + whoosh; the hit card zooms in over the
  dimmed section with an original synthesized **jackpot** flourish (~1s). Kept `card.id`s are
  accumulated and POSTed **once** to `/keep` at end of pack (the backend keeps a pack only once) —
  discards never persist. Original PokéVault card back; mute toggle; `prefers-reduced-motion` aware
  (no zoom/fling — decide instantly; sound still governed by the mute toggle). There is NO
  keep/discard summary screen (removed). Vault tiles show the card + current value ONLY (no
  "pulled at" line). First `/simulator` entry with no handle set →
  a blocking "choose your handle" step (reuses the existing `^[a-z0-9_-]{3,30}$` validation +
  PATCH /me); it never auto-opts anyone into the leaderboard.
- **Best-pulls leaderboard:** ranks by real market price only (never rarity tier). `best_single`
  = worldwide **DAILY top 10** (today UTC), ranked by frozen `price_at_pull` desc, with no window
  toggle. `total_value` = SUM of each user's **live** current value within a window; three windows
  — daily / monthly / all-time — with the day + month LABELS computed LIVE from the current UTC
  date (never hardcoded), cap top 100. Every window is derived at query time from `pulled_at` — no
  cron/reset job. Nulls are excluded from `best_single` and contribute 0 to `total_value`.
  **Eligibility = a set handle + ≥1 kept pull** (no opt-in gate). Eligibility is SEPARATE from
  `is_public`; link a name to `/u/{handle}` ONLY when that user's showcase is public.
- **Friends + direct messaging:** mutual-friend gated (request → accept → message); 1:1, text only;
  **manual refresh only (no websockets/polling)**. The send guard is re-checked server-side on
  EVERY send — an accepted friendship AND no block in either direction, else 403. Block = unfriend
  + bar requests/messages until the blocker unblocks. 2000-char cap, React-escaped on render, basic
  send rate limit. **No report feature — removed everywhere (friends and showcase comments).**
- **Number limits:** every user-entered numeric field has a sane per-field max, enforced
  on the BACKEND (not just the input's `max`). Copies/qty cap 99; money fields do NOT cap
  at 99. Enforce min values too (no negatives). Clamped inputs use the shared **`NumberField`**:
  edit RAW while typing (empty/partial allowed), normalize on blur + Enter — never clamp on every
  keystroke; quantity blank → 1, money blank → null (not 0).
- **Privacy:** public pages (profile, leaderboard) read ONLY public-safe data — a handle, the
  leaderboard score/card, and a `/u/{handle}` link gated on `is_public` — never private
  collections, never another user's data. Rank/compute server-side; never ship private data to
  the client. Portfolio value defaults to hidden.
- **Copyright:** abstract Pokémon-themed motifs and type colors only in decorative UI —
  no copyrighted character art or logos.

## Pre-launch gates (before sharing publicly)

- Re-enable Supabase "Confirm email" (it was disabled for testing) and verify a real
  signup email is delivered. Do NOT go public with confirmation off.
- Confirm the deployed bundle calls the Render API, not localhost.

## Known-fragile spots to always re-check after changes

- Catalog numeric ordering (1,2,3…10,11 — not lexical 1,10,11,2).
- Scan match % is real per candidate (not a flat constant), and collector number ranks
  the exact card #1.
- The daily snapshot job is green.
- Removals/swaps leave no dead nav links, routes, or orphaned imports.
