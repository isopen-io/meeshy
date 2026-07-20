# Plan — Iteration-186i — `CreateShareLinkView` VoiceOver header traits

**Base:** `main` HEAD (resync after 179i merge, #2125)
**Working branch:** `claude/laughing-thompson-9z9lzu`
**Scope:** iOS only — accessibility, 1 file, 0 logic

## Goal

Make the five `formSection` group titles of the create-share-link sheet
reachable via the VoiceOver "Headings" rotor, announced in natural case, with
the decorative accent glyph hidden — mirroring the six already-polished sibling
screens.

## Steps

1. [x] Sync branch to `main` HEAD; confirm swarm collision-free (185i highest in
   flight, `CreateShareLinkView` untouched, `list_pull_requests`).
2. [x] Confirm view is unaudited (tracking pointer) and test-free (`grep`).
3. [x] Edit `formSection` helper: `.accessibilityHidden(true)` on icon,
   `.accessibilityElement(children: .ignore)` + `.accessibilityLabel(title)` +
   `.accessibilityAddTraits(.isHeader)` on the header `HStack`.
4. [x] Write analysis `docs/analyses/uiux/2026-07-20-iteration-186i-createsharelinkview.md`.
5. [ ] Commit + push branch.
6. [ ] Update `branch-tracking.md` pointer to 186i.

## Risk

Minimal. One helper, applies to all five sections, `0` visual change, `0`
call-site edits, `0` new i18n key, `0` new test. Gate = CI `iOS Tests`.
