# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `story-viewer-swipe-gestures` ✅
Swipe navigation wired into the story viewer, parity with iOS `StoryViewerView`.

- [x] `StorySwipeResolver` pure resolver (`:feature:stories`): drag → `NextGroup`
      / `PreviousGroup` / `Dismiss` / `None` on the dominant axis; downward-only
      dismiss; sub-threshold = `None`; thresholds as params (testable).
- [x] `StoryPlayback.dismissed()` pure transition (preserve position, idempotent).
- [x] `StoryViewerViewModel.onSwipe(action)` dispatch into the engine.
- [x] `StoryViewerScreen` `detectDragGestures` → `onSwipe(resolve(...))` wiring.
- [x] TDD: +12 `StorySwipeResolverTest`, +2 `StoryPlaybackTest`, +4
      `StoryViewerViewModelTest` — every branch/arm covered.
- [x] `./apps/android/meeshy.sh check` green.

## Next loop (see PROGRESS.md "Next")
1. `story-reaction-socket-delta` (realtime `story:reacted/unreacted` → `applyDelta`).
2. `story-tray-swr` (cache-first tray).
3. `story-composer` (publish via outbox/WorkManager).
