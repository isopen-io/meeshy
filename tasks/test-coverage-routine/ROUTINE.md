# Test Coverage Routine — Agent Playbook

You are an autonomous TDD agent. You run on a 3-hour schedule. Each run you complete **one
slice** of test coverage, prove it, record it, and leave the repo green. The next run resumes
from `PROGRESS.md`. You are not expected to finish everything in one run — steady, verified
increments over ~1–2 weeks are the goal.

**Non-negotiables:** TDD (RED→GREEN→REFACTOR), test behavior not implementation, every slice
passes the `REVIEWER.md` gate before commit, repo stays green, one slice per run.

---

## 0. Pre-flight

Each run = one **phase** on its own short-lived branch off the latest `main`. Phases merge to
`main` independently, so branches never pile up and conflicts stay small.

```bash
git fetch origin main
git checkout -B claude/coverage/<slice-id> origin/main   # fresh branch off latest main per phase
```
- `<slice-id>` is a slug of the slice, e.g. `sprint0-2-ci-gate` or `p0-auth-gateway`.
- Install deps for the app you'll touch (`pnpm install`; translator `uv sync --extra cpu --extra dev`;
  android uses the Gradle wrapper; iOS uses `./apps/ios/meeshy.sh`).
- Read `PROGRESS.md` end-to-end. Read the last 3 entries of `RUNLOG.md` to see what just landed
  and avoid repeating a slice that's mid-flight.
- **In-flight check (replaces any CI concurrency guard):** list open `claude/coverage/*` PRs. If one
  exists, you are likely overlapping a previous run — *finish that phase* (rebase, get it green,
  merge) instead of starting a new slice. Only start a new slice when no coverage PR is open.

## 1. Select the slice (deterministic)

1. If any **Sprint 0** item is `☐`, take the lowest-numbered one. Sprint 0 comes before features.
2. Otherwise take the highest-priority `☐` **(feature × app)** cell in the matrix, scanning
   top-to-bottom, left-to-right. P0 before P1 before P2.
3. Mark it `◐` in `PROGRESS.md` on your phase branch. Runs are ≥1h apart and the pre-flight
   in-flight check (open `claude/coverage/*` PR) keeps two phases from racing; each new phase starts
   from the latest main where the previous phase's `☑` has already merged. On merge, the `◐`→`☑`
   flip lands on main.
4. Resolve the cell to concrete files: intersect the feature's module targets (`PROGRESS.md`
   §Per-feature module targets) with the app's manifest (`manifests/<app>.md`) domain groups, to
   get the **exhaustive file list** for the slice. **Verify the files still exist** (the codebase
   moves); if a path is stale, find the current equivalent and update both the targets list and the
   manifest. Cover **every** file in that intersection — no skipping `[~]` files (they're often
   shallow; verify they're truly 92%).

## 2. Scope the slice

A slice = "92% line + branch coverage on this feature's modules in this app, with edge cases."
If the feature's module set is large (e.g. the 21KB `orchestrator.service.ts`), it's fine to
split across multiple runs — cover a coherent sub-unit fully rather than smearing thinly. Record
the sub-split in `PROGRESS.md` so the next run continues the same cell.

## 3. TDD loop (per module in the slice)

For each behavior the module exposes through its **public API**:
1. **RED** — write a failing test that asserts the observable behavior.
2. **GREEN** — if production code is missing/broken, write the minimum to pass. (Usually the code
   exists; you're adding the missing test.) Do **not** rewrite working production code to chase a
   number — minimal, justified refactors for testability only, and note them in the commit.
3. **REFACTOR** — only if it adds value.

**Edge-case checklist (must be covered, not just happy path):**
- null / undefined / empty / whitespace inputs
- boundary values (0, 1, max, off-by-one, overflow — e.g. queue at 50→51, LRU at 500→501)
- error paths: thrown errors, rejected promises, timeouts, malformed payloads, decode failures
- concurrency / races where relevant (parallel sends, dedup, reconnect-with-pending-queue)
- the **Prisme rule**: when no translation matches the preferred language, the original is shown
  (`nil`/`null` returned) — never `translations.first` as a fallback
- platform failure modes: Web Crypto unavailable, IndexedDB quota, ZMQ frame missing, offline

**Conventions to follow (from CLAUDE.md):**
- Factory functions for test data; no `let` + `beforeEach` mutation.
- Use real shared schemas/types (`@meeshy/shared`), never redefine them.
- Mock at boundaries (network, DB, sockets) — tests must be deterministic, no real I/O.
- **iOS:** every Service under test needs a protocol (`{Name}Providing`) + `Mock{Name}`; ViewModels
  injected via init with `.shared` defaults. XCTest (Swift Testing allowed for pure SDK models).
- **translator:** mark GPU/model-download tests `@pytest.mark.gpu` / `requires_model` and skip; test
  the **pure logic** (routing, framing, queueing, segmentation) which needs no GPU.
- **android:** JUnit + the module's existing test source set (`src/test`); MockK/Turbine as the
  module already uses.

## 4. Run it green + measure coverage

Run only the relevant suite (fast feedback), then confirm 92% on the **targeted files**:

| App | Test + coverage command |
|-----|-------------------------|
| web | `pnpm --filter web exec jest <paths> --coverage --collectCoverageFrom='<targeted globs>'` |
| gateway | `pnpm --filter gateway exec jest --config jest.config.json <paths> --coverage` |
| translator | `cd services/translator && uv run pytest <paths> --cov=<targeted module> --cov-report=term-missing` |
| iOS | `./apps/ios/meeshy.sh test` (must pass before any commit) |
| android | `cd apps/android && ./gradlew :<module>:test` |
| shared | `pnpm --filter @meeshy/shared exec jest <paths> --coverage` |

**Coverage rules:**
- Target is **≥92% line + branch on the slice's targeted files**, shown via `--cov-report=term-missing`
  / jest's uncovered-line report.
- Additionally, **≥92% coverage on the diff's changed lines** (diff coverage). This is the gate that
  actually prevents regressions — any line you add/touch must be exercised.
- If reaching 92% would require testing genuinely meaningless code (unreachable defensive branches,
  generated code), do **not** write a tautological test. Instead add a *justified* ignore
  (`/* istanbul ignore next -- <reason> */` or coverage `exclude_lines`) and note it for the reviewer.
  The reviewer decides if the justification holds.

## 5. Reviewer gate (mandatory)

Spawn a reviewer subagent and hand it the diff + `REVIEWER.md`. It returns PASS or FAIL+changes.
- On **FAIL**: apply the required changes and re-review. Loop until PASS or you hit the run's turn
  budget. If you run out of budget mid-slice, leave the cell `◐`, commit WIP behind a clearly-marked
  WIP commit only if green, and record exactly where you stopped in `RUNLOG.md`.
- On **PASS**: proceed to commit.

If `/code-review` is available as a skill, you may use it for the review; otherwise launch a
general-purpose subagent with the rubric.

## 6. Commit, record, open PR

1. Update `PROGRESS.md`: flip the cell `◐`→`☑` (or note sub-progress), update the baselines table,
   and **ratchet** the relevant `coverageThreshold` up to the new measured floor (Sprint 0 wired the
   thresholds; never lower them). Also tick `[x]` for each completed file in `manifests/<app>.md`.
2. Append a `RUNLOG.md` entry (template below).
3. Commit with a conventional message:
   `test(<app>): cover <feature> — <modules> to ≥92% line+branch`
   End the body with the session URL line per repo convention.
4. Push the phase branch: `git push -u origin claude/coverage/<slice-id>` (retry on network error:
   2s/4s/8s/16s backoff).
5. Open a PR from the phase branch into `main` (one PR per phase) via the `gh` CLI on the runner or
   the GitHub MCP tools. Title = the commit subject; body = the slice, files covered, before→after
   coverage, reviewer verdict.

## 7. Merge to main (mandatory end-of-phase) — with conflict management

A phase is not done until it is **merged to main**. Merge **only when ALL four hold**:
1. **Diff is tests + test/CI config only** — no production logic changed. (Minimal, justified
   testability refactors are the one exception and must be flagged for a human — if present, do
   NOT auto-merge; leave the PR open.)
2. **Full CI is green** on the PR.
3. **Reviewer verdict = PASS** (§5).
4. **Clean rebase on the latest main.** Before merging: `git fetch origin main && git rebase
   origin/main`. On conflicts — they'll almost always be in `PROGRESS.md`/`manifests/`/test files —
   **keep BOTH sides** (union the test files; merge the tracker ticks), re-run the touched suite,
   and re-confirm coverage. Never resolve a conflict by dropping tests or assertions.

Then squash-merge (`gh pr merge --squash --delete-branch`) and delete the branch.

**If any precondition can't be met this run:** leave the PR open, mark the slice `⚠ blocked` in
`PROGRESS.md` (on the branch / in the PR) with the precise reason, and stop. Never force a merge
past red CI or over production-logic changes.

## 8. Leave it clean

- `main` must be green after the merge (you didn't break other suites).
- Exactly one phase advanced + merged. Stop. The next scheduled run branches fresh off the new main.

---

## Guardrails

- **Never** weaken a test, delete an assertion, or lower a coverage floor to make CI pass. Fix the
  cause.
- **Never** merge past red CI, and **never** merge a diff that touches production logic — open the
  PR and stop for a human instead. Direct commits to `main` are forbidden; reach main only via the
  squash-merge of a reviewed, green per-phase PR.
- **Never** commit secrets or real credentials in fixtures.
- Don't touch unrelated production code. If a module is untestable without a refactor, do the
  smallest refactor, justify it in the commit, and flag it to the reviewer.
- If the same slice fails the reviewer 3 runs in a row, mark it `⚠ blocked` in `PROGRESS.md` with the
  reason and skip to the next slice so the routine keeps moving.
- Honour `tasks/lessons.md` — read it at pre-flight; append a lesson after any reviewer correction.

## RUNLOG.md entry template

```
## <UTC timestamp> — <slice id, e.g. P0 Auth × gateway>
- Targeted: <files>
- Result: <☑ done | ◐ partial | ⚠ blocked>
- Coverage: <module> line X%→≥92%, branch Y%→≥92%
- Tests added: <n> (<test file paths>)
- Reviewer: PASS (rounds: <n>) | FAIL→fixed
- Notes / where the next run resumes:
- Commit: <sha>
```
