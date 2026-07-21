# Plan — Iteration 210i — `ConversationEncryptionDetailSheet` VoiceOver status row

**Date:** 2026-07-21 · **Track:** iOS (`i`) · **Branch:** `claude/laughing-thompson-o7l1vz` · **Base:** `main` HEAD `22465a5`

## Goal
Make the immutable "Encryption enabled" status row on `ConversationEncryptionDetailSheet` announce meaningfully under VoiceOver instead of an unlabeled "dimmed switch".

## Steps
1. [x] Confirm the gap: disabled empty-label `.labelsHidden()` toggle with no `.accessibilityLabel`; `Text` label is a separate element; file has no other a11y modifiers; no `#Preview`.
2. [x] Hide the decorative `lock.fill` glyph (`.accessibilityHidden(true)`).
3. [x] Combine the HStack row into one VoiceOver element (`.accessibilityElement(children: .combine)`) — pattern from `ActiveSessionsView` (168i).
4. [x] Add `ConversationEncryptionDetailSheetAccessibilityTests` source-level guard (mirror of `ActiveSessionsViewAccessibilityTests`).
5. [x] Docs: analysis + this plan + branch-tracking entry.
6. [ ] Commit + push branch. CI gate: `iOS Tests`.

## Constraints honoured
- 0 new i18n keys (reuses `conversation.encryption.detail.toggleEnabled`).
- 0 logic / 0 network / 0 layout / 0 visual change.
- No rewrite of inherited `main` history (unverified-commit hook flags pre-existing swarm commits, not mine).

## Rejected alternative
`DataExportView`-style `.accessibilityLabel(title)` on the toggle — double-reads with the adjacent visible `Text`; combine is cleaner for a non-interactive status row.
