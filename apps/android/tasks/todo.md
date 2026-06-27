# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `outbox-produced-id-writeback` ✅
Second half of the durable upload→publish chain: a prerequisite's
`SendResult.SuccessWithId(realId)` grafts that id into every still-queued dependent
publish's payload before its gate opens.

- [x] `PublishMediaWriteBack.graft` (pure: decode→swap placeholder→`distinct`→re-encode;
      inert `null` on undecodable/no-media/absent/identity).
- [x] `SendResult.SuccessWithId(producedId)` + `OutboxDrainer` graft-before-delete
      (injected `graftProducedId`, no-op default to keep the package generic).
- [x] `OutboxRepository.rewriteDependents` (PENDING dependents only) + `OutboxDao`
      `findDependents`/`updatePayload` (no schema change).
- [x] `OutboxFlushWorker` wires `graftProducedId = PublishMediaWriteBack::graft`.
- [x] TDD: +10 `PublishMediaWriteBackTest`, +3 `OutboxDrainerTest`,
      +4 `OutboxRepositoryTest` — every branch/edge covered.
- [x] `./apps/android/meeshy.sh check` green (assemble + all unit tests, 836 tasks).

## Next loop (see PROGRESS.md "Next")
1. Durable media upload row (the producer half): `UPLOAD_MEDIA` kind + durable
   file-bytes store + `MEDIA`-lane sender returning `SuccessWithId` + composer wiring.
2. `multi-slide canvas` (9:16 add/remove/reorder).
3. Then advance to the **Calls** area.
