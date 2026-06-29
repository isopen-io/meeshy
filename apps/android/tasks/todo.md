# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `story-text-element-transform` ✅ (PR #1045)
Adds **per-element pinch-scale + rotate** to the composer canvas — a selected text element resizes
and rotates with one natural two-finger gesture, and the transform rides into publish on the wire.

- [x] Pure `StoryTextElement`: `scale` (clamped `[0.3, 4]`) + `rotationDeg` (wrapped `(-180, 180]`);
      `clampScale`/`normaliseRotation` (non-finite → neutral); `transformed(scaleBy, rotateByDeg)`;
      `normalised()` extended to all continuous fields; `toTextObject` carries `scale`/`rotation`.
- [x] Deck `transformTextElement` + VM `onTextElementTransform` (inert on unknown id; selection untouched).
- [x] `TextElementLayer` switched `detectDragGestures` → `detectTransformGestures` (one gesture
      pans+pinches+rotates); rendered via `graphicsLayer { scaleX/scaleY/rotationZ }` (glue, JVM-exempt).
- [x] TDD +21: `StoryTextElementTest` +14, `StorySlideDeckTextElementsTest` +4,
      `StoryComposerViewModelTest` +3. No floor lowered, no test weakened. No new strings.
- [x] `./apps/android/meeshy.sh check` green (assembleDebug + all unit tests). Diff = `apps/android` only.

## Next loop (see PROGRESS.md "Next")
1. Canvas toolbar/FAB (Contenu/Effets grouping add-text / add-media).
2. Then on to the **Calls** area (`feature-parity.md` §"Calls").
