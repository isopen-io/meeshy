# Plan — Iteration-178i — `ConversationView+ScrollIndicators` i18n + VoiceOver

**Date:** 2026-07-20 · **Scope:** iOS only · **Base:** `main` HEAD `97e8b6d`
**Branch:** `claude/laughing-thompson-urnn2a`

## Goal

Localize the scroll-to-bottom button's three hardcoded-French `String`
properties and align them with existing single-source-of-truth keys.

## Steps

1. `unreadAttachmentTypeLabel` → reuse `attachment.label.{photo,video,audio,
   file,location}` (same keys + defaults as `ConversationView+Composer`).
2. `typingLabel` → reuse `typing.named` / `typing.double` / `typing.several`
   (canonical typing keys, 5-language-translated), mirroring
   `MessageListViewController`.
3. `scrollToBottomAccessibilityLabel` → 2 new inline-`defaultValue` keys
   (`conversation.scroll-to-bottom.a11y`, `…a11y-unread`), French defaults,
   corrected `défiler` accent; compose state prefix + action.

## Constraints

- 1 file, 0 logic, 0 new test, no `.xcstrings` manual edit (inline defaults).
- Reuse over new keys; identical defaults where a key is shared (no catalog
  conflict).

## Validation

- Static review (APIs iOS 16.0+, precedent confirmed).
- No test references the touched members; SDK `ConversationScrollControlsViewTests`
  targets a different `typingLabel(for:)`.
- Gate: CI `iOS Tests` green before merge.
