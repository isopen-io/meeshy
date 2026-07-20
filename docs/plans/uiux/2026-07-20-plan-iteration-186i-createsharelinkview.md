# Plan — Iteration-186i — VoiceOver structure for CreateShareLinkView

**Date:** 2026-07-20
**Scope:** iOS only — `apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift`
**Base:** `main` HEAD `5c55a06`
**Branch:** `claude/laughing-thompson-u5ule2`

## Goal

Add a complete VoiceOver structure to the share-link creation form (previously
0 accessibility annotations), without any visual, logic, or localization change.

## Steps

1. **Conversation picker button** (`conversationSection`) — stateful
   `.accessibilityLabel` (selected `"{name}, {type}"` / empty
   `choose_group`) + `.accessibilityHint`; hide the trailing chevron.
2. **`iconBadge` helper** — `.accessibilityHidden(true)` (covers all rule
   toggles, both limit rows, the conversation type icon).
3. **`formSection` header** — hide decorative icon, add `.isHeader` to title.
4. **`formTextField`** — hide the visible label from VoiceOver, set
   `.accessibilityLabel(label)` on the `TextField` (stop placeholder-as-name).
5. **`ConversationPickerSheet` rows** — `.combine` + `.isSelected` trait, hide
   the decorative checkmark glyph.

## Constraints

- No `.xcstrings` edit — 1 new key inline as `defaultValue`
  (`share.link.create.conversation.a11yHint`); all others reuse existing keys.
- No logic/visual change; reuse existing `displayLabel` for the selected label.
- Idioms copied from shipped `NewConversationView` (`.isSelected` rows),
  `EmailVerificationView` (`.isHeader`), `ContactsListTab` (combine).

## Validation

- CI `iOS Tests` (macOS) is the gate — Linux container cannot build iOS.
- No test references the view (grep verified); 0 open-PR contention.
