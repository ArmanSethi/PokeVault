---
name: run
description: Launch and DRIVE the LOCAL PokéVault app (Vite dev server) and log in to reach the authenticated screens (dashboard, collection, simulator, vault). Use when asked to "run", "start the app", "run it locally", "screenshot the app", or "show me the app working". This is the repo's verified local-launch recipe — prefer it over rediscovering the commands.
---

# Run PokéVault locally (and log in)

Launch the app the way a user meets it, then **drive it past `/login`** with a real
account so authenticated screens (dashboard / collection / simulator / vault) are
actually reachable — not just the login wall.

Running means launching and interacting, not `pnpm build` and not a unit test. A launch
with no interaction only proves the entrypoint resolves; drive it to a screen a user
would see and **look at the screenshot** (a blank frame is a failure to launch).

## Preflight (assert, don't assume)

From the repo root, confirm local setup is in place:

- `backend/.env`, `backend/.venv`, `frontend/.env`, `frontend/node_modules` all exist.

If `frontend/node_modules` is missing: `cd frontend && pnpm install`. If the Playwright
browser is missing, the driver errors with a download hint — run
`cd frontend && pnpm exec playwright install chromium`.

## Config note — the dev server talks to PROD by default

`frontend/.env` `VITE_API_URL` points at the **deployed Render API**
(`https://pokevault-api-nup5.onrender.com/api/v1`) and live Supabase. So `pnpm dev`
alone gives a fully working app running against **production data** — which is exactly
what you want for reviewing frontend UI work (dashboard, simulator reveal, etc.).

Optional **fully-local stack** (only when a backend change isn't deployed yet): start
the API with `cd backend && uv run uvicorn app.main:app --reload` (→ `:8000`), then
repoint `frontend/.env` `VITE_API_URL` to `http://localhost:8000/api/v1` and restart
`pnpm dev`. Remember to revert `.env` afterward.

## Launch

```bash
cd frontend && pnpm dev        # run in the background → http://localhost:5173/
```

Vite is ready in ~1s. Confirm the "Local: http://localhost:5173/" line before driving.

## Drive + log in (the key step)

Auth is **Supabase-direct** (client-side GoTrue), so login works even if the backend is
down. The login form lives in `frontend/src/pages/LoginPage.tsx` — a plain email/password
form: `input[type=email]`, `input[type=password]`, and a **"Sign in"** submit button.
Loading `/` redirects to `/login` when unauthenticated; a successful login navigates
back to `/`.

Credentials live **only** in the gitignored `credentials.local` next to this file
(`POKEVAULT_EMAIL` / `POKEVAULT_PASSWORD`) — never hardcode them in this SKILL.md.

**Two module-resolution gotchas (both hit during authoring):**

1. Playwright only resolves from `frontend/node_modules`. Write the driver **inside
   `frontend/`** (or set `NODE_PATH` to it) — a script in the scratchpad throws
   `ERR_MODULE_NOT_FOUND: playwright`.
2. Name the driver so the skill's `.gitignore` covers it (`*.local.mjs`) **or delete it
   after** — don't leave a stray `.mjs` in the repo tree (authoring left an `_drive.mjs`
   behind and had to `rm` it).

Driver skeleton — write to `frontend/_drive.local.mjs`, then `cd frontend && node _drive.local.mjs`:

```js
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

// creds from the gitignored file (../.claude/skills/run/credentials.local relative to frontend/)
const env = Object.fromEntries(
  readFileSync(new URL('../.claude/skills/run/credentials.local', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split('=').map((s) => s.trim()))
    .map(([k, ...v]) => [k, v.join('=')]),
);

const SHOT = 'C:/Users/arman/AppData/Local/Temp/claude/.../scratchpad/app.png'; // your scratchpad
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.fill('input[type=email]', env.POKEVAULT_EMAIL);
await page.fill('input[type=password]', env.POKEVAULT_PASSWORD);
await page.click('button[type=submit]');                 // the "Sign in" button
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
await page.waitForTimeout(1500);                          // let the dashboard settle

console.log('URL:', page.url());                          // must NOT be /login
console.log('errors:', errors.length ? errors.join('\n') : '(none)');
await page.screenshot({ path: SHOT });
await browser.close();
```

Then **Read the screenshot**. Pass = URL left `/login`, the dashboard painted (portfolio
value / cards, not a blank frame), and console errors are `(none)`. Staying on `/login`
(or an "Invalid email or password" message) = failure — the creds or Supabase config
regressed; check `frontend/.env` `VITE_SUPABASE_*`.

From here, `page.goto` any authenticated route to screenshot it — e.g. `/simulator`,
`/collection`, the dashboard `/`.

## Clean up

- Delete the driver file if you didn't use a `*.local.mjs` name (the gitignored pattern
  already covers `*.local.mjs`).
- The `pnpm dev` background process keeps running for follow-up interaction — leave it up
  unless the user is done, then stop it.
