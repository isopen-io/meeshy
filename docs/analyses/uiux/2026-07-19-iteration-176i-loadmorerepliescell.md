# Iteration-176i — i18n + Dynamic Type + Indigo + VoiceOver for `LoadMoreRepliesCell`

**Date:** 2026-07-19
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver) + Dynamic Type + brand color
**File touched:** `apps/ios/Meeshy/Features/Main/Views/Cells/LoadMoreRepliesCell.swift` (1 file, 0 new test)

## Component

`LoadMoreRepliesCell` is the tappable "View N more replies" row inserted at the
bottom of an expanded comment thread in `CommentListViewController` (post/feed
comment sheets). Selecting it calls `onToggleThread(parentId)` to fetch and
reveal the remaining replies. It is a plain UIKit `UICollectionViewCell` in a
`UICollectionViewCompositionalLayout` with self-sizing (`.estimated(80)`) items.

## Findings

The cell shipped with four defects, all flagged as an open candidate at the end
of iteration 167i:

1. **Hardcoded, unlocalized English string with a plural bug.**
   `label.text = "View \(remaining) more replies"` — never passed through the
   localization system, and grammatically wrong at `remaining == 1`
   ("View 1 more replies").

2. **No Dynamic Type.** `label.font = .systemFont(ofSize: 13, weight: .medium)`
   with `numberOfLines` defaulting to 1 — fixed size, no
   `adjustsFontForContentSizeCategory`; the row neither scaled nor wrapped at
   large accessibility text sizes.

3. **Off-brand hardcoded color.** `label.textColor = .systemBlue` — the system
   blue instead of the Meeshy Indigo brand accent used for interactive/CTA text
   everywhere else in the app.

4. **No accessibility structure.** The cell was not an accessibility element and
   carried no `.button` trait, label, or hint. VoiceOver read the raw label text
   but never announced the row as a button, and there was no hint describing the
   outcome. The 36pt minimum height was also below the 44pt HIG touch target.

## Fix

Rewrote the cell against the codebase standard while preserving the tap
contract (`configure(parentId:remaining:)` + `parentId` read by the controller):

- **Localization + pluralization.** `labelText(remaining:)` now returns
  `String(localized: "comments.load-more-replies",
  defaultValue: "View ^[\(remaining) more reply](inflect: true)", bundle: .main)`.
  Automatic Grammar Agreement inflects the noun to agree with the count at
  runtime ("View 1 more reply" / "View 3 more replies") in the development
  language (`en`) — no `.stringsdict` and no `.xcstrings` edit, matching the
  inline-`defaultValue` doctrine of the file family.
- **Dynamic Type.** `.preferredFont(forTextStyle: .subheadline)` +
  `adjustsFontForContentSizeCategory = true` + `numberOfLines = 0`. The label is
  re-anchored top/bottom (8pt insets) instead of center-Y so it self-sizes and
  wraps; the content-view minimum height is raised 36 → 44pt (HIG touch target).
- **Indigo brand accent.** `.systemBlue` → a dynamic `UIColor` resolving to
  indigo500 `#6366F1` (light) / indigo400 `#818CF8` (dark), matching the design
  system's interactive-text treatment and adapting to the appearance.
- **VoiceOver.** `isAccessibilityElement = true`, `accessibilityTraits = .button`,
  `accessibilityLabel` mirroring the visible (localized) text, and an
  `accessibilityHint` ("Shows the remaining replies in this thread"). Both label
  and hint are cleared/reset in `configure`/`prepareForReuse`.

Two new inline-`defaultValue` keys: `comments.load-more-replies`,
`comments.load-more-replies.hint`.

## Rationale

Loading/disclosure affordances and accessibility are explicitly in the UX +
a11y review scope. This row is the single entry point to the rest of a comment
thread — a VoiceOver user previously heard a non-button string, a large-text
user got a clipped 13pt line, a non-English user saw untranslated English, and
everyone at `remaining == 1` saw a grammar error. The rewrite fixes all four
with zero behavior change: same registration, same `didSelectItemAt` →
`onToggleThread(parentId)` path, same self-sizing layout.

## Verification

- **Static review:** `.preferredFont(forTextStyle:)`,
  `adjustsFontForContentSizeCategory`, dynamic `UIColor { traits in … }`,
  `isAccessibilityElement`/`accessibilityTraits`/`Label`/`Hint`, and
  `String(localized:defaultValue:bundle:)` are all standard UIKit/Foundation
  APIs available on the app's iOS 16.0 floor. Automatic Grammar Agreement
  (`^[…](inflect: true)`) is iOS 15+. No availability guard needed.
- **Layout:** the compositional layout uses `.estimated(80)` item height, so the
  top+bottom anchored, wrapping label self-sizes correctly; the 44pt minimum
  keeps single-line rows tappable.
- **No test churn:** no test references `LoadMoreRepliesCell` (grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0). The one call site
  (`CommentListViewController.swift:66-68`, `130-131`) uses
  `configure(parentId:remaining:)` and `parentId` — both unchanged.
- **CI gate:** `ios-tests` runs on the macOS runner (this is a Linux container);
  confirm it is green on the PR before merge.

## Remaining improvements (future iterations)

- `ReplyCell` / `TopLevelCommentCell` (siblings in the same folder) still use
  fixed-size `.systemFont(ofSize:)` for their name/content/timestamp labels and
  lack Dynamic Type — a natural follow-up to bring the whole comment-cell family
  onto `preferredFont`.
- `CommentListViewController`'s collection view has no VoiceOver section headers
  distinguishing top-level comments from replies.

**Status: RESOLVED for `LoadMoreRepliesCell` localization + pluralization +
Dynamic Type + Indigo + VoiceOver.**
