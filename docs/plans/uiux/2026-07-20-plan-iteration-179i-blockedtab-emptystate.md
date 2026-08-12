# Plan — Iteration-179i — `BlockedTab` empty state → shared `EmptyStateView`

**Target**: `apps/ios/Meeshy/Features/Contacts/BlockedTab.swift`
**Deficit**: bespoke `VStack` empty state duplicating `MeeshyUI.EmptyStateView`
(the sibling `CallsTab` in the same folder already uses the shared primitive).

## Steps

1. [x] Sync branch `claude/laughing-thompson-n2i97z` to `origin/main` (HEAD `f4ac661`).
2. [x] Confirm no open iOS PR touches `BlockedTab`; confirm no test references it.
3. [x] Replace `emptyState`'s hand-rolled `VStack` with
   `EmptyStateView(icon:title:subtitle:)`, reusing `contacts.blocked.empty`
   and adding `contacts.blocked.empty-subtitle`.
4. [x] Verify `import MeeshyUI` present (it is) and `theme` still used elsewhere.
5. [x] Write analysis + plan docs.
6. [ ] Commit + push branch.
7. [ ] Open PR; watch CI `iOS Tests`.
8. [ ] Update `branch-tracking.md` pointer after merge.

## Non-goals

- No change to `EmptyStateView` itself (fixed-size title vs. Dynamic Type is a
  cross-cutting concern for all 12 consumers — out of scope for this focused
  iteration).
- No removal of the pre-existing dead `isDark` property (unrelated cleanup).
- No change to `blockedList` / `blockedRow` / unblock alert (already localized
  + accessible).
