#!/usr/bin/env bash
# Linux/macOS equivalent of setup-python.ps1.
# Creates a .venv and installs funcaptcha solver + stealth bridge deps.
#
# Usage:
#   ./scripts/setup-python.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "Setting up Python venv..."

if [ ! -d ".venv" ]; then
  PIP_USER=0 python3 -m venv .venv
fi

PIP_USER=0 .venv/bin/pip install --no-cache-dir -r lib/funcaptcha-solver/requirements.txt

# Force-reinstall requests to avoid a silent pip install issue on Replit
PIP_USER=0 .venv/bin/pip install --no-cache-dir --force-reinstall requests

echo ""
echo "Python venv ready."
echo "If the API server can't find Python, add to your .env:"
echo "  STEALTH_REQUESTS_PYTHON=.venv/bin/python3"
