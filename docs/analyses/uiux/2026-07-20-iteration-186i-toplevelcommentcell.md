# Analysis — Iteration-186i (iOS) — TopLevelCommentCell Dynamic Type + i18n + VoiceOver

**Date:** 2026-07-20
**Scope:** iOS only
**File:** `apps/ios/Meeshy/Features/Main/Views/Cells/TopLevelCommentCell.swift`
**Call site:** `CommentListViewController.swift` (top-level comment `CellRegistration`)

## Context

`TopLevelCommentCell` is the UIKit `UICollectionViewCell` shown for each
top-level comment in a post's comment thread (its indented sibling `ReplyCell`
was fixed in the merged **182i**). It was the **explicitly named next
candidate** in the 182i completion note:

> *"Remaining sibling candidate: `TopLevelCommentCell` (same fixed fonts **plus**
> a hardcoded `"Reply"` button title and non-Dynamic-Type interactive buttons →
> larger i18n + a11y-for-controls scope, own iteration)."*

Verified via `list_pull_requests`: **no** open PR touches this file (highest
iOS iteration in flight = 185i).

## Deficits found

| # | Deficit | HIG / WCAG |
|---|---------|------------|
| 1 | `nameLabel`/`contentLabel`/`timestampLabel` fonts pinned to `.systemFont(ofSize: 14/15/12)` — no Dynamic Type | WCAG 1.4.4 (Resize Text) |
| 2 | `replyButton` title **hardcoded `"Reply"`** (English literal, never localized) | i18n |
| 3 | `replyButton` title font pinned to `.systemFont(ofSize: 12, weight: .medium)` — no Dynamic Type | WCAG 1.4.4 |
| 4 | Cell not an accessibility element — VoiceOver reads 3 disconnected fragments, no "who/what/when" identity | HIG Accessibility (grouping) |
| 5 | `nameLabel`/`timestampLabel` at default `numberOfLines = 1` → clip at large content sizes | WCAG 1.4.4 |
| 6 | `prepareForReuse` did not clear `timestampLabel` / `accessibilityLabel` → stale timestamp could flash on reuse | Correctness |

### Note on the like/reply buttons

`likeButton` and `replyButton` currently have **no target-action** — neither in
the cell nor at the `CommentListViewController` registration (grep-verified
across `apps/ios`). `configure(with:)` never sets a like count, like-state, or
avatar image either. They are **non-functional decorative chrome** today.
Folding them into a single coherent cell element (exactly as the proven sibling
`ReplyCell` does) is therefore strictly better than exposing dead buttons to
VoiceOver — a focusable button that does nothing is a worse experience than one
clean read. Wiring real like/reply actions (and the a11y controls that would
then be required) is a separate future iteration.

## Fix applied (1:1 mirror of merged 182i `ReplyCell`)

- **Dynamic Type via `UIFontMetrics`**: each label + the button title wraps its
  exact original point size in `UIFontMetrics(forTextStyle: <matching>)
  .scaledFont(for:)` (`footnote`/`body`/`caption2`/`caption2`) +
  `adjustsFontForContentSizeCategory = true`. Text-style choices **match the
  adjacent `ReplyCell`** (they render together in the same list). Because the
  seed sizes are unchanged (14 semibold / 15 / 12 / 12 medium), the cell is
  **pixel-identical at the default content size** and scales from there.
- **i18n**: `replyButton` title → `String(localized: "a11y.comment.reply",
  defaultValue: "Reply")` — an **existing `manual` (non-prunable) key** already
  translated in **all 5 languages** (`Reply`/`Répondre`/`Responder`/`Antworten`).
  **0 new visible-string key.** (`action.reply` was rejected: `extractionState`
  is `stale` → prunable.)
- **VoiceOver**: `isAccessibilityElement = true`; `accessibilityLabel` composed
  by the pure static helper `accessibilityLabel(name:content:time:)` returning
  `"{name}, comment. {content}. {time}"` through `String(localized:
  "comments.comment.a11yLabel", defaultValue:…)`. One swipe now reads a coherent
  element (mirror of ReplyCell's `comments.reply.a11yLabel`).
- **No clipping**: `numberOfLines = 0` on name + timestamp (content already 0).
- **Reuse hygiene**: `prepareForReuse` now clears `timestampLabel.text` and
  `accessibilityLabel`.

## Constraints

- 1 file, **0 logic change** (`configure(with:)` signature, layout constraints,
  and indent math untouched), 0 new test (no test references the cell), **1 new
  inline i18n key** (`comments.comment.a11yLabel`, inline `defaultValue`, 0
  `.xcstrings` edit — same approach as merged 182i), **1 reused visible key**
  (`a11y.comment.reply`), 0 visual change at default Dynamic Type.

## Verification status

- Static review only — build + VoiceOver exercised in CI `iOS Tests` (macOS).
  The Linux container here cannot run `xcodebuild`.
- Pattern is a 1:1 mirror of merged 182i (`ReplyCell`), which passed the same
  gate.

## Completion

**RESOLVED** — `TopLevelCommentCell` Dynamic Type + i18n + VoiceOver + reuse
hygiene done. This closes the comment-thread cell trio (`ReplyCell` 182i,
`LoadMoreRepliesCell` 176i, `TopLevelCommentCell` 186i). Next candidates: feed
post cells `TextPostCell` / `MediaPostCell` (same `.systemFont(ofSize:)` fixed
fonts on `likeButton.titleLabel`, own iteration — verify swarm collision first).
