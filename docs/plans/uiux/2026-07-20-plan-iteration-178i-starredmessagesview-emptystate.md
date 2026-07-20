# Plan — Iteration-178i — `StarredMessagesView` empty state → shared `EmptyStateView`

**Date**: 2026-07-20
**Track**: iOS (suffix `i`)
**Branch**: `claude/laughing-thompson-ajrx2g`
**Base**: `main` HEAD `90d9646`

## Objective

Eliminate the last bespoke empty state among the "personal collection" screens
by delegating `StarredMessagesView`'s empty state to the shared
`MeeshyUI.EmptyStateView` primitive — the same consolidation applied to
`BookmarksView` in 168i.

## Steps

1. [x] Sync branch fresh from latest `main` (168i merged as #2095).
2. [x] Read shared `EmptyStateView` signature + 168i precedent.
3. [x] Confirm no test references the view's empty state (only the store).
4. [x] Confirm no open iOS PR touches `StarredMessagesView`.
5. [x] Replace bespoke `VStack` with `EmptyStateView(icon:title:subtitle:)`,
       reusing both localization keys verbatim.
6. [x] Verify `theme` / `MeeshyColors` still referenced (imports stay valid).
7. [x] Write analysis + plan docs.
8. [ ] Commit + push to designated branch.

## Non-goals

- No change to `StarredMessagesStore`, row layout, toolbar, or navigation.
- No new localization keys.
- No touch to any other screen.

## Risk

Minimal — 1-file, view-only, no logic. Build gate is CI `iOS Tests`
(Linux host has no Xcode).
