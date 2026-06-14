# Test Coverage Routine — Agent Playbook

You are an autonomous TDD agent. You run on a 5-hour schedule. Each run you complete **one
slice** of test coverage, prove it, record it, and leave the repo green. The next run resumes
from `PROGRESS.md`. You are not expected to finish everything in one run — steady, verified
increments over ~1–2 weeks are the goal.

**Non-negotiables:** TDD (RED→GREEN→REFACTOR), test behavior not implementation, every slice
passes the `REVIEWER.md` gate before commit, repo stays green, one slice per run.

---

## 0. Pre-flight

```bash
git fetch origin
git checkout claude/test-coverage-analysis-8s1io1 || git checkout -b claude/test-coverage-analysis-8s1io1 origin/main
git rebase origin/main          # stay current with main; resolve conflicts conservatively
```
- Install deps for the app you'll touch (`pnpm install`; translator `uv sync --extra cpu --extra dev`;
  android uses the Gradle wrapper; iOS uses `./apps/ios/meeshy.sh`).
- Read `PROGRESS.md` end-to-end. Read the last 3 entries of `RUNLOG.md` to see what just happened
  and avoid repeating a slice that's mid-flight.

## 1. Select the slice (deterministic)

1. If any **Sprint 0** item is `☐`, take the lowest-numbered one. Sprint 0 comes before features.
2. Otherwise take the highest-priority `☐` **(feature × app)** cell in the matrix, scanning
   top-to-bottom, left-to-right. P0 before P1 before P2.
3. Mark it `◐` in `PROGRESS.md`, commit that marker immediately (`chore(coverage): claim <slice>`),
   and push — so a concurrent run won't pick the same slice. Use the workflow concurrency group
   too, but the marker is the durable lock.
4. Resolve the cell to concrete files: intersect the feature's module targets (`PROGRESS.md`
   §Per-feature module targets) with the app's manifest (`manifests/<app>.md`) domain groups, to
   get the **exhaustive file list** for the slice. **Verify the files still exist** (the codebase
   moves); if a path is stale, find the current equivalent and update both the targets list and the
   manifest. Cover **every** file in that intersection — no skipping `[~]` files (they're often
   shallow; verify they're truly 100%).

## 2. Scope the slice

A slice = "100% line + branch coverage on this feature's modules in this app, with edge cases."
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

Run only the relevant suite (fast feedback), then confirm 100% on the **targeted files**:

| App | Test + coverage command |
|-----|-------------------------|
| web | `pnpm --filter web exec jest <paths> --coverage --collectCoverageFrom='<targeted globs>'` |
| gateway | `pnpm --filter gateway exec jest --config jest.config.json <paths> --coverage` |
| translator | `cd services/translator && uv run pytest <paths> --cov=<targeted module> --cov-report=term-missing` |
| iOS | `./apps/ios/meeshy.sh test` (must pass before any commit) |
| android | `cd apps/android && ./gradlew :<module>:test` |
| shared | `pnpm --filter @meeshy/shared exec jest <paths> --coverage` |

**Coverage rules:**
- Target is **100% line + branch on the slice's targeted files**, shown via `--cov-report=term-missing`
  / jest's uncovered-line report.
- If reaching 100% would require testing genuinely meaningless code (unreachable defensive branches,
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

## 6. Commit, record, push

1. Update `PROGRESS.md`: flip the cell `◐`→`☑` (or note sub-progress), update the baselines table,
   and **ratchet** the relevant `coverageThreshold` up to the new measured floor (Sprint 0 wired the
   thresholds; never lower them). Also tick `[x]` for each completed file in `manifests/<app>.md`.
2. Append a `RUNLOG.md` entry (template below).
3. Commit with a conventional message:
   `test(<app>): cover <feature> — <modules> to 100% line+branch`
   End the body with the session URL line per repo convention.
4. Push with `git push -u origin claude/test-coverage-analysis-8s1io1` (retry on network error:
   2s/4s/8s/16s backoff).
5. **Maintain a single PR** for this branch (create it on the first run if absent; do not open a new
   one each run). Keep its body's checklist in sync with `PROGRESS.md`. Do **not** merge — a human
   reviews and merges.

## 7. Leave it clean

- Repo must be green (the suite you touched passes; you didn't break others).
- Exactly one slice advanced. Stop. The next scheduled run resumes from `PROGRESS.md`.

---

## Guardrails

- **Never** weaken a test, delete an assertion, or lower a coverage floor to make CI pass. Fix the
  cause.
- **Never** push to `main` or any branch other than `claude/test-coverage-analysis-8s1io1`.
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
- Coverage: <module> line X%→100%, branch Y%→100%
- Tests added: <n> (<test file paths>)
- Reviewer: PASS (rounds: <n>) | FAIL→fixed
- Notes / where the next run resumes:
- Commit: <sha>
```
