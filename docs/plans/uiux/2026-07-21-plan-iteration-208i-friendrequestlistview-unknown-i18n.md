# Plan — Iteration 208i (iOS UI/UX)

## Goal
Localize the last hardcoded user-visible string in `FriendRequestListView` — the
`"Inconnu"` sender-name fallback — by reusing the established `common.unknown`
key, mirroring `RequestsTab.swift`.

## Steps
1. `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift:99`
   `?? "Inconnu"` → `?? String(localized: "common.unknown", defaultValue: "Inconnu", bundle: .main)`.
2. Write analysis + this plan under `docs/{analyses,plans}/uiux/`.
3. Update `docs/plans/uiux/branch-tracking.md` pointer.
4. Commit on `claude/laughing-thompson-auc74u`, push, open PR, subscribe.

## Constraints
- 0 new i18n key (key is build-extracted, referenced by 4 sibling sites).
- 0 logic / 0 network / 0 layout / 0 visual change (`defaultValue` == old literal).
- 1 code file, 1 line.

## Verification
- Gate = CI `iOS Tests` (no Swift toolchain locally).
- Static parity with `RequestsTab.swift:119`.

## Sync
- Base: `main` HEAD `22465a5` (Merge PR #2214).
- Working branch: `claude/laughing-thompson-auc74u` (reset fresh from main; prior
  202i history merged via #2216).
- Iteration: 208i.
