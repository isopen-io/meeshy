# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `story-text-elements` ✅
Makes **on-canvas text elements real** (≤5/slide): add, drag, edit, remove — and they publish.

- [x] Pure `StoryTextElement` (id/text/`StoryTextStyle`/hex colour/`StoryTextAlign`/normalised x,y):
      `normalised`/`nudged` (clamp in one place), `isPublishable`, `toTextObject(lang)` wire mapper.
- [x] `StorySlide.elements` (carried by `duplicate`); deck `addTextElementToSelected`/`removeTextElement`/
      `updateTextElement`/`moveTextElement` + caps (`MAX_TEXT_ELEMENTS_PER_SLIDE=5`, remaining/within/has).
- [x] `StoryComposerDraft.textElements` → serialised into `storyEffects.textObjects` (blanks dropped).
- [x] VM add/select/deselect/move/remove intents; `onTextChange` routes element-vs-caption
      (`editorText`/`isEditingTextElement`); slide switch ends element editing; publish carries elements.
- [x] `StoryComposerScreen` renders draggable/tappable/removable elements + "Add text"; +4 strings × 4 locales.
- [x] TDD: `StoryTextElementTest` +10, `StorySlideDeckTextElementsTest` +16, `StoryComposerDraftTest` +5,
      `StoryComposerViewModelTest` +10. No floor lowered, no test weakened.
- [x] `./apps/android/meeshy.sh check` green (assembleDebug + all unit tests).

## Next loop (see PROGRESS.md "Next")
1. Text element styling (style picker + colour/align + per-style typography rendering).
2. In-place floating text editor (tool bubbles + keyboard-aware shift); then the canvas toolbar/FAB
   and on to the **Calls** area.
