# Autonomous Test-Coverage Routine

A self-perpetuating routine that drives the whole monorepo toward 92% line+branch coverage,
one verified feature-slice at a time, on a 3-hour cadence.

## Why it's built this way
Claude Code sessions run in ephemeral containers — a single session can't sit and fire every 3
hours for ~1–2 weeks. So the durable state lives in git, and a **GitHub Actions cron** launches a
fresh agent each cycle that resumes from that state.

## The pieces
| File | Role |
|------|------|
| `PROGRESS.md` | **Source of truth.** Feature × app matrix, Sprint 0 CI fixes, per-feature module targets, baselines. Each run reads it to pick the next slice and writes it back. |
| `ROUTINE.md` | The agent playbook: pre-flight → select slice → TDD loop → reviewer gate → commit → record. |
| `REVIEWER.md` | The quality rubric the reviewer subagent enforces. Coverage is necessary, not sufficient — kills tautological tests. |
| `RUNLOG.md` | Append-only history of what each run did and where the next resumes. |
| `../../.github/workflows/test-coverage-routine.yml` | The 3-hour cron. Each run branches off main, does one phase, opens a PR, and merges it to main when green + reviewed + tests-only. |

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

## One-time setup (maintainer)
1. Add a repo secret: **`ANTHROPIC_API_KEY`** (or `CLAUDE_CODE_OAUTH_TOKEN` and uncomment that line
   in the workflow).
2. **Merge this scaffolding to `main` first** — scheduled workflows only fire from the default
   branch, so cron won't run until `test-coverage-routine.yml` is on main.
3. Enable **Settings → Actions → General → "Allow GitHub Actions to create and approve pull
   requests"**, and set branch protection on main so the bot can merge a green PR (required checks
   are fine — it never force-merges past red CI).
4. Kick the first run from **Actions → Test Coverage Routine → Run workflow** to verify end-to-end.
   The first phase executes **Sprint 0** (restores CI enforcement).

## Order of work
- **Sprint 0 first** — restore CI enforcement so the tests actually gate (remove `continue-on-error`,
  re-enable the disabled Python job, add ratcheting thresholds, un-skip dark tests).
- **Then features**, P0 → P2, across gateway / translator / web / iOS / android / shared+SDK.

## Guardrails
Merges to main only via a green, reviewed, **tests-only** per-phase PR — never past red CI, never a
diff that touches production logic (those get left open for a human). Never lowers a coverage floor
or weakens a test. One phase per run, main always left green. Blocked slices (failed preconditions
or 3 failed reviews) are marked `⚠ blocked` and skipped so the routine keeps moving.
