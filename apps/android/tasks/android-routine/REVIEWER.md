# Reviewer rubric — mandatory gate before merge

Run this against the slice diff (`git diff main...HEAD -- apps/android`). The
slice may only merge when every section is **PASS**. Score honestly; a single
FAIL blocks the merge and the slice is marked ⚠ blocked in `PROGRESS.md`.

## 1. Scope & safety
- [ ] Diff is **`apps/android` only** — no web/ios/gateway/shared/translator code.
- [ ] No production logic outside `apps/android`. Docs under
      `apps/android/tasks/` are fine.
- [ ] No secrets, no `local.properties`, no committed build outputs.
- [ ] Branch is `claude/apps/android/<slice-id>`, rebased clean on `main`.

## 2. Tests (TDD)
- [ ] Tests were written **red → green** and assert **behaviour through the
      public API**, not implementation details.
- [ ] **No tautological tests** (no `assertThat(x).isEqualTo(x)`, no asserting a
      constant the test itself set with no logic under test).
- [ ] No coverage floor lowered; no existing test weakened/deleted to pass.
- [ ] Pure logic has near-total branch coverage (see `TDD-COVERAGE.md`).

## 3. Edge-case checklist (apply the relevant ones)
- [ ] Empty / single-element / boundary collections.
- [ ] Null / absent identifiers (unknown user id, missing arg).
- [ ] First/last position transitions (no off-by-one; no roll past the ends).
- [ ] Idempotent / inert states (already-dismissed, no-op transitions).
- [ ] Failure paths (network failure → graceful state, never a crash).
- [ ] Concurrency: `viewModelScope` work is cancellation-safe (`CancellationException`
      rethrown), no unguarded `emit()` of async results.

## 4. Architecture & coherence
- [ ] **SDK purity** respected: stateless building blocks in `:sdk-core`/`:sdk-ui`;
      product orchestration in `:feature:*`/`:app`.
- [ ] **Single source of truth**: language resolution via `LanguageResolver`;
      colours via `DynamicColorGenerator`/`accentColor`; no re-implementation.
- [ ] **Instant-app**: cache-first where data exists; skeleton only on cold empty;
      no blocking spinner when cached data is available.
- [ ] **UDF**: `ViewModel` + immutable `StateFlow<UiState>`; transitions pure.
- [ ] **Colour / navigation / UX coherence**: accent-coherent visuals, natural
      gestures, no dead-end screens, dismissal returns to a coherent place.
- [ ] Kotlin style: `explicitApi()` honoured in SDK modules; immutable data;
      early returns over nested branching; no needless mutation.

## 5. Verification evidence
- [ ] `./apps/android/meeshy.sh check` is green in this run (paste the result in
      the PR / run log).
- [ ] New test count and what they cover is recorded in `PROGRESS.md`.

## Verdict
`PASS` only if all boxes above are checked. Record the verdict + one-line
justification in `PROGRESS.md`'s run log.
