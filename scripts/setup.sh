#!/bin/sh
# setup.sh — bootstrap developer environment
set -e

echo "=== Story2Video Development Setup ==="

# Install git hooks
echo ""
echo "[1/1] Installing git hooks..."
bash "$(dirname "$0")/install-hooks.sh"

echo ""
echo "Done. Run 'docker compose up' to start the stack."
