<#
.SYNOPSIS
    PokéVault daily price refresh + history snapshot (local Windows runner).

.DESCRIPTION
    Refreshes current prices from pokemontcg.io and snapshots them into price_history
    (one row per card/variant/day). Reads secrets from backend/.env via the app's own
    pydantic-settings loader, so no credentials live in this script.

    Register it with Windows Task Scheduler to run daily (see scripts/README.md), or run
    it by hand:  pwsh backend/scripts/daily_sync.ps1
#>

$ErrorActionPreference = "Stop"

# Resolve the backend dir (parent of this script's folder) regardless of caller CWD.
$BackendDir = Split-Path -Parent $PSScriptRoot
Set-Location $BackendDir

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Output "[$stamp] PokeVault daily sync starting in $BackendDir"

# sync_catalog refreshes card_prices_current and writes today's price_history inline;
# snapshot_prices then ensures every priced row has today's history row.
uv run python -m app.ingest.sync_catalog
uv run python -m app.ingest.snapshot_prices

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Output "[$stamp] PokeVault daily sync finished"
