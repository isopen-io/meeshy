# Plan — Iteration-187i — `FriendRequestListView` empty state → shared `EmptyStateView`

**Target**: `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift`
**Deficit**: bespoke `VStack` empty state duplicating `MeeshyUI.EmptyStateView`
(with a fixed-size hero icon). Now non-regressive to migrate thanks to 181i.

## Steps

1. [x] Sync branch to `origin/main` (HEAD `995ed53`, includes merged 179i + 181i).
2. [x] Confirm target is outside the fleet's hot zones; no test references it; both i18n keys exist.
3. [x] Replace `emptyState`'s hand-rolled `VStack` with `EmptyStateView(icon:title:subtitle:)`, reusing both keys.
4. [x] Verify `import MeeshyUI` present and `theme` still used (13 other usages).
5. [x] Write analysis + plan docs; update `branch-tracking.md`.
6. [ ] Commit + push branch.
7. [ ] Open PR; watch CI `iOS Tests`.

## Non-goals

- No new i18n key (both `friends.requests.empty.title/subtitle` reused).
- No change to `friendRequestRow` / list / accept-reject actions.
- No change to `EmptyStateView` (already Dynamic-Type-correct via 181i).
