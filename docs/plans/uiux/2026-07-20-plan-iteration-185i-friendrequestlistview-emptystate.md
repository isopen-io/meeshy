# Plan — Iteration 185i — `FriendRequestListView` empty state dedup

**Branch**: `claude/laughing-thompson-83jk3i` (from `main` HEAD)
**Files**: `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift` (1)

## Goal

Replace the hand-rolled empty-state `VStack` with the design-system
`EmptyStateView`, aligning the People-hub empty states and removing the file's
last `.system(size:)` — no new i18n keys, no logic change.

## Steps

1. [x] Sync working branch to latest `main` HEAD.
2. [x] Verify no open PR touches `FriendRequestListView` (`list_pull_requests`).
3. [x] Confirm `EmptyStateView` is the People-hub SSOT (sibling `CallsTab`,
       `BlockedUsersView`); confirm its VoiceOver + Dynamic Type behaviour.
4. [x] Swap `emptyState` body → `EmptyStateView(icon:title:subtitle:)` reusing
       `friends.requests.empty.title` / `.subtitle`.
5. [x] Verify: no remaining `.system(size:)`; `theme` still used; `MeeshyUI`
       imported.
6. [x] Write analysis + plan; update `branch-tracking.md`.
7. [ ] Commit + push to designated branch. Gate = CI **iOS Tests**.

## Risk / rollback

Minimal: cosmetic swap to an existing, widely-adopted component. Icon color
shifts from muted-gray to brand-tinted (intended consistency alignment).
Rollback = revert the single edit.
