# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `media-upload-cancel` ✅
Closes the orphan-leak gap from `story-composer-offline-media`: removing the offline
placeholder now also cancels the durable `UPLOAD_MEDIA` row + blob.

- [x] `MediaUploadQueue.cancel(cmid)` (`:sdk-core`, stateless): `OutboxRepository.discard` the
      row (drainer stops picking it up) then `MediaBlobStore.remove` the bytes; unknown cmid inert.
- [x] `StoryComposerViewModel.onRemoveMedia`: removing the pending placeholder fires a best-effort,
      cancellation-safe `cancelDurableUpload(cmid)`; UI clears optimistically; attachment removal
      never cancels.
- [x] TDD: +3 `MediaUploadQueueTest` (real Room), +4 `StoryComposerViewModelTest` — every branch /
      edge (pending-vs-attachment, unknown id, cancel-throws, cancellation-safety) covered.
- [x] `./apps/android/meeshy.sh test` + `build` green (37 story + 6 queue tests, assembleDebug).

## Next loop (see PROGRESS.md "Next")
1. Multi-pending offline uploads (multi-`dependsOn` / barrier) + the cross-pass
   `BLOCKED`-not-`anyTransient` retry gap.
2. Multi-slide canvas (9:16 add/remove/reorder).
3. Then advance to the **Calls** area.
