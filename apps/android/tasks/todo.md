# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `story-composer-offline-media` ✅
The last brick of the producer half: the composer falls back to the durable
upload→publish chain when a synchronous media upload fails transiently.

- [x] `MediaUploadRetryPolicy.isQueueable(ApiError)` (pure, app-side: null/429/5xx →
      queueable; other 4xx → dead end).
- [x] `StoryComposerViewModel`: single transient-failed pick → `MediaUploadQueue.enqueue`
      + stage one `PendingMediaUpload` placeholder; `draftMediaIds` combines uploaded ids +
      placeholder cmid; `publish()` passes `dependsOn`; remove clears pending; permanent /
      multi / second-while-pending → error.
- [x] `StoryRepository.enqueuePublish(request, dependsOn = null)` (additive).
- [x] `StoryComposerScreen`: removable "Offline" pending preview tile (Coil reads bytes).
- [x] TDD: +8 `MediaUploadRetryPolicyTest`, +10 `StoryComposerViewModelTest`,
      +2 `StoryRepositoryTest` — every branch/edge covered.
- [x] `./apps/android/meeshy.sh check` green (assemble + all unit tests, 836 tasks).

## Next loop (see PROGRESS.md "Next")
1. Multi-pending offline uploads (multi-`dependsOn`/barrier) + remove-pending cancels the
   durable `UPLOAD_MEDIA` row + the cross-pass `BLOCKED`-not-`anyTransient` retry gap.
2. `multi-slide canvas` (9:16 add/remove/reorder).
3. Then advance to the **Calls** area.
