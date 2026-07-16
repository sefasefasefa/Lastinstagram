#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Set up Python venv for funcaptcha solver and stealth bridge
if [ ! -d ".venv" ]; then
  PIP_USER=0 python3 -m venv .venv
fi
PIP_USER=0 .venv/bin/pip install --no-cache-dir -r lib/funcaptcha-solver/requirements.txt
# Force-reinstall requests to work around a silent pip install issue on Replit
PIP_USER=0 .venv/bin/pip install --no-cache-dir --force-reinstall requests
