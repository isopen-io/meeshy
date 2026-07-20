# Analysis — Iteration-187i (iOS) — TopLevelCommentCell Dynamic Type + VoiceOver + i18n

**Date:** 2026-07-20
**Scope:** iOS only
**File:** `apps/ios/Meeshy/Features/Main/Views/Cells/TopLevelCommentCell.swift`
**Call site:** `CommentListViewController.swift` (top-level `CellRegistration`, `cell.configure(with:)`)

## Context

`TopLevelCommentCell` is the UIKit `UICollectionViewCell` shown for each
top-level comment in an expanded thread — the sibling of `ReplyCell` (fixed
in 182i) and `LoadMoreRepliesCell` (fixed in 176i). The 182i tracking note
named it explicitly as the next candidate:
*"TopLevelCommentCell (same fixed fonts **plus** a hardcoded `"Reply"` button
title and non-Dynamic-Type interactive buttons)."*

Key finding from the call site: the `likeButton`/`replyButton` carry **no
`addTarget`** anywhere (the registration only calls `configure(with:)`) — they
are **purely decorative** affordances, not wired controls. So exposing them as
VoiceOver buttons would announce "Reply, button" for an element that does
nothing when activated (misleading per HIG).

## Deficits found

| # | Deficit | HIG / WCAG |
|---|---------|------------|
| 1 | `nameLabel`/`contentLabel`/`timestampLabel` + `replyButton` fonts pinned to `.systemFont(ofSize: 14/15/12/12)` — no Dynamic Type | WCAG 1.4.4 (Resize Text) |
| 2 | Cell not an accessibility element — VoiceOver reads disconnected fragments + two non-functional "buttons" | HIG Accessibility (grouping + misleading traits) |
| 3 | `nameLabel`/`timestampLabel` at default `numberOfLines = 1` → clip at large content sizes | WCAG 1.4.4 |
| 4 | `replyButton` title hardcoded `"Reply"` — not localized | i18n |
| 5 | `prepareForReuse` did not clear `timestampLabel` → stale timestamp could flash on reuse | Correctness |

## Fix applied

- **Dynamic Type via `UIFontMetrics`**: each label/button wraps its exact
  original point size in `UIFontMetrics(forTextStyle: <matching>).scaledFont(for:)`
  (`subheadline`/`body`/`caption1`/`caption1`) + `adjustsFontForContentSizeCategory
  = true` (labels and `replyButton.titleLabel`). Seed sizes unchanged (14 semibold
  / 15 / 12 / 12 medium) → **pixel-identical at the default content size**, scales
  from there — the same technique used in 182i (`ReplyCell`).
- **VoiceOver**: `isAccessibilityElement = true`; `accessibilityLabel` composed by
  the pure static helper `accessibilityLabel(name:content:time:)` returning
  `"{name}, comment. {content}. {time}"` through
  `String(localized: "comments.comment.a11yLabel", defaultValue:…)`. Making the
  cell a single element also **stops VoiceOver from announcing the two decorative
  non-functional buttons** — one swipe now reads one coherent element.
- **i18n**: `replyButton` title now comes from the pure static
  `replyButtonTitle` → `String(localized: "comments.reply.button",
  defaultValue: "Reply")`.
- **No clipping**: `numberOfLines = 0` on name + timestamp (content already 0).
- **Reuse hygiene**: `prepareForReuse` now clears `timestampLabel.text` and
  `accessibilityLabel`.

## Constraints

- 1 file, 0 logic change (`configure(with:)` signature and layout constraints
  untouched), 0 new test (no test references the cell), 2 new inline i18n keys,
  0 `.xcstrings` edit, 0 visual change at default Dynamic Type.

## Verification status

- Static review only — build + VoiceOver exercised in CI `iOS Tests` (macOS).
  The Linux container here cannot run `xcodebuild`.
- Pattern is a 1:1 mirror of merged 182i (`ReplyCell`) and 176i
  (`LoadMoreRepliesCell`), which passed the same gate.

## CI follow-up (compile fix)

The first CI run (iOS Tests, run 29745037121) failed to **compile** — not a
test failure. `CommentRecord.authorDisplayName` and `.authorUsername` are both
`String?`, so `authorDisplayName ?? authorUsername` is `String?` and cannot be
passed to `accessibilityLabel(name: String)`. This broke **both** the new
`TopLevelCommentCell` and the already-merged `ReplyCell` (182i) — a latent
semantic merge conflict: `ReplyCell` 182i and the change that made
`authorUsername` optional were each green in isolation but red once both landed
on `main`, so `main` was already red before this PR. Fixed in both cells by
coalescing to `?? ""`, which preserves the prior display behavior exactly (a nil
name previously rendered an empty `UILabel`).

## Completion

**RESOLVED** — `TopLevelCommentCell` Dynamic Type + VoiceOver grouping +
"Reply" localization + reuse hygiene done. This closes the comment-cell cluster
(`TopLevelCommentCell` / `ReplyCell` / `LoadMoreRepliesCell` all now Dynamic-Type
and VoiceOver-clean). Next candidates in the same `Cells/` folder for a future
iteration: `MediaPostCell` / `TextPostCell` (verify Dynamic Type + VoiceOver on
their stat rows — some already covered by `PostStatAccessibility`).
