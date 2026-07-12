---
name: e2e-test
description: Full end-to-end bug hunt against the DEPLOYED PokéVault (Vercel frontend + Render backend). Walks every core user flow, verifies real behaviour (not HTTP 200s), re-checks the known-fragile spots, reads live Render/Vercel logs when something fails, and outputs one prioritised bug list (blocker/major/minor) with repro + exact error. REPORT-ONLY — never fixes anything. Use when asked to "e2e test", "bug hunt", "test the deployed app", "pre-launch QA", or "find bugs before users do".
---

# PokéVault end-to-end bug hunt (deployed)

Run a complete, behaviour-level bug hunt against the **live deployment**. This skill is a
**find-and-report** pass. Triage and fixes happen separately.

## Hard rules (do not violate)

1. **REPORT ONLY. Never fix anything.** No code edits, no env changes, no redeploys, no
   config changes. If you find a blocker, log it and keep going — do not repair it. (Fixing
   is a separate, explicitly-authorized task.)
2. **Verify behaviour, not status codes.** A `200` is not a pass. Assert on response
   *bodies* and real user-facing results (correct cards, correct prices, correct math). "Unit
   tests pass" is NOT "it works" — exercise the live system.
3. **A stubbed, mocked, weakened, or hand-waved pass counts as a FAILURE.** Do not weaken a
   check to make it green. Do not assume a flow works because the code looks right — drive it.
   If you cannot exercise something (e.g. camera), put it on the manual checklist, don't
   pretend it passed.
4. **Read live logs on failure — don't guess.** When any request 500s / behaves wrong, pull
   the actual error from the **Render MCP** (`list_logs`) or **Vercel MCP**
   (`get_runtime_logs` / build logs) before drawing a conclusion.
5. **Prod test data:** use a clearly-marked throwaway account and **clean up everything** you
   create. Never touch other users' data.

## Targets & how to (re)discover them

- **Frontend (Vercel):** `https://poke-vault-eta.vercel.app`. Project `poke-vault`
  (`list_projects` on the team if the URL drifts). Read the deployed bundle with the Vercel
  MCP `web_fetch_vercel_url` (works on protected deploys).
- **Backend (Render):** `https://pokevault-api-nup5.onrender.com/api/v1`, service
  `srv-d9728dfavr4c73ctjr90` (`list_services` if it drifts). API is versioned under `/api/v1`.
- **Supabase (auth):** URL + anon key are baked into the frontend bundle — read them from the
  bundle rather than hardcoding. Auth is Supabase-direct (GoTrue), independent of the backend DB.
- **DB access for test setup:** the local `backend/.env` `DATABASE_URL` (session pooler,
  IPv4) works from anywhere; the backend venv
  (`backend/.venv/Scripts/python.exe`) has `asyncpg`. Use these ONLY to mint/confirm/clean a
  throwaway test user — never to mutate real data.

Tooling: drive the API with `curl`; assert on JSON with the backend venv Python (`urllib` +
`json`, stdlib). Set `PYTHONIOENCODING=utf-8` (card names contain ★/é and crash cp1252).

## Step 0 — Confirm the two launch-blockers up front

- **(a) Supabase "Confirm email" status:** GET `{SUPABASE_URL}/auth/v1/settings` with the anon
  key → `mailer_autoconfirm:false` means confirmation is REQUIRED (launch-safe). Record it.
- **(b) Bundle points at Render, not localhost:** fetch the main JS chunk from the frontend and
  grep the baked `API_URL`. It MUST be the Render `…/api/v1` host with **zero** `localhost`
  strings. Also confirm `VITE_SUPABASE_URL` is a real host (not `placeholder.supabase.co`).

## Step 1 — Get a JWT (confirm-email is ON, so DB-confirm a throwaway)

Auth talks to Supabase directly, so this works even if the backend DB is down.
1. `POST {SUPABASE}/auth/v1/signup` (anon key) with a throwaway email. Supabase rejects
   obviously-undeliverable domains (e.g. `@example.com`) — use a deliverable one (a `+alias`
   of a real inbox works and passes validation).
2. Connect via backend-venv `asyncpg` and
   `UPDATE auth.users SET email_confirmed_at = now() WHERE email = …` (do NOT write
   `confirmed_at` — it's generated). Use an SSL context with verification relaxed for the pooler.
3. `POST {SUPABASE}/auth/v1/token?grant_type=password` → `access_token` (the JWT). Save it.

## Step 2 — Walk the flows IN ORDER, asserting real behaviour

For each finding record: **what I did · expected · actual · exact error (console / network /
Render log) · severity**.

1. **Auth:** signup → observe confirm-email state → DB-confirm → login → `GET /me` (200, id
   matches; also ticks the streak) → verify **401** on missing token AND on a garbage token →
   (logout is a client action; note it for the manual checklist).
2. **Catalog browse — and OPEN A SET:** `GET /sets` returns the full catalog, newest-first.
   **⭐ KNOWN-FRAGILE: open a set and confirm the cards actually load.** Page a large set at
   `limit=250` via offset (e.g. `swshp` was 304 → expect 250+54) AND a small one (`base1`=102).
   Confirm `limit=300` still → **422** (cap is 250). Search (`q=charizard`), rarity filter, and
   `sort=price_desc` return correct rows with **real prices**.
3. **Card detail:** `GET /cards/{id}` (e.g. `base1-4`) → valid `image_url` (fetch it, expect
   200 image bytes), a sane headline `market_price`+currency, ≥1 price row; `GET
   /cards/{id}/history` → points present (≥2 ⇒ chart draws; <2 ⇒ "history building" note).
   Unknown id → clean **404 JSON**, NOT a 500/traceback.
4. **Collection CRUD + portfolio value:** add a card (foil, raw) and the same card graded
   `PSA 10` (separate stack) → assert **grade multiplier math** (graded unit == round(raw ×
   multiplier, 2); PSA 10 = ×5.0). Re-add same stack → **add-or-increment** (qty rises, no dup).
   Unknown card → 404. `PATCH` qty/condition. `GET /collection/summary` → portfolio value =
   Σ grade-adjusted line values, per-set breakdown present. Delete entries.
5. **Set completion:** from the summary, verify `completion_pct == distinct_owned / set_size`
   for a known set (exact).
6. **Scan — BOTH paths:**
   - **Upload:** `POST /scan` (multipart) with a real card image (download one from
     `images.pokemontcg.io`). ⭐ KNOWN-FRAGILE: assert the **correct card appears in the
     candidates** AND that **match % is a real per-candidate score, not a flat 90%**. Compare
     across two different cards; flag if the correct card is absent or every candidate ties at
     one value. (Validation: empty upload → 422; >10 MB → 413.)
   - **Camera:** the live-camera path POSTs frames to the same `/scan`, so the *backend* is
     covered above; the getUserMedia UI itself goes on the **manual checklist** (can't drive a
     real camera headless).
7. **Shipped backlog features:**
   - **Wishlist + alerts:** add with a target price → item enriched with current market price;
     `GET /wishlist/alerts` responds (log-only — populated by the daily snapshot job, so 0 is
     normal).
   - **Gamification:** `GET /collection/achievements` → level/xp/badges/streak; sanity-check
     the XP formula (distinct×10 + qty×2 + sets_completed×250 + int(total_value)).
   - **Public showcase + PRIVACY:** `PATCH /me` set handle + `is_public:true` → `GET
     /public/u/{handle}` and `/collection`. **⭐ Assert NO `acquired_price` and NO `notes`
     leak** in any public field. Toggle `is_public:false` → showcase returns **404**. Unknown
     handle → 404.
   - **CSV import/export:** `GET /collection/export` (auth) → round-trippable CSV; `POST
     /collection/import` with a small CSV → classification is correct (a clean name+set+number
     → `matched`; a bare popular name → `ambiguous`; a junk name → `unmatched`).
8. **Cross-cutting:**
   - **CORS:** OPTIONS preflight from the real frontend origin must return **200 + 
     `access-control-allow-origin`** echoing that origin (a 400 / missing ACAO is a blocker —
     the browser will block every call).
   - **No localhost calls** anywhere in the bundle (re-confirm Step 0b).
   - **No 5xx** in Render request logs during the run (`list_logs`, `type:request`,
     `statusCode:5..`).
   - **Error surface:** production must not leak stack traces on 500s.
   - Loading / empty / error states exist (code presence + manual visual confirmation).

## Step 3 — Clean up

Delete every collection/wishlist row created (API `DELETE`), toggle the test profile private,
and remove the throwaway auth user + its mirror rows via the DB. Confirm the account is gone.

## Known-fragile spots — ALWAYS re-check explicitly (call out each in the report)

- **Set-cards loading** — opening a set must return its cards (paginates past 250). This has
  regressed before (a `limit=300` request 422'd). Verify with a >250-card set.
- **Scan match %** — must be a real per-candidate score, and the correct card must show up;
  flag any flat "90% for everything" or correct-card-absent behaviour.
- **Bundle → Render, not localhost** — the deployed JS must call the Render API; any
  `localhost:8000` (or a `placeholder.supabase.co`) is a blocker.

## Output — ONE prioritised bug list (no fixes)

Produce a single report:

```
# PokéVault E2E Bug Hunt — <date>
Targets: <frontend URL> · <backend URL>

## 🔴 Blockers
- [Bx] <one-line summary>
  - Repro: <exact steps / request>
  - Expected: <real user-facing result>
  - Actual: <what happened>
  - Error: <exact console/network/Render-log line>

## 🟠 Major
## 🟡 Minor
## ✅ Verified working  (incl. launch-blockers (a) confirm-email, (b) no-localhost)
## ⛔ Could not verify  (why — e.g. blocked by a blocker)
```

Rank blockers first. Every item needs a concrete repro and the exact error text. **Do not
apply any fix, suggest inline patches only if asked separately.**

## Manual checklist (append verbatim — automation can't cover these)

- [ ] Catalog grid paints real card **images** (not 🃏 placeholders)
- [ ] Card detail: image paints; price shows a number (not "—"); **price-history chart draws**
- [ ] Dashboard **portfolio chart** paints
- [ ] Collection edit modal: PSA grade dropdown; green **×multiplier** badge on graded cards
- [ ] Scan **upload**: image preview shows; candidate list shows **varying %**
- [ ] Scan **live camera**: permission prompt, live overlay with top match + %, auto-capture
      (~1.5s); works on HTTPS only
- [ ] Logout returns to /login and clears the session
- [ ] Loading skeletons / empty states / error states render
- [ ] Dark/light theme toggle; mobile nav menu
- [ ] (Pre-launch) real signup to a real inbox actually delivers the confirmation email
