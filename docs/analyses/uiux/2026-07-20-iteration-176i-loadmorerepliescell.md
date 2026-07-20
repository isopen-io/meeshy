# Iteration-176i — Localization + Dynamic Type + VoiceOver for `LoadMoreRepliesCell`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver, touch target) + Dynamic Type — comment thread "load more" action
**File touched:** `apps/ios/Meeshy/Features/Main/Views/Cells/LoadMoreRepliesCell.swift` (1 file, 0 logic change, 0 new test)

## Component

`LoadMoreRepliesCell` is the UIKit `UICollectionViewCell` shown at the bottom of a
collapsed reply thread in the comments list (`CommentListViewController`). Tapping
it expands the thread (`didSelectItemAt` → `onToggleThread(parentId)`). It renders a
single blue action label: *"View N more replies"*.

It was flagged as an open candidate at the close of iteration 167i.

## Findings

Four defects, all in the a11y / i18n / HIG review scope:

1. **Hardcoded, unlocalized English string with a grammar bug.**
   `label.text = "View \(remaining) more replies"` — bypassed the codebase's
   `String(localized:defaultValue:bundle:)` idiom entirely, and always used the
   plural form. With `remaining == 1` it read *"View 1 more replies"* (wrong
   plural). No locale could translate it.

2. **Fixed font — no Dynamic Type.** `label.font = .systemFont(ofSize: 13, weight:
   .medium)` pinned the size. A tappable affordance that never grows with the
   user's preferred text size fails the Dynamic Type requirement; at large
   accessibility sizes the action stayed 13 pt while surrounding comment text
   scaled.

3. **No accessibility button semantics.** The cell is the tap target, but nothing
   marked it as such. VoiceOver swept the inner `UILabel` as loose static text
   with no `.button` trait — a VoiceOver user got no cue the row was actionable
   ("View 3 more replies" read as a plain caption, not "…, button").

4. **Sub-minimum touch target.** `contentView.heightAnchor >= 36` — below the
   44-pt HIG minimum for an interactive element.

## Fix

Single-file, behavior-preserving (still one blue action row that expands the
thread on tap):

- **Dynamic Type:** wrap the original 13-pt medium font in
  `UIFontMetrics(forTextStyle: .subheadline).scaledFont(for:)` and set
  `adjustsFontForContentSizeCategory = true`. The design weight/size is preserved
  at the default content size and now scales. `numberOfLines = 0` so scaled text
  wraps instead of truncating.
- **Localization + pluralization:** `loadMoreText(remaining:)` returns a
  `String(localized:defaultValue:bundle:)` value, choosing between
  `comment.replies.load-more-one` (*"View 1 more reply"*) and
  `comment.replies.load-more-other` (*"View \(remaining) more replies"*). Two keys
  keep each locale's plural rule its own; English base defaults ship inline (dev
  language is `en`), no `.xcstrings` catalog edit — same doctrine as 167i.
- **VoiceOver button semantics:** in `configure`, set the cell
  `isAccessibilityElement = true`, `accessibilityTraits = .button`,
  `accessibilityLabel = text`. Cleared in `prepareForReuse`.
- **Touch target:** min height `36` → `44`.

## Rationale

Empty/expansion states and interactive affordances are explicitly in the UX +
accessibility review scope. The comment thread is a high-traffic surface; the one
raw string blocked localization of a shipped screen AND printed *"View 1 more
replies"*, the fixed font broke Dynamic Type, and the missing `.button` trait hid
the action from VoiceOver. All four are canonical native-platform corrections with
no visual redesign — the neutral system-blue link affordance and layout are
unchanged.

## Verification

- **Static review:** `UIFontMetrics.scaledFont(for:)`,
  `adjustsFontForContentSizeCategory`, `accessibilityTraits = .button`, and
  `String(localized:defaultValue:bundle:)` (with interpolated `defaultValue`) are
  all standard APIs on the iOS 16.0 floor — interpolated `defaultValue` has
  precedent (`UploadProgressBar` 167i, `EmailVerificationView`).
- **No test churn:** no test references `LoadMoreRepliesCell` (grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDK` = 0). The single call site
  (`CommentListViewController` cell registration) passes `parentId`/`remaining`
  unchanged.
- **CI gate:** `ios-tests` runs on the macOS runner (this is a Linux container),
  so the compile/VoiceOver run happens in CI. Confirm `ios-tests` is green before
  merge.

## Remaining improvements (future iterations)

- The sibling comment cells (`ReplyCell`, `TopLevelCommentCell`,
  `TextPostCell`, `MediaPostCell`) also use fixed-point fonts
  (13/14/11 pt) — Dynamic Type migration is a natural follow-up family sweep.
- `LinkPreviewCard` (whole-card `Button` opening Safari with no
  `.accessibilityLabel`/`.accessibilityHint`) remains an open candidate from the
  167i scan.

**Status: RESOLVED for `LoadMoreRepliesCell` localization + Dynamic Type + VoiceOver + touch target.**
