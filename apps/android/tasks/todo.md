# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `story-canvas-snap-guides` ✅
Adds **magnetic snap-to-guide + out-of-bounds (safe-zone) warning** to on-canvas element dragging — a
dragged text element locks each axis onto the nearest alignment guide and flashes a warning border when
it drifts into the edge margin.

- [x] Pure `StorySnapResolver.resolve(x, y, …)` → `SnapResult(x, y, verticalGuide, horizontalGuide,
      withinSafeZone)`: per-axis nearest-guide snap within `SNAP_THRESHOLD`; non-finite → canvas centre;
      out-of-canvas clamp; `withinSafeZone` against `SAFE_ZONE_INSET`. Single source of truth.
- [x] Snap-aware `onTextElementMoved` (reuses `moveTextElement` via the snap-adjusted delta — no new
      reducer); transient `StoryComposerUiState.snapFeedback`; `onTextElementDragEnd()` clears on lift.
- [x] Canvas glue: accent guide-line `Canvas` overlay + `error` warning border; non-consuming `Final`-pass
      `awaitEachGesture` drag-end detector beside the transform detector (JVM-exempt).
- [x] TDD +25: `StorySnapResolverTest` +18, `StoryComposerViewModelTest` +7. No floor lowered, no test
      weakened. No new strings.
- [x] `./apps/android/meeshy.sh check` green (assembleDebug + all unit tests; stories 494 green). Diff =
      `apps/android` only.

## Next loop (see PROGRESS.md "Next")
1. Canvas toolbar/FAB (Contenu/Effets grouping add-text / add-media).
2. Then on to the **Calls** area (`feature-parity.md` §"Calls").
