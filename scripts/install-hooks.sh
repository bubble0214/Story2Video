#!/bin/sh
# install-hooks.sh — symlink scripts/pre-commit.sh into .git/hooks/pre-commit
set -e
cd "$(dirname "$0")/.."
HOOKS=".git/hooks"
SCRIPT="scripts/pre-commit.sh"
TARGET="$HOOKS/pre-commit"

if [ ! -d "$HOOKS" ]; then
    echo "Error: $HOOKS not found (are you in the repo root?)"
    exit 1
fi

if [ -f "$TARGET" ] && [ ! -L "$TARGET" ]; then
    echo "Backing up existing $TARGET → $TARGET.backup"
    mv "$TARGET" "$TARGET.backup"
fi

ln -sf "../../$SCRIPT" "$TARGET"
chmod +x "$TARGET"
chmod +x "$SCRIPT"
echo "Installed pre-commit hook → $TARGET"
