# Scheduling the routine — Claude Code (web Routine, or local cron)

This replaces the old GitHub Actions workflow. The recurring cadence is now driven by Claude Code
itself. Two ways, pick one (you can run both — they share `PROGRESS.md` as the lock).

The agent logic is unchanged and scheduler-agnostic: every run reads `ROUTINE.md` and does one
phase. Only *what fires the run* differs.

---

## Option A — Claude Code **web Routine** (recommended)

Native time-based scheduling on Anthropic-managed cloud. Runs even when your machine is off, no
permission prompts, fresh clone per run (exactly like a normal web session — it can branch, push,
open a PR, and merge via the GitHub integration).

Docs: https://code.claude.com/docs/en/routines  ·  Min interval: **1 hour** (so every 3h is fine).

**Prerequisite — scaffolding on `main`.** A Routine runs on a fresh clone of the **default branch
(`main`)**, so `tasks/test-coverage-routine/*` must be on `main` for the run to read `ROUTINE.md`.
Either merge the scaffolding PR (`claude/test-coverage-analysis-8s1io1 → main`) first, **or** rely on
the self-bootstrap line in the prompt below (it fetches the scaffolding from that branch until it's
merged). Merging first is cleaner.

**Create it (web UI):** go to https://claude.ai/code/routines → New routine →
- **Repo:** `isopen-io/meeshy`
- **Schedule trigger:** every 3 hours (your timezone)
- **Environment:** one whose network policy allows package installs (pnpm/uv/gradle) — "Trusted" or
  a Custom allowlist; set the registry/env it needs. No API key needed in the repo. Make sure the
  GitHub integration can push branches, open PRs, and merge a green PR (branch protection on main
  must permit the bot to merge required-checks-passing PRs — it never force-merges past red CI).
- **Prompt:** paste the block below.

**Or create it from the CLI** (in an interactive `claude` session on this repo):
```
/schedule every 3 hours run the test-coverage routine in tasks/test-coverage-routine/ROUTINE.md
```
Then `/schedule list` / `/schedule update` to manage it.

### Routine prompt (paste this)
```
You are the autonomous test-coverage agent for isopen-io/meeshy.

Bootstrap: if tasks/test-coverage-routine/ROUTINE.md is not present on the checked-out branch,
run `git fetch origin claude/test-coverage-analysis-8s1io1 && git checkout
origin/claude/test-coverage-analysis-8s1io1 -- tasks/test-coverage-routine` to obtain it, then
proceed. (Once the scaffolding is merged to main this is a no-op.)

Read and follow EXACTLY: tasks/test-coverage-routine/ROUTINE.md
State / what to do next:           tasks/test-coverage-routine/PROGRESS.md
Reviewer rubric (mandatory gate):  tasks/test-coverage-routine/REVIEWER.md

Complete ONE phase this run:
- Branch off the latest main: claude/coverage/<slice-id>.
- Pick the next slice: Sprint 0 items first, then the highest-priority ☐ cell.
- Write tests TDD-style to >=92% line+branch on the slice's targeted modules AND >=92% on the
  diff's changed lines, covering the edge-case checklist.
- Pass the reviewer gate. Update PROGRESS.md, manifests, RUNLOG.md.
- Open a PR, run CI, and MERGE to main (squash) ONLY when ALL hold: diff is tests/CI-config only
  (no production logic), CI green, reviewer PASS, clean rebase on main (resolve conflicts by keeping
  BOTH sides' tests). Otherwise leave the PR open and mark the slice ⚠ blocked.
- Advance exactly one phase. Leave main green.

Hard rules: behavior over implementation; no tautological tests; never lower a coverage floor or
weaken a test; never merge past red CI or a diff touching production logic; never commit secrets.
```

---

## Option B — **Local** cron / launchd / systemd + `claude -p`

Runs on your machine (or any always-on box / server). Needs the machine awake at fire time. Uses
the headless CLI. Auth: log in once with `claude auth login` (subscription) or export
`ANTHROPIC_API_KEY`.

Docs: https://code.claude.com/docs/en/headless · https://code.claude.com/docs/en/cli-reference

A ready wrapper is provided: [`run-routine.sh`](run-routine.sh). It `cd`s into the repo, runs one
phase headless, and logs. Wire it to a scheduler:

**cron** (every 3h):
```cron
0 */3 * * * /home/user/meeshy/tasks/test-coverage-routine/run-routine.sh >> /tmp/meeshy-coverage.log 2>&1
```

**macOS launchd** (`~/Library/LaunchAgents/me.meeshy.coverage.plist`, `StartInterval` = 10800s) or a
**systemd** timer (`OnUnitActiveSec=3h`) work the same way — both just invoke `run-routine.sh`.

> A local `flock` in the wrapper prevents overlapping runs if one phase runs long.

---

## In-session `/loop` (NOT recommended here)
`/loop 3h ...` only fires while a session stays open and expires after 7 days — fine for polling,
not for unattended multi-day coverage work. Use a Routine or local cron instead.

---

## Which to choose
- Want it truly unattended for 1–2 weeks, machine-independent → **Option A (web Routine)**.
- Want it on your own hardware / behind your network / no cloud session → **Option B (local cron)**.
- The two are compatible: both drive the same `ROUTINE.md` and serialize via the `PROGRESS.md`
  claim marker + open-PR check in pre-flight.
