# Plan — Iteration-168i — `BookmarksView` empty state consolidation

**Base**: `main` HEAD `a00389a` · **Branch**: `claude/laughing-thompson-sfei6s`

## Goal
Remove a bespoke empty-state reimplementation in `BookmarksView` by delegating
to the shared `MeeshyUI.EmptyStateView` primitive — increasing component reuse,
fixing fragmented VoiceOver, and aligning visual identity with the 10 other
empty-state sites.

## Steps
1. [x] Sync `claude/laughing-thompson-sfei6s` onto `origin/main` (`a00389a`).
2. [x] Confirm `EmptyStateView` is `public` in `MeeshyUI`, env-free, signature `(icon:title:subtitle:)`.
3. [x] Confirm no open PR touches `BookmarksView` (0 contention) and no test asserts its empty-state UI.
4. [x] Add `import MeeshyUI`.
5. [x] Replace bespoke `VStack` empty state with `EmptyStateView(...)`, reusing the 2 existing i18n keys + preserving `.padding(.top, 80)`.
6. [x] Verify `theme` still referenced (`backgroundGradient`) → no dead env object.
7. [x] Write analysis + update `branch-tracking.md` pointer to 168i.
8. [ ] Commit + push branch. Gate = CI `iOS Tests`.

## Non-goals
- No ViewModel / logic change.
- No new i18n key, no `.xcstrings` edit.
- No change to the shared `EmptyStateView` component itself.

## Risk
Minimal — single-file, mirrors an established pattern used in 10 sites. Linux
dev host has no Xcode → compile verification is CI-side.
