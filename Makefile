.PHONY: setup hooks

# Bootstrap developer environment
setup: hooks

# Install git hooks
hooks:
	@echo "Installing git hooks..."
	@bash scripts/install-hooks.sh

# Windows fallback (Git Bash)
setup-win:
	@echo "Installing git hooks..."
	@bash scripts/install-hooks.sh
