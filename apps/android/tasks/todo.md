# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `outbox-multi-dependency` ✅
Generalises the outbox `dependsOn` gate from **one** prerequisite to a **set**, so a dependent
(a media story queued offline) can wait on several uploads at once. The provably-correct SDK half
of "multi-pending offline uploads"; the composer multi-pending **UX** is the next slice.

- [x] `OutboxDependencyKey` (`:sdk-core`, pure building block): `encode(Collection)→String?` /
      `decode(String?)→List` round-trip a *set* of `cmid`s through the single `dependsOn` column
      (wrapped-delimited `"|a|b|"`, bare-value tolerant); `likePattern(cmid)` builds an escaped
      membership `LIKE` pattern (`_` escaped — `cmid`s carry `_`).
- [x] `OutboxDependencies.verdictAll(states)`: any `EXHAUSTED`→`FAILED` (dominates), else any
      `PENDING`/`INFLIGHT`→`BLOCKED`, else `SATISFIED`; empty→`SATISFIED`.
- [x] `OutboxMutation.dependsOn: Set<String>` (was `String?`); `toEntity` encodes it. No schema change.
- [x] `OutboxDrainer` decodes + gates via `verdictAll`; `OutboxDao.findDependents` is a
      `LIKE … ESCAPE '\'` membership query; `OutboxRepository.rewriteDependents` builds the pattern.
- [x] `StoryRepository.enqueuePublish(request, dependsOn: List<String>)`; composer adopts the list
      contract (`listOfNotNull(pendingUpload?.cmid)`), single-pending UI unchanged.
- [x] TDD: +`OutboxDependencyKeyTest` (14), +`OutboxDependenciesTest` verdictAll (5),
      +`OutboxDrainerTest` multi-dep (4), +`OutboxRepositoryTest` membership (2),
      +`StoryRepositoryTest` (1) + adapted assertion, +`StoryComposerViewModelTest` (1) + adapted
      capture. No test weakened.
- [x] `./apps/android/meeshy.sh check` green (assembleDebug + all unit tests).

## Next loop (see PROGRESS.md "Next")
1. Multi-pending offline uploads — **composer UX** (SDK primitive ✅; relax single-pending guard,
   `pendingUploads: List`, `publish(dependsOn = all cmids)`, per-tile cancel).
2. Multi-slide canvas (9:16 add/remove/reorder).
3. Then advance to the **Calls** area.
