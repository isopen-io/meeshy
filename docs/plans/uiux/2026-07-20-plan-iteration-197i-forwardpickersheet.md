# Plan — Iteration-197i — `ForwardPickerSheet` failure feedback + i18n

**Branch:** `claude/laughing-thompson-on24d7` (base `main` HEAD `9dd48f6`)
**Scope:** iOS only · 2 files · 0 SDK · 0 new test

## Problem

`ForwardPickerSheet` (`.sheet`, medium/large detents) had three silent/misleading
failure modes and was fully unlocalized:

1. Send failure → dead `errorMessage` state (assigned, never rendered) + haptic
   only. A root `FeedbackToast` renders behind the sheet, so it can't be the fix.
2. Cold-start load failure → misleading "Aucune conversation" (no retry).
3. Empty state was a bespoke title-only VStack duplicating `EmptyStateView`.
4. All 11 `forward.*` strings missing from `Localizable.xcstrings` → French shown
   in every locale.

## Changes

`ForwardPickerSheet.swift`
- Remove dead `errorMessage`; add `failedToIds: Set<String>` + `loadFailed: Bool`.
- `sendButton`: add 4th state `failedToIds.contains(id)` → tappable retry
  (`exclamationmark.arrow.circlepath`, `MeeshyColors.error`, VoiceOver label
  `forward.retry-send-a11y`). `forwardTo` clears on start, sets on `catch`.
- Body: new `conversations.isEmpty && loadFailed` branch → `EmptyStateView`
  (`wifi.slash` + Retry) reusing `conversations.error.*`; migrate empty branch to
  `EmptyStateView` with `forward.empty` + new `forward.empty.subtitle`.
- `refreshConversations`: set/clear `loadFailed`; add `retryLoad()`.
- `import MeeshyUI`.

`Localizable.xcstrings`
- Add 11 `forward.*` keys × 5 languages (de/en/es/fr/pt-BR).

## Reuse

- `MeeshyUI.EmptyStateView` (shared primitive, `actionLabel`/`onAction`).
- `conversations.error.title/subtitle/retry` (already-translated, identical op).

## Gate

CI `iOS Tests` (compile on macOS runner). No local Xcode (Linux env).

## Status

- [x] Swift edits
- [x] i18n keys (JSON re-validated, 1276 keys)
- [x] Analysis + plan docs
- [ ] Push + CI green
