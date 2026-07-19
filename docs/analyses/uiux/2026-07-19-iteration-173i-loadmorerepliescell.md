# Iteration-173i — Localization + Dynamic Type + VoiceOver + brand for `LoadMoreRepliesCell`

**Date:** 2026-07-19
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (Dynamic Type + VoiceOver) + Brand identity — comment thread "load more replies" affordance
**File touched:** `apps/ios/Meeshy/Features/Main/Views/Cells/LoadMoreRepliesCell.swift` (1 file, 0 logic, 0 new test)

## Component

`LoadMoreRepliesCell` is the UIKit `UICollectionViewCell` shown at the bottom of a
collapsed comment thread — the tap target that expands the remaining replies of a
top-level comment. It is registered in `CommentListViewController` (compositional
layout, `.estimated(80)` self-sizing) and selected via
`collectionView(_:didSelectItemAt:)` → `onToggleThread(parentId)`.

## Findings

This cell was the last raw-literal / non-adaptive surface flagged in 167i's
"remaining improvements" list. Four defects, all in a single interactive row:

1. **Hardcoded, unlocalized string with no pluralization.**
   `label.text = "View \(remaining) more replies"` — a raw English literal, the
   only string in the comment-cell family bypassing the codebase's
   `String(localized:defaultValue:bundle:)` idiom. It also read "View 1 more
   replies" (broken singular) whenever exactly one reply remained.

2. **Fixed 13pt font — no Dynamic Type.**
   `label.font = .systemFont(ofSize: 13, weight: .medium)` never scaled with the
   user's text-size setting, and `adjustsFontForContentSizeCategory` was unset, so
   the affordance stayed 13pt at every accessibility size while the surrounding
   comment text (also fixed, tracked separately) at least matched the design.

3. **Non-brand hardcoded color.**
   `label.textColor = .systemBlue` — the iOS default link tint, not Meeshy's
   Indigo brand primary. CLAUDE.md: "New code MUST use the Indigo scale or
   semantic names." Every other brand-tinted interactive element uses
   `MeeshyColors.indigo500` (`#6366F1`).

4. **No button affordance for VoiceOver.**
   The cell exposed the bare `UILabel` with no `.button` trait and no explicit
   accessibility element, so VoiceOver announced "View 3 more replies" as plain
   static text — giving no signal that the row is actionable (it triggers thread
   expansion on tap).

## Fix

Rewrote the cell to the idiomatic Apple UIKit adaptive/accessible pattern, zero
behavior change to paging/selection:

- **Localization + honest plural.** Static pure helper `loadMoreLabel(remaining:)`
  returns one of two localized strings selected by count:
  `comments.load-more-replies.one` (`"View 1 more reply"`) for `remaining == 1`,
  `comments.load-more-replies.other` (`"View \(remaining) more replies"`)
  otherwise. English `defaultValue` inline (development language is `en`, per
  `project.yml`), keys auto-extract to `Localizable.xcstrings` — no catalog edit
  (same doctrine as 167i). Both singular and plural forms are now translatable.
- **Dynamic Type.**
  `UIFontMetrics(forTextStyle: .subheadline).scaledFont(for: .systemFont(ofSize: 13, weight: .medium))`
  + `adjustsFontForContentSizeCategory = true` — the medium weight is preserved
  while the glyph now scales with the user's text size. `numberOfLines = 0` plus
  `top ≥`/`bottom ≤` constraints let the self-sizing (`.estimated(80)`) cell grow
  instead of truncating at large sizes; the `height ≥ 36` floor and the existing
  `56 + 40` leading indent (thread alignment) are unchanged.
- **Brand color.** `UIColor(MeeshyColors.indigo500)` replaces `.systemBlue`.
  `MeeshyColors` is module-visible via the app's `@_exported import MeeshyUI`
  (precedent: `StatusBarView`, `TrackingLinkDetailView`); `import SwiftUI` is
  added for the `UIColor(Color)` bridge. Indigo is a fixed brand hex, correct in
  both light and dark (the brand gradient is mode-agnostic by design).
- **VoiceOver button affordance.** `isAccessibilityElement = true` +
  `accessibilityTraits = .button` collapse the row into one focusable element and
  announce it as a button; `accessibilityLabel` is set to the localized text on
  `configure` and cleared in `prepareForReuse` alongside the existing reset.

## Rationale

Loading/expansion affordances and interactive-element accessibility are explicitly
in the UX + a11y review scope. This was a genuinely broken surface (English-only,
"1 more replies", 13pt-locked, non-brand, no button semantics) on a high-traffic
path (every collapsed comment thread). The fix is the canonical UIKit Dynamic Type
+ VoiceOver + localization recipe, folds the interactive row into a single labeled
button element, and aligns the link to the Indigo brand — all with zero change to
the tap/expand logic.

## Verification

- **Static review:** all APIs are iOS 16.0+ (`UIFontMetrics.scaledFont`,
  `adjustsFontForContentSizeCategory`, `UIColor(_ color: Color)` iOS 14+,
  `accessibilityTraits`, `String(localized:defaultValue:bundle:)`). App floor is
  iOS 16.0 — no availability guard needed.
- **Module visibility:** `MeeshyColors` resolves with only `import SwiftUI` thanks
  to `MeeshyUIExports.swift` (`@_exported import MeeshyUI`); confirmed by existing
  SwiftUI-only files that reference `MeeshyColors` without importing MeeshyUI.
- **Self-sizing:** the collection layout is `.estimated(80)` compositional →
  vertical `top ≥`/`bottom ≤` pins make the cell grow with Dynamic Type rather
  than clip; `centerY` keeps it centered when there is slack.
- **No test churn:** grep across `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests`
  finds 0 references to `LoadMoreRepliesCell` or `loadMoreLabel`. The one call site
  (`CommentListViewController` cell registration) passes `parentId`/`remaining`
  unchanged; `didSelectItemAt` → `onToggleThread` is untouched.
- **CI gate:** `ios-tests` (macOS runner) compiles + runs — this is a Linux
  container, so confirm `ios-tests` is green on the PR before merge.

## Remaining improvements (future iterations)

- Sibling comment cells (`ReplyCell`, `TopLevelCommentCell`, `TextPostCell`,
  `MediaPostCell`) still use fixed `.systemFont(ofSize:)` for name/body/timestamp
  labels — a coordinated Dynamic Type pass across the UIKit comment-cell family is
  the natural follow-up (one cell per iteration to keep diffs surgical).
- Full CLDR plural coverage (Russian/Polish/Arabic categories) could later be
  expressed via a single String Catalog plural-variation entry; the two-key
  singular/other split is correct for the shipped locales (EN/FR both 1 = singular)
  and keeps the inline-`defaultValue` doctrine.

**Status: RESOLVED for `LoadMoreRepliesCell` localization + Dynamic Type + VoiceOver + brand.**
