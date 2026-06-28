# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `outbox-flush-retry-on-blocked` ✅
Closes the cross-pass gating gap: the `OutboxFlushWorker` now reschedules on a **blocked
dependency**, not only a transient failure, so a held publish/message lane is auto-retried
once its prerequisite upload lands in a later pass.

- [x] `OutboxFlushPlan.outcome(reports)` (`:sdk-core`, stateless pure decision) + `FlushOutcome`
      enum: `RETRY` when any `DrainReport` stopped on a transient failure **or** a blocked
      dependency, else `SUCCESS`. Terminating: `EXHAUSTED` prerequisite → verdict `FAILED`, never
      `BLOCKED`, so a retried pass eventually delivers or cascade-exhausts the dependent.
- [x] `OutboxFlushWorker.doWork`: collect each lane's `DrainReport`, delegate the WorkManager
      outcome to `OutboxFlushPlan.outcome` (thin glue; the decision is the covered pure function).
- [x] TDD: +9 `OutboxFlushPlanTest` (empty / single clean / transient-only / blocked-only / both /
      many clean / one transient among clean / one blocked among clean / counts-only never retry)
      — both `||` arms + `.any{}` true/false (`tests=9 failures=0`).
- [x] `./apps/android/meeshy.sh check` green (assembleDebug + all unit tests).

## Next loop (see PROGRESS.md "Next")
1. Multi-pending offline uploads (multi-`dependsOn` / barrier).
2. Multi-slide canvas (9:16 add/remove/reorder).
3. Then advance to the **Calls** area.
