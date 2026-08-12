# Plan — Iteration-176i — `LoadMoreRepliesCell` i18n + Dynamic Type + Indigo + VoiceOver

**Date:** 2026-07-19 · **Scope:** iOS only · **Base:** `main` HEAD `70001b9`

## Goal
Bring the "View N more replies" comment-thread affordance up to the codebase
standard: localized + grammatically-correct plural, Dynamic Type, Indigo brand
accent, and a proper VoiceOver button — without changing the tap behavior or the
comment-list layout.

## Steps
1. [x] Localize the label via `String(localized:defaultValue:bundle:)` with
   Automatic Grammar Agreement (`^[…](inflect: true)`) so "1 more reply" /
   "3 more replies" agree with the count (base language `en`).
2. [x] Replace fixed `13pt` font with `.preferredFont(forTextStyle: .subheadline)`
   + `adjustsFontForContentSizeCategory` + `numberOfLines = 0`; re-anchor the
   label top/bottom (self-sizing layout uses `.estimated(80)`) with a 44pt
   minimum-height touch target.
3. [x] Replace hardcoded `.systemBlue` with a dynamic Indigo `UIColor`
   (indigo500 light / indigo400 dark).
4. [x] Make the cell one VoiceOver element with `.button` trait, an
   `accessibilityLabel` mirroring the visible text, and an `accessibilityHint`.
5. [ ] Push branch, open PR, confirm `ios-tests` green, merge, update tracking.

## Non-goals
- No `.xcstrings` catalog edit (inline `defaultValue` doctrine; inflection is
  runtime, no stringsdict needed).
- No change to `CommentListViewController` (tap → `onToggleThread` unchanged).
- No change to the sibling cells (`ReplyCell`, `TopLevelCommentCell`) — out of
  scope for this iteration.
