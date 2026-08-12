# Plan — Iteration-160i — MessageForwardDetailView VoiceOver a11y

**Date:** 2026-07-18 · **iOS only** · **Base:** `main` HEAD `5ce47f8`
**Working branch:** `claude/laughing-thompson-bb8upc`

## Goal

Bring the embedded "Forward" tab (`MessageForwardDetailView`) to VoiceOver
parity with its SSOT sibling `ForwardPickerSheet`, reusing existing i18n keys.

## Steps

1. [x] Confirm `ForwardPickerSheet` a11y treatment + i18n keys (SSOT reference).
2. [x] `.accessibilityHidden(true)` on decorative search `magnifyingglass`.
3. [x] `common.clear-search` label on the clear-search button.
4. [x] `.accessibilityElement(children: .combine)` on the conversation row text block.
5. [x] Label send button (`forward.send-a11y` + `conv.name`), sent checkmark
       (`forward.sent`), sending spinner (`forward.sending`).
6. [x] Hide decorative empty-state glyph + combine the empty-state container.
7. [x] Author analysis doc (`docs/analyses/uiux/2026-07-18-iteration-160i-*`).
8. [ ] Commit, push, open PR (CI gate: `ios-tests`).

## Non-goals

- No new i18n keys (pure SSOT reuse).
- No logic / networking / layout changes.
- No Dynamic Type migration (fonts already semantic; decorative glyph frozen).
- Not touching `MessageDetailSheet.forwardTabContent` legacy copy (follow-up).

## Risk

Minimal — annotation-only, +8 lines, 0 logic. Contention checked: no open PR
targets this file (open iOS PRs cover Views/Reactions/Sentiment/other MessageDetail
siblings, not Forward).
