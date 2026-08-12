# TDD & coverage rubric

**Goal:** 90% of branches **and** instructions covered on the logic a slice adds.

## What must be covered (hard target ≥ 90% branch + instruction)
- Pure functions and pure state machines (`:sdk-core`, and pure helpers/reducers
  in `:feature:*`, e.g. `StoryPlayback`, `StoryGrouping`, builders/resolvers).
- `ViewModel` transition logic and `UiState` derivation (test via the public
  API: drive intents, assert `state`/`StateFlow` emissions with Turbine/MockK).
- Repository mapping and error classification.

## What is exempt
- `@Composable` UI functions and the thin glue inside them (`LaunchedEffect`
  wiring, gesture lambdas, layout). These need instrumentation/Robolectric UI
  tests and are out of scope for the JVM gate. **Push all testable decisions out
  of the Composable into a pure function or the ViewModel**, then cover that.
- Generated code (Hilt, KSP), DI modules, `data class` boilerplate.

## Method
1. **Red first.** Write the failing behavioural test before the production code.
2. **Green minimal.** Smallest code that passes.
3. **Branch sweep.** For each `when`/`if`, ensure a test exercises every arm,
   including the inert/no-op arm and the boundary arm.
4. **Refactor** only if it adds value and keeps tests green.

## No-coverage-gate caveat
This module has **no Jacoco/Kover gate wired** yet. Coverage is therefore a
**discipline, not an automated check** — do not treat its absence as licence to
skip tests. Wiring Kover with a per-module 90% verification rule is a tracked
follow-up (`feature-parity` infra). Until then, enumerate the branches in the
PR description and confirm each is hit.

## Anti-patterns (auto-FAIL)
- Tautological assertions; asserting a literal the test just set.
- Testing private helpers via reflection instead of public behaviour.
- Deleting/relaxing an assertion to make a flaky test pass.
- Asserting on a mock's own canned return rather than the code's transformation.
