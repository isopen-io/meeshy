# Plan Iteration-195i — VoiceOver selected-state + count for `MessageViewsDetailView` filter capsules

**Date:** 2026-07-20 · **Track:** iOS UI/UX (suffix `i`) · **Base:** `main` HEAD `8654053`
**Working branch:** `claude/laughing-thompson-hccac8`

## Goal

Close a WCAG 1.4.1 (Use of Color) gap in the "Who has seen" tab filter picker
(`MessageViewsDetailView.viewsFilterCapsule`): the active capsule is signalled by
color only, and the Button carries no accessibility label/trait — so VoiceOver
cannot tell which filter is active nor announce the visible count. Mirror the
already-fixed sibling `MessageReactionsDetailView.reactionFilterCapsule`.

## Steps

1. [x] Sync branch to latest `main` (prior 191i work merged via #2168).
2. [x] Scout a collision-free candidate; verify against open PRs + prior iteration docs.
3. [x] Confirm `ViewsFilter.label` is already localized (`message-detail.views.*`) → 0 new keys.
4. [x] Add `.accessibilityLabel(count.map { "\(filter.label), \($0)" } ?? filter.label)`
       and `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` to the capsule Button.
5. [x] Write analysis + plan docs; update `branch-tracking.md`.
6. [ ] Commit, push, open PR (title `feat(ios/a11y): VoiceOver selected-state + count for MessageViewsDetailView filter capsules (195i)`).
7. [ ] Confirm CI `iOS Tests` green.

## Constraints

- 1 file, 0 logic / 0 network / 0 layout / 0 visual change, 0 new i18n key, 0 new test.
- No SDK edit. No change to `viewsFilter` switch or content views.
- Gate = CI `iOS Tests` (compile/VoiceOver runs on the macOS runner; this is Linux).
