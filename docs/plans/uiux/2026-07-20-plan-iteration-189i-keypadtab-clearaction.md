# Plan — Iteration-189i (iOS)

**Date:** 2026-07-20
**Branch:** `claude/laughing-thompson-hub0lm` (from `main` HEAD `45f36bf`)
**Scope:** iOS only — Accessibility (VoiceOver custom action + hint)
**Target:** `apps/ios/Meeshy/Features/Contacts/KeypadTab.swift`

## Problem

The Keypad tab's `inputBar` delete `Button` carries two behaviours — tap
`deleteLast()` and long-press `clear()`. The long-press "clear all" was bound
only via `.simultaneousGesture(LongPressGesture...)`, which VoiceOver does not
surface, so clear-all was **unreachable** under VoiceOver (explicit 181i
follow-up). The bare `"Effacer"` label also gave no signal that the primary
activation deletes only the last character.

## Fix

- Add `.accessibilityAction(named: "Tout effacer")` → `viewModel.clear()` +
  `HapticFeedback.medium()` (same body as the long-press handler) so clear-all
  becomes a discoverable VoiceOver custom action.
- Add `.accessibilityHint("Efface le dernier caractère")` to clarify the
  primary double-tap.
- Keep the `LongPressGesture` for sighted users — 0 visual/behaviour change.

## Steps

1. [x] Sync working branch from latest `main` (HEAD `45f36bf`).
2. [x] Confirm target free of collision (`list_pull_requests` — no open PR
   touches `KeypadTab`; highest number in flight is 188i → this is **189i**).
3. [x] Add custom action + hint; preserve long-press gesture.
4. [x] Write analysis doc + update `branch-tracking.md`.
5. [ ] Commit + push; open PR; confirm `iOS Tests` green.

## Constraints honored

- 1 file, 0 logic change (`clear()`/`deleteLast()`/haptics unchanged).
- 0 new test (no test references the view; VM methods already covered).
- 2 new i18n keys inline `defaultValue` (`keypad.delete.a11y.hint`,
  `keypad.clear.a11y`) — no `.xcstrings` edit.
- 0 visual change at any Dynamic Type size; Indigo/localization untouched.

## Gate

CI `iOS Tests` (macOS runner) — build + VoiceOver run happens in CI (Linux
container here).
