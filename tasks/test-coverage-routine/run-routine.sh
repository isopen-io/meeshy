#!/usr/bin/env bash
# Local driver for the autonomous test-coverage routine (Option B in SETUP-ROUTINE.md).
# Runs ONE phase headless via the Claude Code CLI, then exits. Wire to cron/launchd/systemd
# every 3h. Auth: `claude auth login` once, or export ANTHROPIC_API_KEY.
#
#   0 */3 * * * /home/user/meeshy/tasks/test-coverage-routine/run-routine.sh >> /tmp/meeshy-coverage.log 2>&1
set -euo pipefail

# --- config ---------------------------------------------------------------------
REPO_DIR="${MEESHY_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
LOCK="/tmp/meeshy-coverage.lock"
MAX_TURNS="${MEESHY_MAX_TURNS:-200}"
MAX_BUDGET_USD="${MEESHY_MAX_BUDGET_USD:-15}"

# --- single-instance guard (no overlapping phases) ------------------------------
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[$(date -u +%FT%TZ)] another phase is still running; skipping this tick."
  exit 0
fi

cd "$REPO_DIR"
echo "[$(date -u +%FT%TZ)] starting coverage phase in $REPO_DIR"

read -r -d '' PROMPT <<'EOF' || true
You are the autonomous test-coverage agent for this repository.

Read and follow EXACTLY: tasks/test-coverage-routine/ROUTINE.md
State / what to do next:           tasks/test-coverage-routine/PROGRESS.md
Reviewer rubric (mandatory gate):  tasks/test-coverage-routine/REVIEWER.md

Complete ONE phase this run:
- Branch off the latest main: claude/coverage/<slice-id>.
- Pick the next slice: Sprint 0 items first, then the highest-priority unchecked cell.
- Write tests TDD-style to >=92% line+branch on the slice's targeted modules AND >=92% on the
  diff's changed lines, covering the edge-case checklist.
- Pass the reviewer gate. Update PROGRESS.md, manifests, RUNLOG.md.
- Open a PR, run CI, and MERGE to main (squash) ONLY when ALL hold: diff is tests/CI-config only
  (no production logic), CI green, reviewer PASS, clean rebase on main (resolve conflicts by keeping
  BOTH sides' tests). Otherwise leave the PR open and mark the slice blocked.
- Advance exactly one phase. Leave main green.

Hard rules: behavior over implementation; no tautological tests; never lower a coverage floor or
weaken a test; never merge past red CI or a diff touching production logic; never commit secrets.
EOF

# --bare: skip discovery overhead for deterministic startup.
# --permission-mode acceptEdits + broad --allowedTools so cron isn't blocked on prompts.
# Tools include Bash (git/gh/test runners) — review the trade-off before enabling unattended.
claude --bare -p "$PROMPT" \
  --permission-mode acceptEdits \
  --allowedTools "Bash,Read,Edit,Write,Glob,Grep,Task,WebFetch" \
  --max-turns "$MAX_TURNS" \
  --max-budget-usd "$MAX_BUDGET_USD" \
  --output-format json

echo "[$(date -u +%FT%TZ)] phase finished"
