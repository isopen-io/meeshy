# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `story-text-element-styling` ✅
Makes **on-canvas text elements styleable**: per-style typography rendering + a style/colour/alignment picker.

- [x] Pure `StoryTextStyle.typography()` → `StoryTextTypography` (`fontWeight`/`italic`/`family`/
      `letterSpacingEm`/`glow`) over the new `StoryTextFontFamily` enum — Compose-agnostic, JVM-testable.
- [x] VM intents `onTextElementStyle`/`onTextElementColor`/`onTextElementAlign` (one-line
      `deck.updateTextElement` wrappers; inert on unknown id; selection/editing untouched).
- [x] `TextElementLayer` renders weight/slant/family/tracking + neon glow `Shadow`; `TextStyleToolbar`
      (5 style chips + L/C/R `AlignToggle` + `ColorSwatch` palette) shown while editing an element.
- [x] +8 strings × 4 locales (5 style names, 3 alignment content descriptions).
- [x] TDD: `StoryTextTypographyTest` +8, `StoryComposerViewModelTest` +8. No floor lowered, no test weakened.
- [x] `./apps/android/meeshy.sh check` green (assembleDebug + all unit tests).

## Next loop (see PROGRESS.md "Next")
1. In-place floating text editor (tool bubbles + keyboard-aware shift).
2. Canvas toolbar/FAB (Contenu/Effets); then on to the **Calls** area.
