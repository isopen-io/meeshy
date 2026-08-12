# Autonomous Test-Coverage Routine

A self-perpetuating routine that drives the whole monorepo toward 92% line+branch coverage,
one verified feature-slice at a time, on a 3-hour cadence.

## Why it's built this way
A single Claude Code session runs in an ephemeral container — it can't sit and fire every 3 hours
for ~1–2 weeks. So the durable state lives in git, and a **scheduler launches a fresh agent each
cycle** that resumes from that state. The scheduler is **Claude Code itself** — a web **Routine**
(cloud, time-based) or a **local cron** driving `claude -p`. See `SETUP-ROUTINE.md`.

## The pieces
| File | Role |
|------|------|
| `PROGRESS.md` | **Source of truth.** Feature × app matrix, Sprint 0 CI fixes, per-feature module targets, baselines. Each run reads it to pick the next slice and writes it back. |
| `ROUTINE.md` | The agent playbook (scheduler-agnostic): pre-flight → select slice → TDD loop → reviewer gate → PR → merge. |
| `REVIEWER.md` | The quality rubric the reviewer subagent enforces. Coverage is necessary, not sufficient — kills tautological tests. |
| `RUNLOG.md` | Append-only history of what each run did and where the next resumes. |
| `SETUP-ROUTINE.md` | How to schedule it: web Routine (`/schedule`, every 3h) **or** local cron. |
| `run-routine.sh` | Local headless driver (`claude -p`) for cron/launchd/systemd. |

## How a cycle (one "phase") works
1. Cron (or manual dispatch) starts a fresh Claude agent, which branches off the latest `main`
   (`claude/coverage/<slice-id>`).
2. Reads `PROGRESS.md`, claims the next `☐` slice (Sprint 0 first), marks it `◐`.
3. Writes tests TDD-style to **≥92% line+branch** on that slice's modules **and ≥92% on the diff's
   changed lines**, covering the edge-case checklist.
4. A reviewer subagent gates on `REVIEWER.md` (behavior over implementation, real edge cases).
5. Opens a PR and runs CI. **Merges to main (squash)** when ALL hold: diff is tests/config only,
   CI green, reviewer PASS, clean rebase on main (conflicts resolved by *keeping both* tests).
   Otherwise leaves the PR open and marks the slice `⚠ blocked`. One phase per run.

## One-time setup
Follow `SETUP-ROUTINE.md`. In short:
- **Web Routine (recommended):** create a routine at https://claude.ai/code/routines (or `/schedule
  every 3 hours …`) on `isopen-io/meeshy`, paste the prompt, pick an environment whose network
  policy allows package installs. Runs unattended in the cloud; merges via the GitHub integration.
- **Local cron:** `claude auth login` once, then schedule `run-routine.sh` every 3h (cron/launchd/
  systemd).
- Either way, the **first phase executes Sprint 0** (restores CI enforcement). Make sure the repo's
  branch protection lets the agent merge a *green* PR — it never force-merges past red CI.

## Order of work
- **Sprint 0 first** — restore CI enforcement so the tests actually gate (remove `continue-on-error`,
  re-enable the disabled Python job, add ratcheting thresholds, un-skip dark tests).
- **Then features**, P0 → P2, across gateway / translator / web / iOS / android / shared+SDK.

## Guardrails
Merges to main only via a green, reviewed, **tests-only** per-phase PR — never past red CI, never a
diff that touches production logic (those get left open for a human). Never lowers a coverage floor
or weakens a test. One phase per run, main always left green. Blocked slices (failed preconditions
or 3 failed reviews) are marked `⚠ blocked` and skipped so the routine keeps moving.
