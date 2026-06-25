#!/bin/sh
# Pre-commit hook: block temp/debug files from being committed
#
# Install:  scripts/install-hooks.sh  (or symlink manually)
# Skip:     git commit --no-verify

FATAL="tmp_*.py _list_users.py run_api.py"

staged=$(git diff --cached --name-only)
abort=0

for pattern in $FATAL; do
    if echo "$staged" | tr ' ' '\n' | grep -q "^${pattern}$"; then
        echo "ERROR: Attempting to commit '$pattern' — forbidden temp/debug script."
        abort=1
    fi
done

for pattern in "client/*.txt" "client/*.json" "client/*_test.py" "client/docs_debug.html"; do
    if echo "$staged" | tr ' ' '\n' | grep -q "^${pattern}$"; then
        echo "ERROR: Attempting to commit '$pattern' — temp/debug artifact."
        abort=1
    fi
done

for f in $staged; do
    case "$f" in
        *_test.py|vol?_*.py)
            case "$f" in
                app/*|client/src/*|client/e2e/*) ;;
                *)
                    echo "ERROR: '$f' looks like a one-off test/script at repo root."
                    abort=1
                    ;;
            esac
            ;;
    esac
done

if [ "$abort" -eq 1 ]; then
    echo "Commit aborted. Use 'git rm --cached' to untrack, then add to .gitignore."
    exit 1
fi
