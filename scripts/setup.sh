#!/bin/sh
# setup.sh — bootstrap developer environment
set -e

echo "=== Story2Video Development Setup ==="

# Copy .env if not exists
if [ ! -f ".env" ]; then
  echo ""
  echo "[1/4] Creating .env from .env.example..."
  cp .env.example .env
  echo "  -> Edit .env to set your passwords and API keys before starting."
else
  echo "[1/4] .env already exists, skipping."
fi

# Install git hooks
echo ""
echo "[2/4] Installing git hooks..."
bash "$(dirname "$0")/install-hooks.sh"

# Docker check
echo ""
echo "[3/4] Checking Docker..."
if command -v docker >/dev/null 2>&1; then
  echo "  Docker found."
else
  echo "  WARNING: Docker not found. PostgreSQL and Redis are required."
fi

# Init DB reminder
echo ""
echo "[4/4] Database setup reminder"
echo "  After running 'docker compose up -d', initialize the database:"
echo "    docker compose exec -T postgres psql -U story2video < scripts/init-db.sql"
echo ""

echo "Done. Next steps:"
echo "  1. Edit .env with your settings"
echo "  2. docker compose up -d"
echo "  3. docker compose exec -T postgres psql -U story2video < scripts/init-db.sql"
echo "  4. cd client && npm install && npm run dev"
echo "  5. python run_api.py"
