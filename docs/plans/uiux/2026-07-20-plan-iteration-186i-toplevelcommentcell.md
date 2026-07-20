# Plan — Iteration-186i (iOS) — TopLevelCommentCell Dynamic Type + i18n + VoiceOver

**Date:** 2026-07-20 · **Branch:** `claude/laughing-thompson-p6x4jf` · **Base:** `main` HEAD `64f943d`

## Goal
Close the comment-thread cell trio by applying the proven merged-182i
`ReplyCell` treatment to its top-level sibling `TopLevelCommentCell`:
Dynamic Type, i18n of the visible `"Reply"` literal, and VoiceOver grouping.

## Steps
1. Wrap all fixed `.systemFont(ofSize:)` (name 14 semibold, content 15,
   timestamp 12, reply-button 12 medium) in `UIFontMetrics(...).scaledFont(for:)`
   + `adjustsFontForContentSizeCategory = true`; text-styles match adjacent
   `ReplyCell`. Seeds preserved → pixel-identical at default size.
2. Localize the `replyButton` title via existing `a11y.comment.reply` (manual,
   5-language, 0 new visible key).
3. `numberOfLines = 0` on name + timestamp (anti-clip at large Dynamic Type).
4. `isAccessibilityElement = true` + composed `accessibilityLabel` helper
   (`comments.comment.a11yLabel`, inline default — 1 new key, mirrors ReplyCell).
5. Clear `timestampLabel` + `accessibilityLabel` in `prepareForReuse`.

## Guardrails
- 1 file. 0 logic / 0 layout-constraint / 0 network change.
- Non-functional decorative like/reply buttons folded into the single cell
  element (no dead-button VoiceOver focus); real actions = future iteration.
- Gate = CI `iOS Tests` (Linux container cannot run `xcodebuild`).

## Sync
- last synchronized commit: `64f943d` (origin/main)
- source branch: `main`
- working branch: `claude/laughing-thompson-p6x4jf`
- iteration: **186i**
- status: ⏳ pushed, PR pending
