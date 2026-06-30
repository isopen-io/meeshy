# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Stories) — slice `story-sticker-picker-search` ✅
Replaces the flat built-in emoji palette with the **categorised + searchable** sticker picker (iOS
`StickerPickerView` parity): 8 category tabs + a live search field, a non-blank query searching across
**all** categories. All the "what is visible" logic lives in two pure, unit-tested types; the dialog is glue.

- [x] New pure `StickerCatalog` (`:feature:stories`): `enum StickerCategory` (8, tab order),
      `StickerEntry(emoji, category, keywords)`, the curated catalogue (~16 keyworded emojis/category,
      each glyph in one category ⇒ `all` duplicate-free), `inCategory`, `all`, `search(query, category?)`
      (trim+lowercase substring over keywords or glyph; blank ⇒ whole scope; order-preserving + distinct).
- [x] New pure `StickerPickerState(category, query)` reducer: `isSearching`, `visibleEmojis` (global
      search while searching, active tab otherwise), inert `withCategory`/`withQuery`.
- [x] Dialog glue: search field + `FilterChip` tab row (hidden while searching) + filtered grid +
      empty-state. Removed `STORY_STICKER_EMOJIS`.
- [x] TDD +22 (`StickerCatalogTest`). First RED caught a real `⭐` duplicate (OBJECTS+SYMBOLS) → `☮️`.
      No floor lowered, no test weakened. +10 strings × 4 locales.
- [x] `./gradlew assembleDebug testDebugUnitTest` green (debug APK + all unit tests; 22/22). Diff =
      `apps/android` only.

## Next loop (see PROGRESS.md "Next")
1. Unified long-press context menu consolidating per-element edit/duplicate/reorder/delete.
2. On-canvas **freehand drawing**, then **backgrounds** (pastel / gradient / image), then the timeline.
3. Then on to the **Calls** area (`feature-parity.md` §"Calls").
