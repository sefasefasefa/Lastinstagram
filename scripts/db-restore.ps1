# Restores the committed database snapshot (schema + data) into the local
# Postgres container started by `docker compose up -d`. Intended for running
# this project on Windows after `git clone` — not needed on Replit, where
# the database is already provisioned and populated.
#
# Usage (PowerShell):
#   1. docker compose up -d
#   2. Copy-Item .env.example .env   (fill in DATABASE_URL, see .env.example)
#   3. .\scripts\db-restore.ps1
#
# Uses `docker compose exec` to run psql inside the db container, so you
# don't need Postgres client tools installed on your own machine.

$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

$DumpFile = "lib/db/backup/database.sql"
$DbUser = "takipci"
$DbName = "takipci_paneli"

if (-not (Test-Path $DumpFile)) {
    Write-Error "Dump file not found at $DumpFile"
    exit 1
}

Write-Host "Waiting for Postgres to accept connections..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    docker compose exec -T db pg_isready -U $DbUser -d $DbName *> $null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    Write-Error "Postgres did not become ready in time. Is 'docker compose up -d' running?"
    exit 1
}

Write-Host "Restoring $DumpFile into the db container ..."
Get-Content $DumpFile -Raw | docker compose exec -T db psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Restore failed."
    exit 1
}

Write-Host "Done. Default login: admin / admin123 (change this before real use)."
