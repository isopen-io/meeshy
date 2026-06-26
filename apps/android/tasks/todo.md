# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `story-composer` ✅
Text story composer + publish flow via the shared durable outbox/WorkManager chain.

- [x] `StoryComposerDraft` pure publish-gate + `toCreateStoryRequest` mapping
      (`StoryVisibility.wire`, `MAX_CHARS=5000`, immutable copies).
- [x] `StoryRepository.enqueuePublish` (`OutboxKind.PUBLISH_STORY` on the `story`
      lane) + `OutboxFlushWorker` `PostApi.createStory` sender.
- [x] `StoryComposerViewModel` optimistic publish (Prisme language, re-entrancy
      guard, one-shot `published`, failure keeps draft) + `StoryComposerScreen`.
- [x] `:app` route `story_composer` wired to the tray's `onAddStory`.
- [x] TDD: +13 `StoryComposerDraftTest`, +8 `StoryComposerViewModelTest`,
      +3 `StoryRepositoryTest` — every branch/edge covered.
- [x] `./apps/android/meeshy.sh check` green (assemble + all unit tests, 836 tasks).

## Next loop (see PROGRESS.md "Next")
1. `story-composer-optimistic-tray` (inject `pending_*` ring + reconcile on outcome/socket).
2. `story-composer-media` (single image/video slide → `mediaIds`).
3. Then advance to the **Calls** area.
