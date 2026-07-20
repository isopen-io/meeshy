# Iteration-187i — TopLevelCommentCell (Dynamic Type + i18n + VoiceOver)

**Date**: 2026-07-20
**Scope**: iOS only — `apps/ios/Meeshy/Features/Main/Views/Cells/TopLevelCommentCell.swift`
**Type**: Accessibility (Dynamic Type + VoiceOver structure) + Localization

## Context

Direct sibling follow-up to **182i** (`ReplyCell`), explicitly flagged in the
182i tracking pointer:

> ⚠️ `ReplyCell` Dynamic Type + VoiceOver SOLDÉ. Suite sibling possible :
> `TopLevelCommentCell` (mêmes fonts figées **+** titre `"Reply"` en dur + boutons
> like/reply non-Dynamic Type → scope i18n + a11y-contrôles plus large, itération dédiée).

`TopLevelCommentCell` is the UIKit `UICollectionViewCell` rendering a top-level
comment row in a threaded comment feed (`CommentListViewController`, registration
`commentReg`). Unlike `ReplyCell` (pure display), it also carries two controls
(like heart, reply button) — so the a11y treatment differs: the text is grouped
into ONE VoiceOver element while the controls stay separate, labeled elements.

## Deficits found

1. **0 Dynamic Type** — 4 frozen fonts:
   - `nameLabel` `.systemFont(ofSize: 14, weight: .semibold)`
   - `contentLabel` `.systemFont(ofSize: 15)`
   - `timestampLabel` `.systemFont(ofSize: 12)`
   - `replyButton.titleLabel` `.systemFont(ofSize: 12, weight: .medium)`
   None scaled with the user's text-size setting → text stays 15pt at the
   largest accessibility sizes (WCAG 1.4.4 Resize Text).
2. **Hardcoded English string** — `replyButton.setTitle("Reply", ...)` — never
   localized (the only literal string in the file).
3. **0 VoiceOver structure** — the cell was not organized:
   - name / content / timestamp swept as 3 disconnected fragments (no who/what/when
     identity).
   - `likeButton` is a bare SF Symbol heart with **no accessible text** → VoiceOver
     announced "button" with no meaning (sense carried by the glyph only — WCAG 1.1.1).
   - decorative `avatarView` exposed as an empty element.
4. **Truncation at large sizes** — `nameLabel` / `timestampLabel` default to
   `numberOfLines = 1` → clip once Dynamic Type scales them.
5. **Stale-timestamp reuse leak** — `prepareForReuse` cleared `contentLabel` +
   `nameLabel` but NOT `timestampLabel` → a recycled cell could briefly flash the
   previous row's timestamp (same class of bug fixed for `ReplyCell` in 182i).

## Fix

Mirror the 182i `ReplyCell` pattern, adapted for an interactive cell:

- **Dynamic Type**: every font → `UIFontMetrics(forTextStyle:).scaledFont(for:)`
  **seeded at the original point size** (name→`.subheadline`/14, content→`.body`/15,
  timestamp→`.caption1`/12, reply title→`.caption1`/12). Seeding at the original
  size means **0 visual change at the default content size**; scaling only kicks in
  beyond it. `adjustsFontForContentSizeCategory = true` on all. The like heart gets
  `SymbolConfiguration(textStyle: .footnote)` so the glyph scales with the row too.
- **numberOfLines = 0** on `nameLabel` + `timestampLabel` (no clip at large sizes;
  `contentLabel` was already 0).
- **i18n**: `"Reply"` → `String(localized: "comments.action.reply", defaultValue:
  "Reply")`. Inline key (no `.xcstrings` edit — matches 182i approach; xcstrings
  auto-extracts at build, inline default is the fallback).
- **VoiceOver structure** (interactive-cell shape):
  - `contentLabel` becomes the single text element, its `accessibilityLabel`
    composed via a pure static helper: `"{name}, comment. {content}. {time}"`
    (`comments.comment.a11yLabel`, inline).
  - `nameLabel` / `timestampLabel` / `avatarView` → `isAccessibilityElement = false`.
  - `likeButton` → `accessibilityLabel = "Like"` (`comments.action.like`, inline).
  - `replyButton` labelled by its localized title.
  - `accessibilityElements = [contentLabel, likeButton, replyButton]` fixes a clean
    read order: comment text → Like → Reply.
- **Reuse leak**: `prepareForReuse` now also clears `timestampLabel.text` and resets
  `contentLabel.accessibilityLabel`.

## Constraints respected

- **0 logic change** — `configure(with:)` contract unchanged; no behavior touched.
  The like/reply buttons remain visual-only (no `addTarget` exists anywhere — wiring
  them is a product decision, out of scope for this a11y/i18n pass).
- **0 color / palette change**.
- **1 file**, +49 / −8.
- **3 new i18n keys** inline (`comments.action.reply`, `comments.action.like`,
  `comments.comment.a11yLabel`) — no `.xcstrings` reformat.
- **No tests reference the cell** (grep = 0). Gate = CI `iOS Tests` (compile).

## Verification

- Static review + `git diff`. This is a Linux CI-less environment (no Xcode); the
  build/compile gate is the CI `iOS Tests` job (XcodeGen regenerates the project and
  compiles all Swift under `Meeshy/`).
- Reasoning parity with 182i (`ReplyCell`) which shipped the identical pattern green.

## Status

**RESOLVED** — `TopLevelCommentCell` Dynamic Type + VoiceOver + i18n SOLDÉ. Do not
re-flag: fonts scaled & seeded at original sizes, text grouped into one labeled
VoiceOver element, controls individually labeled with fixed read order, timestamp
reuse leak closed, "Reply" localized.

### Remaining / follow-up candidates

- The like/reply buttons are **non-functional** (no `addTarget` in the codebase) —
  a product/behavior question (wire actions or remove), NOT a UI-polish task.
- `CommentComposerView` / comment input row (if present) — separate scope.
