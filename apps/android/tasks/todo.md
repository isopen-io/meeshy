# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `story-text-element-zorder` ✅
Adds **z-order management** (front/back, forward/backward) to on-canvas text elements — the slide's
`elements` list order *is* the paint order, so restacking is a pure list move within the holding slide,
driven by a 4-button z-order row in the floating style toolbar. Also: rebased + resolved the prior
slice's conflicted PR #1048 onto main (kept both sides) before it merged.

- [x] New `StoryZOrder` enum + pure `StorySlideDeck.reorderTextElement(id, op)`: target index
      (0 / from-1 / from+1 / lastIndex) `coerceIn`-clamped; inert (same instance) at extremes / unknown
      id / single element; restacks only the holding slide; preserves selection. Single source of truth.
- [x] `StoryComposerViewModel.onReorderTextElement` — keeps the same **state** instance on an inert move
      (no recomposition churn); selection/editing untouched.
- [x] Toolbar glue: a 4-button z-order row (`ZOrderButton`) in `TextStyleToolbar` (send-to-back /
      backward / forward / bring-to-front), accent-coherent tint (JVM-exempt).
- [x] TDD +16: `StorySlideDeckZOrderTest` +13, `StoryComposerViewModelTest` +3. No floor lowered, no
      test weakened. +4 strings × 4 locales.
- [x] `./apps/android/meeshy.sh check` green (assembleDebug + all unit tests; ZOrder 13/13). Diff =
      `apps/android` only.

## Next loop (see PROGRESS.md "Next")
1. Unified long-press context menu consolidating per-element edit/duplicate/reorder/delete.
2. On-canvas sticker / drawing elements; real Effets tiles (filters / drawing / timeline).
3. Then on to the **Calls** area (`feature-parity.md` §"Calls").
