# Plan — Iteration 208i (iOS): `CallView.endedView` retry CTA → `MeeshyColors.success`

**Track**: iOS UI/UX (`i`) · **Date**: 2026-07-21 · **Branch**: `claude/laughing-thompson-1lwf1p`
**Base**: `origin/main` HEAD `22465a5`

## Goal
Remove the last raw system-color literal in `CallView.swift` by routing the
call-ended **"Réessayer"** CTA capsule through the design-system green token,
matching the app-wide `MeeshyColors.success` (`#34D399`).

## Steps
1. [x] Locate the single raw `Color.<system>` in `CallView.swift` → `Color.green` at the retry CTA (`endedView`, ~line 1480).
2. [x] Confirm `import MeeshyUI` present (`CallView:5`) and `MeeshyColors.success` is a public `Color` (`MeeshyUI/Theme/MeeshyColors.swift:43`).
3. [x] Swap `Capsule().fill(Color.green)` → `Capsule().fill(MeeshyColors.success)`.
4. [x] Verify no other raw system color remains in the file.
5. [x] Collision check via `list_pull_requests` — `CallView.swift` absent from all open PRs.
6. [x] Write analysis + this plan; append `branch-tracking.md` pointer.
7. [ ] Commit, push, open PR; gate = CI `iOS Tests`.

## Constraints honored
- 1 file, 1 line; 0 logic / 0 network / 0 layout / 0 new i18n key / 0 new test.
- Hue-consistent (green→brand green); no semantic change to the CTA.
