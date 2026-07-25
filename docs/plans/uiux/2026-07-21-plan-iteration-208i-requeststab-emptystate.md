# Plan — Iteration 208i — `RequestsTab` empty-state consolidation

**Base**: `main` HEAD `22465a5` · **Branch**: `claude/laughing-thompson-nyyqpk`

## Objective
Consolidate the bespoke `RequestsTab.emptyState` VStack onto the shared
`AdaptiveContentUnavailableView` primitive (native `ContentUnavailableView` iOS 17+,
iOS 16 fallback), adding guidance subtitles — parity with the twin `FriendRequestListView`
(175i) and the 183i design-system doctrine.

## Steps
1. [x] Reset designated branch to latest `main` (`22465a5`).
2. [x] Confirm target uncontended (10 open iOS PRs enumerated — none touch `RequestsTab`).
3. [x] Read primitive signature `AdaptiveContentUnavailableView(_:systemImage:description:)`
       and the twin usage in `FriendRequestListView` (175i).
4. [x] Verify i18n convention (inline `defaultValue`, build-extracted — no `.xcstrings`).
5. [x] Replace `emptyState(icon:text:)` → `emptyState(icon:title:subtitle:)` delegating to
       the primitive; update `.received` / `.sent` call sites with 2 new inline subtitle keys.
6. [x] Verify `import MeeshyUI` present, `theme` still referenced, no unused warnings.
7. [x] Write analysis + this plan; update `branch-tracking.md` pointer.
8. [ ] Commit, push `-u origin claude/laughing-thompson-nyyqpk`.

## Non-goals
- No behavior/logic/network change; no test added; no `.xcstrings` edit; no SDK change.
- No touching the row layouts, filter pills, or `isDark` (pre-existing declared-only).

## Gate
CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run sim iOS 18.2) — no local toolchain.
