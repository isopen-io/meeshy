# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `story-canvas-transform` ✅
Makes the **9:16 canvas real** with pinch-zoom + drag-pan, persisted per slide.

- [x] Pure `StoryCanvasTransform` (scale clamped 1–4×, offset clamped to scaled-content overflow):
      `apply(pan,zoom,canvasW,canvasH)`, `clampedTo`, `isIdentity`, `clampScale`/`maxOffset`/`clampOffset`.
- [x] `StorySlide.transform` (per-slide identity, carried by `duplicate`); `StorySlideDeck.updateSelectedTransform`.
- [x] `StoryComposerViewModel.onCanvasTransform` + `UiState.selectedSlideTransform`.
- [x] `StoryComposerScreen.StoryCanvasSurface` — glue 9:16 `graphicsLayer` + `detectTransformGestures`;
      +1 string × 4 locales.
- [x] TDD: `StoryCanvasTransformTest` +16, `StorySlideDeckTest` +3 (→50), `StoryComposerViewModelTest`
      +3 (→70). No floor lowered, no test weakened.
- [x] `./apps/android/meeshy.sh check` green (assembleDebug + all unit tests).

## Next loop (see PROGRESS.md "Next")
1. Canvas toolbar/FAB (Contenu/Effets bottom band over the canvas).
2. On-canvas text elements (≤5/slide); then advance to the **Calls** area.
