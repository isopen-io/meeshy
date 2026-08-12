# Plan — Iteration 196i — `ActiveSessionsView` empty-state dedup

## Goal
Replace the bare icon-less `Text` empty state of `ActiveSessionsView` with the shared native
`AdaptiveContentUnavailableView`, for HIG/design-system/Dynamic-Type/VoiceOver parity with the
5+ screens already using it (last done: `FriendRequestListView` 185i).

## Steps
1. [x] Sync branch `claude/laughing-thompson-jv0fs5` from latest `main` (HEAD `d1c2287`).
2. [x] Verify no open PR touches `ActiveSessionsView` (swarm ≤195i, `list_pull_requests`).
3. [x] Refactor `content`'s empty branch → `emptyState` computed property using
       `AdaptiveContentUnavailableView(title, systemImage:, description:)`.
4. [x] Reuse `sessions_empty` for the title; add `sessions_empty_subtitle` (inline FR default).
5. [x] `systemImage: "laptopcomputer.and.iphone"` (iOS 16.0, within floor).
6. [x] Keep the 168i a11y structure (rows/header/revoke untouched).
7. [x] Add a source-level guard `test_emptyState_usesNativeContentUnavailableView`.
8. [x] Write analysis + plan docs; update `branch-tracking.md`.
9. [ ] Commit + push; open PR; gate on CI `iOS Tests`.

## Non-goals
- No ViewModel / logic / network change.
- No change to rows, header, revoke buttons, or colors.
- No catalog file edit (inline `defaultValue` keys; Xcode auto-extracts at build).

## Verification
- Linux env → no local Xcode build; rely on CI `iOS Tests`.
- Pre-existing 168i guards + new 196i guard assert VoiceOver structure statically.
