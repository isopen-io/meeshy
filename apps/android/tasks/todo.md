# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `story-composer-slide-deck` ✅
Makes the multi-slide model **real in the composer**: wires the pure `StorySlideDeck` reducer into the
ViewModel + a `SlideStrip` mini-preview, with lossless multi-slide publish.

- [x] `StorySlideDeck` pure additions: `hasText`, `publishableSlides`, `isWithinTextLimit(max)`,
      `updateSelectedText(text)` (rewrites only the selected slide).
- [x] `StoryComposerUiState.deck: StorySlideDeck`; `canPublish` gates on the **whole deck** (off-screen
      over-long slide blocks publish).
- [x] VM mints slide ids (`UUID`, impure edge); `onTextChange` writes the selected slide; new intents
      `onAddSlide`/`onDuplicateSelectedSlide`/`onRemoveSlide`/`onMoveSlide`/`onSelectSlide` via private
      `applyDeck{}` re-syncing the editor (`draft.text == selectedSlide.text`).
- [x] `publishRequests`: **one story per non-blank slide** in order; first carries media + `dependsOn`;
      media-only deck still emits one media-bearing story; single-slide byte-identical to before.
- [x] `StoryComposerScreen` `SlideStrip` (selectable numbered chips, Duplicate/Remove on selected,
      "+" add capped at 10); +4 strings × 4 locales.
- [x] TDD: `StorySlideDeckTest` +12 (34/34), `StoryComposerViewModelTest` +18 (57/57). No floor lowered,
      no test weakened.
- [x] `./apps/android/meeshy.sh check` green (assembleDebug + all unit tests).

## Next loop (see PROGRESS.md "Next")
1. Slide drag-reorder gesture (bind `onMoveSlide` to a Compose drag handle).
2. 9:16 canvas; then per-slide media; then advance to the **Calls** area.
