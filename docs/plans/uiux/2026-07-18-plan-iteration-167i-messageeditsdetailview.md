# Plan — Iteration-167i — MessageEditsDetailView i18n + VoiceOver

**Date:** 2026-07-18 · **iOS only** · **Base:** `main` HEAD `019762584`
**Working branch:** `claude/laughing-thompson-bb8upc`

## Goal

Remove the hardcoded French strings from the message "Edit history" tab
(`MessageEditsDetailView`) — making it localizable — and give it the VoiceOver
grouping its sibling MessageDetail tabs already have.

## Steps

1. [x] Confirm no `.stringsdict` in app → inline singular/plural key selection.
2. [x] Route 6 literals through `String(localized:defaultValue:)` (French text preserved exactly).
3. [x] Add `revisionCountLabel(_:)` helper (singular/plural detail).
4. [x] VoiceOver: hide decorative banner icon, empty-state glyph, redundant count badge.
5. [x] `.combine` on banner, revision rows, empty-state container.
6. [x] Author analysis doc.
7. [ ] Commit, push, open PR (CI gate: `ios-tests`).

## Non-goals

- No change to French rendering (defaultValue == prior literal, ASCII-exact).
- No logic / networking / layout changes.
- No Dynamic Type migration (fonts already semantic; decorative glyph frozen).
- Not touching `MessageDetailSheet` legacy inline copies (follow-up).

## Risk

Low — 1 file, pure string routing + a11y annotations, zero base-locale diff.
Contention checked: no open PR targets this file (next-highest iteration is 166i
= MessageTranscriptionDetailView, a different file).
