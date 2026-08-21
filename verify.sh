#!/usr/bin/env bash
# AETHER verification gate.
# Runs the full Definition-of-Done gate for the AETHER fix task.
#   - npm test            (unit + benchmark + scientific)
#   - npm run lint        (ESLint, js/)
#   - pytest python/validation/ -v   (Python backend)
#   - npx playwright test (browser E2E, if browsers installable)
#
# Exits non-zero if any required step fails. Steps that cannot run because of a
# missing/blocked dependency are reported as BLOCKED (never silently skipped).
set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

FAILED=0

step() { printf '\n\033[1;36m==== %s ====\033[0m\n' "$1"; }

run_required() {
  local name="$1"; shift
  step "$name"
  if ! "$@"; then
    echo "[verify] FAILED: $name"
    FAILED=1
  fi
}

# --- 1. JS unit / benchmark / scientific ---
run_required "npm test" npm test

# --- 2. ESLint ---
run_required "npm run lint" npm run lint

# --- 3. Python backend tests ---
# Prefer the project venv (.venv) if present; otherwise fall back to python3.
if [ -x "$ROOT/.venv/bin/python" ]; then
  PY="$ROOT/.venv/bin/python"
else
  PY="$(command -v python3 || true)"
fi
if [ -n "$PY" ]; then
  step "pytest python/validation/  (python: $PY)"
  if "$PY" -m py_compile python/api/main.py && "$PY" -m pytest python/validation/ -v; then
    :
  else
    echo "[verify] FAILED: pytest"
    FAILED=1
  fi
else
  echo "[verify] BLOCKED: python3 not available"
  FAILED=1
fi

# --- 4. Playwright E2E (browser). BLOCKED if browsers cannot be installed. ---
if command -v npx >/dev/null 2>&1 && [ -f node_modules/.bin/playwright ]; then
  step "playwright install (chromium)"
  if npx playwright install chromium >/dev/null 2>&1; then
    run_required "npx playwright test" npx playwright test
  else
    echo "[verify] BLOCKED: playwright browsers could not be installed (${?})"
    FAILED=1
  fi
else
  echo "[verify] BLOCKED: playwright not installed"
  FAILED=1
fi

if [ "$FAILED" -eq 0 ]; then
  echo "\n\033[1;32mALL GATE STEPS PASSED\033[0m"
else
  echo "\n\033[1;31mGATE FAILED (one or more steps red or blocked)\033[0m"
fi
exit "$FAILED"
