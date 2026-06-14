# Autonomous Test-Coverage Routine

A self-perpetuating routine that drives the whole monorepo toward 100% line+branch coverage,
one verified feature-slice at a time, on a 5-hour cadence.

## Why it's built this way
Claude Code sessions run in ephemeral containers — a single session can't sit and fire every 5
hours for 1–2 weeks. So the durable state lives in git, and a **GitHub Actions cron** launches a
fresh agent each cycle that resumes from that state.

## The pieces
| File | Role |
|------|------|
| `PROGRESS.md` | **Source of truth.** Feature × app matrix, Sprint 0 CI fixes, per-feature module targets, baselines. Each run reads it to pick the next slice and writes it back. |
| `ROUTINE.md` | The agent playbook: pre-flight → select slice → TDD loop → reviewer gate → commit → record. |
| `REVIEWER.md` | The quality rubric the reviewer subagent enforces. Coverage is necessary, not sufficient — kills tautological tests. |
| `RUNLOG.md` | Append-only history of what each run did and where the next resumes. |
| `../../.github/workflows/test-coverage-routine.yml` | The 5-hour cron that runs an agent against `ROUTINE.md`. Maintains one PR; never merges. |

## How a cycle works
1. Cron (or manual dispatch) starts a fresh Claude agent on branch `claude/test-coverage-analysis-8s1io1`.
2. Agent pulls/rebases main, reads `PROGRESS.md`, claims the next `☐` slice (marks it `◐`).
3. Writes tests TDD-style to 100% line+branch on that slice's modules, covering edge cases.
4. A reviewer subagent gates on `REVIEWER.md` (behavior over implementation, real edge cases).
5. On PASS: ratchets coverage floors up, flips the cell `☑`, updates `RUNLOG.md`, commits, pushes,
   syncs the tracking PR. One slice per run.

## One-time setup (maintainer)
1. Add a repo secret: **`ANTHROPIC_API_KEY`** (or `CLAUDE_CODE_OAUTH_TOKEN` and uncomment that line
   in the workflow).
2. Confirm Actions can write contents + PRs (the workflow's `permissions` block) and that branch
   protection allows the bot to push to the working branch.
3. Kick the first run from the **Actions → Test Coverage Routine → Run workflow** button to verify
   end-to-end before relying on cron. The first run executes **Sprint 0** (restores CI enforcement).

## Order of work
- **Sprint 0 first** — restore CI enforcement so the tests actually gate (remove `continue-on-error`,
  re-enable the disabled Python job, add ratcheting thresholds, un-skip dark tests).
- **Then features**, P0 → P2, across gateway / translator / web / iOS / android / shared+SDK.

## Guardrails
Never merges. Never pushes to `main`. Never lowers a coverage floor or weakens a test. One slice per
run, repo always left green. Blocked slices (3 failed reviews) are marked and skipped so the routine
keeps moving.
