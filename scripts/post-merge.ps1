# Windows equivalent of post-merge.sh
# Runs automatically after a task merge, or can be run manually.
#
# Usage (PowerShell):
#   .\scripts\post-merge.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Installing Node dependencies..."
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "Pushing database schema..."
pnpm --filter db push
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "Setting up Python venv..."
if (-not (Test-Path ".venv")) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { Write-Error "venv creation failed"; exit 1 }
}

$pip = ".\.venv\Scripts\pip.exe"
& $pip install --no-cache-dir -r lib\funcaptcha-solver\requirements.txt
if ($LASTEXITCODE -ne 0) { exit 1 }

# Force-reinstall requests to avoid a silent pip install issue
& $pip install --no-cache-dir --force-reinstall requests
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "Setup complete." -ForegroundColor Green
