# Analysis — Iteration-182i (iOS) — ReplyCell Dynamic Type + VoiceOver

**Date:** 2026-07-20
**Scope:** iOS only
**File:** `apps/ios/Meeshy/Features/Main/Views/Cells/ReplyCell.swift`
**Call site:** `CommentListViewController.swift` (reply-cell `CellRegistration`, `depth: 1`)

## Context

`ReplyCell` is the indented UIKit `UICollectionViewCell` shown for each reply
under a top-level comment when a thread is expanded. It is a pure display cell
(no interactive controls — unlike `TopLevelCommentCell`, which owns like/reply
buttons, and `LoadMoreRepliesCell`, the tappable "View N more replies" row
already fixed in 176i).

It was explicitly named in the 176i tracking note as the next candidate:
*"ReplyCell/TopLevelCommentCell (mêmes `.systemFont(ofSize:)` figés, sans
Dynamic Type)."*

## Deficits found

| # | Deficit | HIG / WCAG |
|---|---------|------------|
| 1 | `nameLabel`/`contentLabel`/`timestampLabel` fonts pinned to `.systemFont(ofSize: 13/14/11)` — no Dynamic Type | WCAG 1.4.4 (Resize Text) |
| 2 | Cell not an accessibility element — VoiceOver reads 3 disconnected fragments, no "who/what/when" identity | HIG Accessibility (grouping) |
| 3 | `nameLabel`/`timestampLabel` at default `numberOfLines = 1` → clip at large content sizes | WCAG 1.4.4 |
| 4 | `prepareForReuse` did not clear `timestampLabel` → stale timestamp could flash on reuse | Correctness |

## Fix applied

- **Dynamic Type via `UIFontMetrics`**: each label wraps its exact original
  point size in `UIFontMetrics(forTextStyle: <matching>).scaledFont(for:)`
  (`footnote`/`body`/`caption2`) + `adjustsFontForContentSizeCategory = true`.
  Because the seed sizes are unchanged (13 semibold / 14 / 11), the cell is
  **pixel-identical at the default content size** and scales from there — the
  same technique used across the app for weighted dynamic fonts.
- **VoiceOver**: `isAccessibilityElement = true`; `accessibilityLabel` composed
  by the pure static helper `accessibilityLabel(name:content:time:)` returning
  `"{name}, reply. {content}. {time}"` through
  `String(localized: "comments.reply.a11yLabel", defaultValue:…)`. One swipe now
  reads a coherent element.
- **No clipping**: `numberOfLines = 0` on name + timestamp (content already 0).
- **Reuse hygiene**: `prepareForReuse` now clears `timestampLabel.text` and
  `accessibilityLabel`.

## Constraints

- 1 file, 0 logic change (`configure(with:depth:)` signature and indent math
  untouched), 0 new test (no test references the cell), 1 new inline i18n key,
  0 `.xcstrings` edit, 0 visual change at default Dynamic Type.

## Verification status

- Static review only — build + VoiceOver exercised in CI `iOS Tests` (macOS).
  The Linux container here cannot run `xcodebuild`.
- Pattern is a 1:1 mirror of merged 176i (`LoadMoreRepliesCell`), which passed
  the same gate.

## Completion

**RESOLVED** — `ReplyCell` Dynamic Type + VoiceOver + reuse hygiene done.
Remaining sibling candidate: `TopLevelCommentCell` (same fixed fonts **plus** a
hardcoded `"Reply"` button title and non-Dynamic-Type interactive buttons →
larger i18n + a11y-for-controls scope, own iteration).
