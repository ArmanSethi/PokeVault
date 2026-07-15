# PROGRESS

Append-only build log, newest on top. Terse: date · goal · key decisions · gotchas · next.
Detailed rationale lives in `docs/`.

---

## 2026-07-15 — Price-history wipe + re-scope (history = collection ∪ wishlist only) ⏳

Split the nightly price job into two DISTINCT scopes so vault pulls no longer pollute price
history but their current values stay fresh.

- **Wipe (authorized, destructive):** cleared `price_history` — **53,769 rows** (earliest
  2026-07-06, latest 2026-07-15) → 0. The "value over time" chart now rebuilds from today.
- **History-write set = collection ∪ wishlist ONLY.** Dropped `PackPull` from `_tracked` in
  `app/ingest/snapshot_prices.py`, so `price_history` (and everything that reads it — the card
  chart, portfolio series, wishlist alerts) covers only owned/wishlisted card+variant IDs. A card
  that leaves both collection and wishlist stops getting new rows; old rows are left (already wiped).
- **Current-price refresh set = full catalog** (⊇ collection ∪ wishlist ∪ vault), unchanged:
  `sync_catalog` still upserts `card_prices_current` for every card nightly, so vault current
  values + the "total pulled value" leaderboard never go stale. The two sets run in the same
  nightly workflow but are deliberately separate jobs — documented in `snapshot_prices.py` and
  `daily-snapshot.yml` (fixed a stale comment there that claimed sync_catalog writes history).
- Daily UTC cadence, no new reset job. Added `test_history.py::test_snapshot_excludes_vault_only_cards`.

---

## 2026-07-15 — Removed leaderboard opt-in gate + showcase comments toggle ⏳

Dropped two settings toggles and their backing `users` columns.

- **Leaderboard opt-in removed.** New eligibility = **a set handle + ≥1 kept pull** (no opt-in);
  `≥1 pull` is enforced structurally by the leaderboard's join to `pack_pulls`, so the only
  user-column filter is a non-null handle (`services/pulls.py`). Unchanged: handle still required,
  a name links to `/u/{handle}` only when `is_public`, nulls excluded from `best_single` / 0 for
  `total_value`. Removed `leaderboard_opt_in` from the model / `UserRead` / `UserProfileUpdate` /
  `profile` service and the Settings toggle.
- **Comments toggle removed — comments are now always on for every public showcase.** Chose to
  **remove the `comments_enabled` flag entirely** (cleaner than a vestigial always-true column):
  dropped it from the model / schemas / `profile` + `comments` + `public` services (the
  `CommentsDisabled` path and its 403 are gone), `PublicProfile.comments_enabled`,
  `CommentList.comments_enabled`, and the Settings toggle + the "comments are turned off" branch on
  the showcase. The comments feature, its `showcase_comments` table, and its display are untouched.
- **Migration `d7f9b1c3e5a8`** (DESTRUCTIVE): drops `users.leaderboard_opt_in` +
  `users.comments_enabled`; downgrade re-adds with original defaults but can't restore values.
  Pre-drop counts reported first (1 opt-in = true, 0 comments = false, of 3 users).
  **APPLIED to the live session pooler** (head now `d7f9b1c3e5a8`); both columns confirmed gone.
- Tests updated + re-run green on the new schema (`test_pulls.py`, `test_comments.py`); frontend
  types trimmed (`User` / `ProfileUpdate` / `PublicProfile` / `CommentList`). CLAUDE.md head note
  updated to `d7f9b1c3e5a8`.

---

## 2026-07-14 — Per-(card,variant) pricing fix + licensed-API eval ⏳ (in progress, not yet committed)

Track A (fix pokemontcg.io reading) implemented + verified against a local backend on the live
Supabase DB; frontend `tsc`/`lint`/`build` + backend `ruff` clean. Track B delivered as a written
recommendation (no build). Both ASK points answered: canonical = **TCGplayer USD** (Cardmarket
EUR→USD fallback via `settings.EUR_USD_RATE`); refresh = **daily + a rate-limited manual button**.

- **Diagnosis (reported before editing):** the model already stored per-`(card,source,variant)` and
  TCGplayer ingestion was correct (dynamic variant keys, uses `market`). Real bugs were: Cardmarket
  written as a single `variant="normal"` row (never pairs with a holo card's `holofoil` TCG row;
  reverse-holo sub-prices dropped); the card **headline** fed a EUR fallback into `format()` which
  assumes USD (silent currency mix, e.g. base1-8 Machamp); **no divergence detection**; owned entries
  + vault pulls priced by a boolean `is_foil` only (no variant). base1-4 = TCG holo $773 vs CM trend
  €4,184 (edition-conflated upstream) → the flagship divergence case.
- **Ingest (`mappers.price_rows_from_card`):** Cardmarket main price → the card's BASE variant
  (holofoil for holo rarities, else normal); + a `reverseHolofoil` row from `reverseHolo*`. A
  raw_json backfill re-mapped all 20k cards (no API): cardmarket now holofoil 2.7k / normal 17k /
  reverseHolofoil 15.9k.
- **Valuation (`cards`/`grading`/`valuation`/`pulls`/`simulator`):** headline is now canonical **USD**
  (`select_display_price` converts the CM fallback); `market_price_for_entry`/`unit_price_usd`/
  `graded_unit_price` take an explicit `variant`; entries carry `variant` (part of stack identity),
  pulls carry `variant` (set at roll from the base printing) → `price_at_pull`, vault current value,
  and leaderboard `total_value` all follow the printing. `CardRead.variants[]` = per-printing
  TCG-USD + CM-EUR + `diverges` (≥2.5× in common currency).
- **Migrations (session pooler, psycopg v3):** `d5b7e9f1a2c3` adds `collection_entries.variant` +
  `pack_pulls.variant` (**applied**). Chained BEFORE the acquired_price drop (re-pointed
  `c4e6a8b02d3f.down_revision`). Head now `d5b7e9f1a2c3`.
- **Manual refresh:** `POST /cards/{id}/refresh` (auth, per-user 20s cooldown) re-fetches one card
  via the ingest httpx client (UA+key clears Cloudflare — verified: base1-4 → $773.51) with capped
  retries so it fails fast; frontend "↻ Refresh price" button on the card. No scraping.
- **Frontend:** card detail per-printing table (TCG USD / CM EUR + ⚠ verify-edition flag); the add
  form's foil checkbox → an **Edition/variant picker** (from the card's TCG variants), sent + stored;
  types gained `Card.variants`, entry/pull `variant`.
- **Track B recommendation:** pursue **PriceCharting** (~$59/yr, self-serve, adds graded PSA/BGS/CGC
  — the real gap). TCGplayer + Cardmarket APIs are **closed to new applicants**; aggregators are
  scrapers (excluded). No integration built — awaiting go-ahead.

**Verified (local drive):** base1-4 detail shows Holofoil $773.51 USD / €4,184.60 EUR + verify-edition
flag; sm11-6 shows Normal (flagged) + Reverse Holofoil (aligned); variant picker + refresh present;
zero console errors.

---

## 2026-07-14 — Swipe-to-decide reveal · acquired-price removed · manual Total spent · profile cards ⏳ (in progress, not yet committed)

Local branch work; frontend `pnpm build`/`lint`/`tsc` clean, backend `ruff` clean + pure tests
pass, driven end-to-end against a **local** backend (frontend → `localhost:8000`) on the live
Supabase DB. Additive migration applied to the pooler; the destructive `acquired_price` drop was
subsequently **run** (user-authorized) — see the update note at the end of this entry.

- **Simulator reveal → swipe-to-decide (replaces tap-to-flip + keep/discard summary):**
  `PackReveal` now auto-reveals cards one at a time (best/hit last) and decides each by swipe/drag
  (right = keep → vault, left = discard) via native Pointer Events + transforms (no gesture lib);
  directional Keep/Discard affordances, off-screen fling, visible Keep/Discard buttons, ←/→ keys,
  and a brief **Undo** (covers the last card). The old `summary` phase + `discarded` grid are gone;
  `SimulatorOpenPage` is `idle → revealing → recap`. Kept `card.id`s are accumulated and POSTed
  **once** to `/keep` at end of pack (backend keeps a pack only once — 409 on a second keep), so a
  batch-at-end commit is the only correct option; discards never persist. Finale: the hit card
  **zooms in** (`sim-zoom`) over the existing section dim with a new **original synthesized jackpot
  flourish** (`playJackpot` in `sfx.ts`, ~0.8s, oscillator/noise only — imitates no real jingle),
  replacing the old shockwave/shake burst. Earlier cards keep the flip + rare tells + whoosh.
  reduced-motion → instant decide, no zoom/fling (sound still governed by the mute toggle).
- **`acquired_price` removed entirely:** dropped from the ORM (`CollectionEntry`), all collection
  schemas, valuation serializer, `add_or_increment`, CSV import/export (parser synonyms, `_parse_price`,
  export column), the Edit-card dialog, the CardDetail add form, and the collection card "acquired
  at $X" line. Migration `c4e6a8b02d3f` drops the column — **written but NOT applied** (destructive).
- **Total spent → manual override only:** new nullable `users.total_spent_override` (Numeric(13,2),
  0–99,999,999,999; migration `b3d5f7a91c2e`, **applied**). `CollectionSummary.total_cost` is now
  this value (or null) — no `SUM(acquired_price×qty)`. Dashboard tile gained a pencil (left of the
  eye) → inline editor (raw-while-typing, clamp-on-commit) that PATCHes `/me`; null → "Set amount"
  empty state; Clear resets to null. No "reset to calculated" / manual-vs-auto indicator (there is
  no calculated value). `UserProfileUpdate` uses `model_fields_set` so `null` truly clears.
- **Dashboard featured box:** taller (`h-64`→`h-96`) so the (object-contain) card shows in full with
  the name/set/value beneath. Layout only.
- **Public profile `/u/:handle`:** subtle "@handle's real card collection — not their simulator
  pulls" caption; cards now render the **same badges as the owner's Collection card** via a shared
  `CardBadgeOverlay` (foil ✦ / ×N brand pill / **grade badge**) + live current value. Added `grade`
  to the public `PublicEntry` serializer/type (public-safe display field; still no cost/notes). Fixed
  a duplicate-React-key on the public grid (same card_id across raw+graded entries).

**Follow-up fixes (same session):**
- **Dashboard layout swap:** By-set moved UP into the top row as a narrow, fixed-height tile
  (aligned to hero/stats height, inner list scrolls) beside hero + Total spent/Total cards +
  Featured; the "Portfolio value over time" chart moved DOWN to full-width. 4-across only at `lg`+
  (tablets/mobile stack: hero, stats, featured, By-set, chart). Layout only. NOTE: at ~1024–1200px
  the hero value wraps to two lines (legible); clean at ≥1280px. (If the hero must never wrap, the
  alternative is hero+stats on top, Featured+By-set on a second row — offered to the user.)
- **Wishlist alerts de-duped:** target-hit is now logged only on a NEW crossing to at/below target
  (prior snapshot above), not every day it stays there (`alerts.detect_and_log_alerts`); and
  `list_alerts` collapses consecutive-day runs per (card, kind) to the latest, preserving episodes
  separated by a recovery. Verified: synthetic Jun 1/2/3 + Jun 12 → 2 episodes (Jun 3, Jun 12).
- **Deck target is a hard cap:** `deck.add_card` / `set_card_quantity` never let total cards exceed
  `target_size` (adds only what fits; no-op when full). Verified: target 40 → +30, +30 (→40), +5
  (→40).
- **Public profile caption** moved into the header box (below the stats row, thin divider, muted
  footnote): "This is @{handle}'s real card collection." Verified on `/u/red`.
- **Swipe reveal tap-freeze:** a plain tap on the card set `animating=true` with no matching
  swipe-end and never reset it → `canDecide` went false → buttons/keys disabled ("frozen"). Now a
  tap (travel < `TAP_SLOP` 6px) is a pure no-op; a small drag snaps back and clears `animating`;
  `pointercancel` resets without ever deciding (never derives direction from an unreliable cancel
  clientX). Only a real swipe past the commit threshold decides. Verified: 4 taps → no advance/no
  freeze, buttons + mouse-drag swipe still work.
- **Total spent not updating live:** the tile reads `summary.total_cost`, but the save only
  invalidated `/collection/summary` → the pooler refetch lag made it look unchanged (and Clear
  appeared to do nothing). `useUpdateProfile` now optimistically patches the cached
  `summary.total_cost` from the PATCH's returned `user.total_spent_override`, then reconciles.
  Verified: Save → instant value, Clear → instant "Set amount", both persist across reload.

**Update:** the destructive `acquired_price` **drop was run** (user-authorized) — migration
`c4e6a8b02d3f` applied on the session pooler; 2 of 19 rows' non-null values destroyed; column gone,
`variant` intact, table healthy (19 rows). **DB head is now `c4e6a8b02d3f`.** ⚠️ The currently
DEPLOYED (old) backend still maps `acquired_price`, so its collection queries will 500 until the new
code is deployed — deploy the matching backend. Code still uncommitted on `main`.

---

## 2026-07-13 — Dashboard hero + featured card, pack-limit override, reveal juice ✅ (shipped to main)

Two commits to main (`2a39f25`, `57bf81c`); Render + Vercel deploys green; migration head now
`a2c4e6f80b1d` (applied to prod, session pooler).

- **Simulator — per-account daily pack cap (`2a39f25`):** nullable `users.daily_pack_limit` overrides
  the default 2/UTC-day (NULL = default). Quota resolves the effective cap via
  `effective_daily_pack_limit(user)` — **no hardcoded username**; `/simulator/quota` now returns
  `daily_limit` and the "Packs left today" banner shows the effective cap (was a hardcoded `/ 2`).
  Migration `a2c4e6f80b1d` adds the column + seeds handle `ash`→100 (testing). Tests added.
- **Dashboard revamp (`57bf81c`):** hero stat layout — emphasized **Portfolio value** tile
  (golden-ratio column, larger number, faint Pokéball emblem) with **Total spent / Total cards**
  stacked beside it; Portfolio is **non-clickable**, Total cards → collection **grid**. Cohesion pass
  (shared `rounded-xl`/border/`shadow-sm` across tiles + chart + By-set table; tightened rhythm). Chart
  tile sized to the hero's column (`PriceChart` gained an optional `className`).
- **Featured card (new `FeaturedCard.tsx`):** auto-rotating box filling the column beside the chart —
  shuffled playlist (1 collection + 1 vault + 3 random catalog, topped to 5; re-rolls each loop),
  ~6.5s **cross-fade**, hover/focus pause, position dots, click→`/cards/:id`, next-image preload. Random
  catalog via random offsets (no backend change); reduced-motion → instant swap. Mobile: full-width
  below the chart.
- **Pack reveal juice (`57bf81c`, additive, transform/opacity only, reduced-motion aware):** card back's
  static 36-ray sunburst → a slowly **rotating vortex swirl** (14 blades, CSS `transform-box:view-box`,
  ~42s; static under reduced-motion; `CardBack` §7 note updated). Idle bob + cursor-parallax tilt;
  spring-overshoot flip + synthesized "whoosh"; a rare+ **anticipation shimmer** before the flip lands;
  bigger finale (shockwave ring + screen-shake + crescendo chime) + a running **pack-value** tally.
- **Tooling:** added `playwright` as a dev dependency (local UI verification); this normalized
  `pnpm-lock.yaml`'s quote style (one-time cosmetic churn).

**Open item:** custom Resend SMTP for signup emails still pending (unchanged).

---

## 2026-07-13 — Feature round + consistency pass ✅ (shipped to main across several commits)

Built on the simulator base below. All deployed via Render/Vercel; migrations on the session
pooler (head `e1a3c5b7d9f2`).

- **Collection/dashboard:** reused the existing per-unit `acquired_price` (no migration); dashboard
  **Total spent** = Σ(acquired_price×qty), IRL-only, nulls skipped; collection grid shows
  "acquired at $X"; removed the inline qty steppers (grid + table → static ×N); Edit on the card
  title row with trash below; **separate** hide toggles for portfolio value vs total spent.
- **Edit dialog:** dropped the 1–99 / 0–1,000,000 helper captions; **removed Notes fully** (field,
  column drop migration `c9e2f4a6b8d1` — backup showed 0 non-empty rows).
- **Card detail:** "← Back" now uses real router history (navigate(-1)) with a Catalog fallback
  when there's no in-app history.
- **Leaderboard (final):** `best_single` = worldwide DAILY top 10 (frozen price desc, no window);
  `total_value` = live value across daily/monthly/all-time windows with LIVE UTC day/month labels;
  dedicated `leaderboard_opt_in` (separate from `is_public`).
- **Friends + 1:1 DMs** (`e1a3c5b7d9f2`: friendships/blocks/conversations/messages): mutual-friend
  gated, manual-refresh, block; send guard re-checked every send; paper-plane nav + `/messages`.
- **Consistency pass:** Vault tiles → card + current value only (no "pulled at"); all clamped
  number inputs → shared `NumberField` (edit-raw, normalize on blur+Enter; qty blank→1, money
  blank→null); **report feature removed everywhere** (friends never built it; tore out the
  showcase-comment report + endpoint + UI, left `showcase_comments.is_reported` vestigial); fixed
  the pack summary keep/discard button (was a state-label toggle that read inverted → now an action
  button; tile styling + `/keep` data were already correct). Updated README, CLAUDE.md (status +
  Vite 8), and the rules skill; `docs/` links removed (dir doesn't exist).

**Open item:** portfolio "value over time" starts at the first per-user daily snapshot (07-12);
earlier days aren't reconstructed (accepted). Signup emails still need custom Resend SMTP.

---

## 2026-07-13 — Simulator: server-authoritative roll + own shell + flip-stack reveal ⏳

Built the master-prompt simulator feature onto the existing (shipped) pack/pulls/leaderboard code.

**Backend — server authority + quota (new `pack_opens`):**
- `POST /simulator/open` now persists the authoritative roll (`pack_opens.rolled_cards` jsonb with
  open-time prices) and enforces **2 packs/UTC-day** (query-time `date_trunc('day', now() AT TIME
  ZONE 'UTC')`, no reset job). Returns `open_id` + `packs_remaining_today`. `GET /simulator/quota`.
- Keep is now `POST /simulator/keep {open_id, kept_card_ids}` (replaced single-card `POST
  /pack-pulls`): validates each id against the stored roll (rejects tampering), idempotent per open,
  freezes `price_at_pull` from the server's `price_at_open`. `pack_pulls.open_id` FK added.
- Vault/leaderboard moved under `/simulator/*` (`GET /simulator/vault`, `/simulator/leaderboard`).
- Price frozen at OPEN time via the one-source `unit_price_usd` (same fn the vault/leaderboard use).

**Leaderboard eligibility (decision — overrides master prompt + old rule):** dedicated opt-in.
Renamed the vestigial unused `users.show_value_on_leaderboard` → **`leaderboard_opt_in`** (default
off). Eligible iff `leaderboard_opt_in AND handle AND ≥1 pull` — **decoupled from `is_public`**.
Leaderboard links a name to `/u/{handle}` only when that user's showcase is public (`showcase_public`
flag added to the entry). Rules skill updated ("opt-in required; showcase visibility separate").

**Handle (decision):** reused the existing `handle` (`^[a-z0-9_-]{3,30}$`, `PATCH /me`) as-is — NO
citext / new endpoints. Added a first-simulator-entry gate (blocks open/vault until a handle is set;
does NOT auto-opt-in to the leaderboard).

**Frontend — own shell + the reveal:** new `SimulatorLayout` (dark arcade chrome, sub-nav, always
`.dark`-scoped) at `/simulator/{open,vault,leaderboard}`; main nav collapsed to one "Simulator"
entry; old `/pulls` + `/leaderboard` redirect in. Flip-stack `PackReveal` (tap-to-flip/advance, Flip
all, progress dots, rarity tells restrained to rare+, dramatic finale on the hit — dim + label flash
+ chime, `prefers-reduced-motion` aware). Locked `CardBack` SVG (§7). Synthesized SFX (`lib/sfx.ts`,
Web Audio, persisted mute). Vault stacks duplicates ×N. Settings gained the opt-in toggle.

**Migration `b8dae2f406c9`** (additive): `pack_opens` + `pack_pulls.open_id` + the
`show_value_on_leaderboard`→`leaderboard_opt_in` rename. **Not yet applied to prod** (awaiting the
go-live step). Server import-clean; `test_simulator.py` green; ruff + `pnpm build`/`lint`/prettier
clean. DB-backed `test_pulls.py` rewritten (separation, server-authority, quota, frozen-vs-live,
opt-in leaderboard) — runs once the migration is applied.

**Next:** apply the migration to the live session pooler → run `test_pulls.py` → e2e drive the flow.

---

## 2026-07-09 — Price history: owned-cards-only snapshot (free-tier fix) ✅

**Problem:** the daily snapshot wrote a `price_history` row for every priced card (~52k) →
measured **~30 MB/day**, which fills the 500 MB Supabase free tier in ~2 weeks. Weekly cadence
would only delay that. Kept **daily** (best for charts) and fixed the **scope** instead.

- `snapshot_prices.py`: `_snapshot_statement()` + eligible count now filter
  `card_id IN (SELECT card_id FROM collection_entries)` — history only for owned cards.
- `sync_catalog.py`: **stopped writing price_history inline** (it ran first in the daily job and
  was the real 52k-row writer); dropped `_upsert_price_history` + the `PriceHistory` import. It
  still refreshes the catalog + `card_prices_current` (fixed-size upsert, no growth).
- `tests/test_history.py`: rewrote the snapshot test to seed a `User` + `CollectionEntry` and
  assert owned-only (priced-but-un-owned card excluded, null market excluded). 10/10 history+
  pricing tests green; ruff clean.
- **Verified live:** the owned-only snapshot wrote **6 rows** (test user's owned cards) instead
  of ~52k.

**Gotcha / open item:** a one-time prune of the existing ~52k un-owned backlog
(`DELETE FROM price_history WHERE card_id NOT IN (SELECT card_id FROM collection_entries)` +
`VACUUM FULL`) was **blocked by the auto-mode safety classifier** (bulk delete on the live DB).
It's non-essential (future growth is already fixed); left for the user to run/authorize. Script:
`scratchpad/prune_history.py`.

**Cadence unchanged:** `.github/workflows/daily-snapshot.yml` stays daily 08:00 UTC.

---

## 2026-07-09 — Frontend UX & performance overhaul ✅

Made the SPA smoother, faster, more polished, mobile/accessible, and added catalog/collection
conveniences. Backend got small additive `/cards` changes.

**Data layer (smoothness):** added `@tanstack/react-query`; `src/lib/queries.ts` centralizes all
query/mutation hooks with a key factory. Revisiting a page is now instant from cache with
background refresh; collection qty/edit/delete are **optimistic**; the collection page's old N+1
`getCard` calls are replaced by a shared cached `useCardNames` (reuses the card cache).

**Performance:** route-level `React.lazy` + `<Suspense>` (skeleton fallback) in `App.tsx`, and
`vite.config.ts` `manualChunks` splitting vendors. Before: one **817 KB (234 KB gz)** bundle with
charts loaded upfront. After: initial path no longer includes charts — `charts` (recharts) is its
own **104 KB gz** chunk loaded only on Dashboard/CardDetail; per-page chunks are 1–2.5 KB gz;
vendors split (react 71, supabase 51, query 12 gz). Lazy images with `decoding="async"`.

**Visual system:** expanded `@theme` palette (brand/accent/semantic) + Tailwind v4 manual-dark
variant (`@custom-variant dark`); **light/dark theme toggle** (`ThemeContext`, persisted); **toasts**
(`components/Toast.tsx`, no dep) replacing inline text; **skeleton** loaders (`components/Skeleton.tsx`);
polished `CardTile` (hover lift, rarity chip), `Layout` (sticky nav → mobile hamburger + toggle),
gradient dashboard stat tiles + area chart.

**Mobile & a11y:** responsive hamburger nav; edit modal is `role="dialog"` + `aria-modal` + Esc-close
+ initial focus; aria-labels on icon buttons; global `:focus-visible` ring.

**Conveniences:** catalog **rarity filter + sort** (number/name/rarity/price↑↓) + search by name or
number; collection client-side sort (value/name/qty) + set/foil filters.
- **Backend:** `GET /cards` gained `rarity` + `sort` (price sort via a max-TCGPlayer-market subquery
  join) and a new `GET /cards/rarities`. `app/services/cards.py` + `endpoints/cards.py` +
  `tests/test_catalog.py` (6 new tests).

**Verified:** backend `pytest` **44 passed / 3 skipped** (skips = Tesseract scan tests, green in
Docker) + ruff clean; frontend `pnpm build` (code-split) + `lint` + prettier clean. Rebuilt the prod
Docker image and confirmed live: `/cards/rarities` (37), `sort=price_desc` (Shining Tyranitar
$4,249.99 first), rarity filter, and **no regression** in authed `/me` + `/collection` + `/summary`.

**Gotchas:** Vite 8/rolldown wants `manualChunks` as a **function** (object form rejected);
`tsconfig.node.json` needed `target ES2022`/`lib ES2023` for `String.includes`; FastAPI `Query` in a
multi-line default tripped ruff B008 → used the `Annotated[...]` form.

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

---

## Session — 2026-07-12 (post-launch feature work, all deployed to main)

All items below are shipped to `main` and live on Render/Vercel unless noted. Commits authored
as the user, no `Co-Authored-By` trailers. Project rules now live in
`.claude/skills/pokevault-rules-SKILL.md` (committed) — the locked-conventions source of truth.

**Dashboard**
- Portfolio-value-over-time chart reworked to **per-user daily rows** (`portfolio_value_daily`),
  not reconstructed from per-card history; today's point is the live value; endpoint never 500s
  (empty series + message on failure). EUR→USD via the one-source valuation (`86e4db5`).
- "By set" table trimmed to **Set · Owned · Value** (dropped the orphaned Completion column;
  retired `completion_pct` from schema/valuation; public `sets_completed` recomputed) (`170564b`).
- **Eye toggle** to hide/show the portfolio value (localStorage, masks the number in the DOM,
  reactive via `useSyncExternalStore`) (`dfe463a`).

**Catalog / Collection / Deck / Wishlist**
- Catalog defaults to **All sets**; `number` sort now groups by set release date then **numeric**
  collector number (handles lettered SV/TG/GG, keeps them) — backend query, not display (`bf58d07`).
- **Set completion removed**; **Deck** (dream-deck builder: `decks`+`deck_cards`) added, incl. a
  read-after-write fix (`ff964fd`, `9ac116c`).
- **Wishlist** sort control (status default) (`bbf1275`).
- **Numeric validation** both sides (qty 1–99, deck target 1–100, money 0–1,000,000; backend is
  source of truth via Pydantic + increment/import clamps) (`670cb24`).
- **Graded value** clarified: PSA multiplier varies by grade; non-PSA (BGS/CGC/SGC) show RAW +
  "graded premium not applied" label (backend was already correct; UI fix) (`0d2cccd`).

**Simulator → Pulls → Leaderboard**
- **Pack Simulator** (server-side, approximate rarity-weighted odds) replaced the old
  portfolio leaderboard (`d969a0b`); bulk "Keep all" / "Keep marked, discard rest" (`f8889fe`).
- **Virtual pull collection** (`pack_pulls`): Keep now writes there, **never** the IRL collection
  (separation gate tested); frozen `price_at_pull` + live current value; snapshot job tracks pull
  cards too. **Best-pulls leaderboard** (`best_single`/`total_value` × `all_time`/`monthly`,
  query-time seasons, public profiles only). New **Vault** + **Leaderboard** pages (`eca2462`).

**Other**
- Ambient Pokémon-themed per-page background (CSS/SVG, reduced-motion aware) (`bb3871f`).
- **Scan M1 fix**: name-only matches no longer tie flat / drop the exact card (set-age tiebreak);
  base1-4 now ranks #1 for "Charizard" (`5e719c6`).
- **Comments on public showcases** (`showcase_comments` + `users.comments_enabled`): 500-char cap,
  5/min rate limit, React-escaped render, Report flag, owner-disable, public-only (`ac8a8a9`).
- **Auth**: sign-in accepts any password + generic error; neutral anti-enumeration sign-up copy;
  password-reset + magic-link flows (`/forgot-password`, `/reset-password`) (`ee2d1d0`, `73aceb2`).
- **Daily snapshot job**: DATABASE_URL secret re-set to the tenant-qualified pooler URL; the
  **scheduled** run is now green (was failing). Catalog confirmed current (173 sets); Mega
  Evolution sets (me2pt5/me3/me4) are blank because **pokemontcg.io has no prices for them**
  (upstream gap, not our bug).

**Migrations applied to prod (session pooler, additive):** `d4f6b8c0e2a3` portfolio_value_daily ·
`e5a7c9d1f3b4` decks/deck_cards · `f6b8d0e2a4c5` showcase_comments + users.comments_enabled ·
`a7c9e1f3b5d7` pack_pulls. (Leaderboard removal left `users.show_value_on_leaderboard` as a
harmless vestige — no destructive drop.)

**OUTSTANDING — pre-launch blocker:**
- **Signup is currently broken** (`POST /auth/v1/signup` → 500 `unexpected_failure`, no user row):
  the built-in Supabase mailer is bounce-throttled. Fix = **custom SMTP via Resend** — frontend
  reset/magic-link code is shipped, but SMTP is **paused awaiting a Resend account** (then wire
  Supabase SMTP fields + verify a domain's DNS). Do NOT launch publicly until signup delivers.
- Confirm-email is ON (`mailer_autoconfirm:false`) — launch-safe once SMTP works.
