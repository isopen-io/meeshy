# Plan — Iteration-172i — `LoadMoreRepliesCell`

**Date:** 2026-07-19
**Scope:** iOS only
**Area:** Localization (i18n + pluralization) · Dynamic Type · Brand alignment · Accessibility (VoiceOver)
**Working branch:** `claude/laughing-thompson-wnkqrl` (base `main`)

## Target

`apps/ios/Meeshy/Features/Main/Views/Cells/LoadMoreRepliesCell.swift` — the
UIKit `UICollectionViewCell` that renders the "View N more replies" affordance
inside the threaded comment list (`CommentListViewController`). It is a tappable
row: selection is handled at `CommentListViewController.collectionView(_:didSelectItemAt:)`
(`case .loadMoreReplies`).

Surfaced as an open candidate by iteration-167i (`UploadProgressBar`).

## Findings (pre-change)

1. **Hardcoded, unlocalized English string with a pluralization bug.**
   `label.text = "View \(remaining) more replies"` — the only string in the file,
   raw English, and grammatically wrong for `remaining == 1` ("View 1 more
   replies"). Bypasses the codebase inline `String(localized:defaultValue:bundle:)`
   doctrine.
2. **Fixed 13pt font — no Dynamic Type.** `.systemFont(ofSize: 13, weight: .medium)`
   with `numberOfLines` defaulting to 1 → the label neither scales nor wraps at
   large accessibility text sizes.
3. **`.systemBlue` instead of brand Indigo.** New/edited code MUST use the Indigo
   scale (project brand rule); the action link should read as `indigo500`.
4. **Zero accessibility.** The cell is a button-like row but exposed no
   `isAccessibilityElement`, no `.button` trait, no label/hint — VoiceOver swept
   it as a plain static label with no actionable affordance.

## Approach

Single file, no logic/state change, no new test:

- **Pluralization** via Apple automatic grammar agreement:
  `defaultValue: "Voir ^[\(remaining) réponse](inflect: true) de plus"` — the
  numeric argument drives correct noun inflection (`1 réponse` / `N réponses`)
  at runtime, no `.xcstrings` catalog edit. French default ships inline (repo
  doctrine: default language is FR).
- **Dynamic Type** via `UIFontMetrics(forTextStyle: .footnote).scaledFont(for:)`
  over a medium-weight base at the footnote point size (preserves the 13pt look
  while scaling) + `adjustsFontForContentSizeCategory = true` +
  `numberOfLines = 0`. Constraints reworked to `centerY` (breakable) plus
  `top >=` / `bottom <=` insets so the row grows/wraps at large sizes; min touch
  target lifted `36 → 44` (HIG 44pt minimum).
- **Brand color** via `UIColor(MeeshyColors.indigo500)` — bridges the single
  source-of-truth SwiftUI token to UIKit, no hardcoded hex duplication.
- **Accessibility**: `isAccessibilityElement = true`, `accessibilityTraits =
  .button` (set once in `init`), `accessibilityLabel` = the visible text and
  `accessibilityHint` (localized) set in `configure`, cleared in
  `prepareForReuse`.

## Verification

- No test references `LoadMoreRepliesCell` (grep across MeeshyTests /
  MeeshyUITests / MeeshySDK = 0). Single call site (`CommentListViewController`
  cell registration) unchanged — `configure(parentId:remaining:)` signature
  preserved.
- All APIs are iOS 16.0+ (`UIFontMetrics`, `UIColor(_: Color)` iOS 14+,
  automatic grammar agreement iOS 15+). App floor iOS 16.0 — no availability
  guard.
- Compile + VoiceOver run happens in CI (`ios-tests`, macOS runner) — this is a
  Linux container. Confirm `ios-tests` green before merge.
