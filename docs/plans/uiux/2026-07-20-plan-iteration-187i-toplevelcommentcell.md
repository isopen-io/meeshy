# Plan — Iteration-187i — TopLevelCommentCell

**Base**: `main` HEAD `fd48b02` (187i)
**Branch**: `claude/laughing-thompson-8w91gh`
**File**: `apps/ios/Meeshy/Features/Main/Views/Cells/TopLevelCommentCell.swift`

## Goal
Bring the top-level comment cell to Dynamic Type + VoiceOver + localization parity
with the 182i `ReplyCell`, adapted for an interactive (like/reply) cell.

## Steps
1. [x] Confirm no contention (19 open iOS PRs — none touch comment cells).
2. [x] Scale all 4 frozen fonts via `UIFontMetrics.scaledFont` seeded at original
       sizes; `adjustsFontForContentSizeCategory = true`; scale like glyph via
       `SymbolConfiguration(textStyle:)`.
3. [x] `numberOfLines = 0` on name + timestamp.
4. [x] Localize `"Reply"` → `comments.action.reply` (inline `String(localized:)`).
5. [x] VoiceOver: group text into `contentLabel` (composed label via pure static
       helper `comments.comment.a11yLabel`), hide avatar/name/timestamp, label the
       like button (`comments.action.like`), fix `accessibilityElements` order.
6. [x] Close timestamp reuse leak in `prepareForReuse`.
7. [x] Analysis doc + plan doc + tracking pointer.
8. [ ] Commit, push, open PR, subscribe to PR activity.

## Non-goals
- No behavior/logic change (`configure` contract stable).
- No wiring of the non-functional like/reply buttons (product decision).
- No `.xcstrings` reformat (inline keys only).
