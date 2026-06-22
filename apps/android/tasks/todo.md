# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `story-viewer-playback` ✅
Cross-group story-viewer playback engine, parity with iOS `StoryViewerView`.

- [x] `StoryPlayback` pure engine (`:feature:stories`): `advance` / `back` /
      `jumpToNextGroup` / `jumpToPreviousGroup` / `startingAt`, all immutable.
- [x] TDD `StoryPlaybackTest` (22 cases — every `when` arm, boundaries, inert).
- [x] Rewire `StoryViewerViewModel` to load all groups and derive `UiState`
      (`groupIndex`, `isDismissed`) from the engine.
- [x] Rewire `StoryViewerScreen` auto-advance + tap to the engine, `isDismissed`
      → `onClose` (tap-advance now rolls across authors, no dead end).
- [x] `StoryViewerViewModelTest` (6 cases: load/advance/dismiss/back/markViewed/
      failure).
- [x] `./apps/android/meeshy.sh check` green.

## Next loop (see PROGRESS.md "Next")
1. `story-viewer-swipe-gestures` (horizontal = group jump, vertical = dismiss).
2. `story-reactions-strip`.
3. `story-tray-swr` (cache-first tray).
4. `story-composer` (publish via outbox/WorkManager).
