# Plan — Iteration-181i — shared `EmptyStateView` → Dynamic Type

**Target**: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift`
**Deficit**: 4 fixed `.system(size:)` fonts (icon, title, subtitle, button) that
do not scale with Dynamic Type — inherited by 12+ consumer screens.

## Steps

1. [x] Sync branch to `origin/main` (HEAD `e5f9cb6`, includes 179i merge #2111).
2. [x] Discover root cause: bespoke empty-state migrations kept regressing
   Dynamic Type because the shared primitive itself uses fixed `.system(size:)`.
3. [x] Confirm `MeeshyFont.relative` is public, same-module, already used in MeeshyUI.
4. [x] Swap the 4 `.system(size:)` calls → `MeeshyFont.relative(...)` (same base sizes, weights preserved).
5. [x] Confirm no signature change → all 12+ call sites compile unchanged; no test references.
6. [x] Write analysis + plan docs; update `branch-tracking.md`.
7. [ ] Commit + push branch (`claude/laughing-thompson-n2i97z`, force-with-lease over merged 179i history).
8. [ ] Open PR; watch CI `iOS Tests`.

## Non-goals

- No API/signature change to `EmptyStateView` (call sites untouched).
- No migration of additional bespoke empty states this iteration (queued:
  `RequestsTab`, `FriendRequestListView`, etc. — now non-regressive thanks to
  this fix; `CommunityLinksView` explicitly *not* a target since it already uses
  `MeeshyFont.relative` and full a11y).
- No visual redesign — same base sizes, default-setting rendering unchanged.
