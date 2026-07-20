# Plan — Iteration-185i — VoiceOver status for the New-Conversation user row

**Date:** 2026-07-20 · **Scope:** iOS only · **Branch:** `claude/laughing-thompson-hj8zjr`

## Goal
Expose online / blocked status of each searched user to VoiceOver in
`NewConversationView`, fixing a WCAG 1.4.1 (colour-only status) gap. Zero visual
change, no new localization keys.

## Steps
1. Add a pure helper `userRowAccessibilityLabel(for:isBlocked:)` composing
   `displayName, @username[, status]`.
2. Apply `.accessibilityLabel(...)` to the row `Button` (keep the existing
   `.accessibilityAddTraits(.isSelected)`).
3. Reuse existing keys `contacts.list.online.lower` and
   `new_conversation.user.blocked` (single source of truth, mirrors 175i
   `ContactsListTab`).

## Constraints honoured
- 1 file, 0 logic, 0 test, 0 catalog edit.
- No `.accessibilityElement(children: .ignore)` on the Button (preserves button
  trait).
- Offline stays silent (matches the visual — the dot is only drawn when online).

## Gate
CI `iOS Tests` (compile + suites). No contention: no open iOS PR touches
`NewConversationView.swift`.
