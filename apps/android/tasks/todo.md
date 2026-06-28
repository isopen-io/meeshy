# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `story-composer-multi-pending` ✅
Lifts the composer's offline staging from **one** pending upload to a **list**, completing the durable
offline upload→publish chain end-to-end from the UI (the SDK multi-dependency primitive landed last loop).

- [x] `StoryComposerUiState.pendingUpload?` → `pendingUploads: List<PendingMediaUpload>`; `draftMediaIds`
      appends every pending cmid after the uploaded ids.
- [x] `onUploadFailed` drops the single-pending guard: any transient error durably queues **every**
      accepted item (already capped to free slots); permanent (4xx) still surfaces + stages nothing.
- [x] `queueDurably(items)` enqueues + stages one-at-a-time so a mid-batch failure keeps staged items.
- [x] `onRemoveMedia` removes one pending from the list + cancels **only that** durable row.
- [x] `publish(dependsOn = pendingUploads.map { cmid })`; `MediaPreviewRow` renders N "Offline" tiles.
- [x] TDD: `StoryComposerViewModelTest` — 3 single-pending tests adapted to the list, 2 behaviours
      flipped (reject→append, batch-error→stage-each), +5 new (batch staging, second-pick append,
      offline batch truncated to free slots, publish gates on all ids, remove-one keeps rest + cancels
      only its row, first staged survives mid-batch failure). No test weakened, no floor lowered.
- [x] `./apps/android/meeshy.sh check` green (assembleDebug + all unit tests).

## Next loop (see PROGRESS.md "Next")
1. Multi-slide canvas (9:16 add/remove/reorder slides).
2. Then advance to the **Calls** area.
