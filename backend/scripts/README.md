# Daily price snapshot — scheduling

PokéVault has **no upstream price history** (pokemontcg.io only exposes current prices),
so it builds its own by refreshing current prices and snapshotting them into
`price_history` **once per day**. The job is idempotent (one row per
card/source/variant/day), so re-running within a day updates rather than duplicates.

Two ways to schedule it. Production uses the GitHub Action; the local options are for
running the daily job off your own machine.

## 1. GitHub Actions (production — recommended)

`.github/workflows/daily-snapshot.yml` runs daily at 08:00 UTC (and on demand from the
Actions tab). Add these repository **Actions secrets**
(_Settings → Secrets and variables → Actions_):

| Secret | Value |
| ------ | ----- |
| `DATABASE_URL` | the `postgresql+asyncpg://…pooler.supabase.com:5432/postgres` session-pooler URL |
| `POKEMONTCG_API_KEY` | your pokemontcg.io API key |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |

No code changes needed — push the workflow and set the secrets.

## 2. Local — Windows Task Scheduler

Reads credentials from `backend/.env`. Register a daily 08:00 task (run from the repo root
in an elevated PowerShell; adjust the path to `daily_sync.ps1` if your checkout differs):

```powershell
schtasks /Create /TN "PokeVault Daily Sync" /SC DAILY /ST 08:00 /F `
  /TR "pwsh -NoProfile -File `"$PWD\backend\scripts\daily_sync.ps1`""
```

Verify / run once / remove:

```powershell
schtasks /Query  /TN "PokeVault Daily Sync"
schtasks /Run    /TN "PokeVault Daily Sync"
schtasks /Delete /TN "PokeVault Daily Sync" /F
```

## 3. Local — cron (Linux / macOS)

`crontab -e`, then (adjust the path to your checkout):

```cron
0 8 * * * cd /path/to/pokevault/backend && uv run python -m app.ingest.sync_catalog && uv run python -m app.ingest.snapshot_prices >> /tmp/pokevault-sync.log 2>&1
```
