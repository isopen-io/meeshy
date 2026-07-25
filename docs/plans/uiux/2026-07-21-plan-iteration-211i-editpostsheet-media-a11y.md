# Plan — Iteration 211i — `EditPostSheet` media thumbnail VoiceOver

**Base:** `main` HEAD (`22465a5`), branch `claude/laughing-thompson-e0weh9`
**Type:** iOS a11y (VoiceOver) — additive modifiers only.

## Problem
Media strip in `EditPostSheet.mediaThumbnail` exposes only the remove/restore
`Button` to VoiceOver. The thumbnail image itself is unlabeled → the media **kind**
is invisible (row of identical buttons, WCAG 1.1.1) and the **removed** state is
conveyed by `0.35` opacity alone (WCAG 1.4.1).

Rejected non-defects from the #2193 pointer: `mediaIcon`'s `.system(size: 22)` is a
decorative glyph in a rigid clipped 64×64 frame (same doctrine as the frozen
`size: 18` sibling — leave fixed); no section headers exist to promote (native
inline nav title already carries the header trait).

## Steps
1. Add `.accessibilityElement(children: .ignore)` + `.accessibilityLabel(kind)` +
   `.accessibilityValue(removed ? "Retiré" : "")` on the thumbnail `Group`.
2. Add `mediaKindLabel(_:)` helper → compact localized noun per kind.
3. Inline `String(localized:defaultValue:)` keys (0 xcstrings edits), 6 total.
4. Analysis + plan docs + branch-tracking pointer.
5. Commit, push, open PR. Gate = CI `iOS Tests`.

## Scope
1 code file (+21 lines, 5 comment), 0 logic / 0 network / 0 visual / 0 new test.

## Collision
`EditPostSheet.swift` modified by 0 open PRs (verified via `list_pull_requests` +
`search_pull_requests`). #2193 / #2181 reference it only as prior-art.
