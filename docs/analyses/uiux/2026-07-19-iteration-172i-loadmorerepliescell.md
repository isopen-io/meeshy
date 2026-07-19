# Iteration-172i — Localization + Dynamic Type + Brand + VoiceOver for `LoadMoreRepliesCell`

**Date:** 2026-07-19
**Scope:** iOS only
**Area:** Localization (i18n + pluralization) · Dynamic Type · Indigo brand · Accessibility (VoiceOver)
**File touched:** `apps/ios/Meeshy/Features/Main/Views/Cells/LoadMoreRepliesCell.swift` (1 file, 0 logic, 0 new test)

## Component

`LoadMoreRepliesCell` is the UIKit `UICollectionViewCell` that renders the
"load more replies" affordance at the bottom of a collapsed reply thread in the
comment list (`CommentListViewController`). It is dequeued via a
`UICollectionView.CellRegistration` and its tap is handled by the controller's
`didSelectItemAt` (`case .loadMoreReplies(parentId, _)`), which expands the
thread. It renders a single left-indented label aligned under the reply column.

Surfaced as an open candidate by iteration-167i.

## Findings

The cell shipped four issues, all in the visual/interaction layer (no behavior
was wrong):

1. **Hardcoded, unlocalized English string with a pluralization bug.**
   `label.text = "View \(remaining) more replies"` — raw English, and
   grammatically broken for `remaining == 1` ("View 1 more replies"). It was the
   only string in the file and bypassed the codebase's inline
   `String(localized:defaultValue:bundle:)` idiom.

2. **Fixed 13pt font, single line — no Dynamic Type.**
   `.systemFont(ofSize: 13, weight: .medium)` with `numberOfLines` defaulting to
   1. The label neither scaled with the user's text-size setting nor wrapped, so
   at large accessibility sizes the text truncated.

3. **`.systemBlue` instead of brand Indigo.** The action link used the system
   blue tint rather than `indigo500`, violating the project brand rule that new
   or edited code must use the Indigo scale.

4. **Zero accessibility.** The cell behaves as a button but exposed no
   `isAccessibilityElement`, no `.button` trait, and no label/hint. VoiceOver
   read it as an inert static label with no cue that it was actionable.

## Fix

Single file, no logic or state change, no new test:

- **Localization + pluralization** via Apple automatic grammar agreement:
  `String(localized: "comments.load-more-replies", defaultValue: "Voir ^[\(remaining) réponse](inflect: true) de plus", bundle: .main)`.
  The numeric argument drives correct noun inflection at runtime
  (`1 réponse` / `N réponses`), fixing the plural bug without a `.xcstrings`
  catalog edit. French default ships inline (repo doctrine: default language is
  FR).
- **Dynamic Type** via `UIFontMetrics(forTextStyle: .footnote).scaledFont(for:)`
  over a medium-weight base at the footnote point size (preserves the ~13pt look
  while scaling), plus `adjustsFontForContentSizeCategory = true` and
  `numberOfLines = 0`. Constraints were reworked from a single hard `centerY`
  to a breakable `centerY` (`.defaultHigh`) plus `top >=` / `bottom <=` insets,
  so the row grows and wraps at large text sizes instead of clipping. The min
  touch target rose `36 → 44` to meet the HIG 44pt minimum.
- **Brand color** via `UIColor(MeeshyColors.indigo500)` — bridges the single
  source-of-truth SwiftUI token to UIKit with no hardcoded hex duplication.
- **Accessibility**: `isAccessibilityElement = true` and
  `accessibilityTraits = .button` set once in `init`; `accessibilityLabel`
  (the visible text) and a localized `accessibilityHint`
  ("Affiche les réponses supplémentaires") set in `configure` and cleared in
  `prepareForReuse`.

Two new inline-`defaultValue` keys (`comments.load-more-replies`,
`comments.load-more-replies.a11y-hint`) — same no-catalog doctrine as the rest
of the file family (167i, 159i).

## Rationale

The comment thread is a high-traffic surface; a broken plural, an English-only
string, a non-scaling label, an off-brand link color, and a VoiceOver-inert
button are all squarely inside the localization + Dynamic Type + brand +
accessibility review scope. Bridging `MeeshyColors.indigo500` to UIColor keeps
the brand token single-sourced, and automatic grammar agreement is the canonical
Apple approach to count-driven pluralization — no bespoke `if count == 1`
branching. The visual design (indent, position, size) is preserved.

## Verification

- **Static review:** all APIs are iOS 16.0+ — `UIFontMetrics`,
  `UIColor(_: Color)` (iOS 14+), automatic grammar agreement
  `^[…](inflect: true)` (iOS 15+). App floor is iOS 16.0, no availability guard
  needed.
- **No test churn:** no test references `LoadMoreRepliesCell` (grep across
  MeeshyTests / MeeshyUITests / MeeshySDK = 0). The single call site
  (`CommentListViewController` cell registration) is unchanged —
  `configure(parentId:remaining:)` signature preserved.
- **CI gate:** `ios-tests` (macOS runner) — this is a Linux container, so the
  compile + VoiceOver run happens in CI. Confirm `ios-tests` is green on the PR
  before merge.

## Remaining improvements (future iterations)

- Sibling comment cells (`ReplyCell`, `TopLevelCommentCell`, `TextPostCell`,
  `MediaPostCell`) still use fixed-size fonts (`.systemFont(ofSize:)`) with no
  `adjustsFontForContentSizeCategory` — a coordinated Dynamic Type pass across
  the `Cells/` family is the natural follow-up.
- `LinkPreviewCard` VoiceOver labeling (flagged 167i) remains open unless
  covered by PR #2047.

**Status: RESOLVED for `LoadMoreRepliesCell` localization + Dynamic Type + brand + VoiceOver.**
