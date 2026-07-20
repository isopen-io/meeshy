# Plan — Iteration-179i

**Base:** `main` HEAD `e9e38a9`
**Working branch:** `claude/laughing-thompson-duee1f`
**Scope:** iOS only — VoiceOver labels for feed post stat counters

## Target

`TextPostCell` (like/comment/repost) and `MediaPostCell` (like/comment) —
UIKit cells whose stat `UIButton`s show only the bare count as their title,
so VoiceOver announces "N, button" with no meaning (WCAG 1.1.1 / 1.4.1).
Explicit backlog item from the 176i analysis.

## Steps

1. [x] Extract a shared pure helper `PostStatAccessibility` with
   `likesLabel/commentsLabel/repostsLabel(_:)` using `String(localized:
   defaultValue: "^[\(n) like](inflect: true)")` (176i precedent).
2. [x] Assign `accessibilityLabel` from the helper in each cell's
   `configure(with:)` — 0 logic, 0 visual, 0 trait change.
3. [x] Add pure-logic unit tests `PostStatAccessibilityTests` (count present,
   singular/plural agreement, per-type distinctness).
4. [x] Write analysis `2026-07-20-iteration-179i-postcell-stat-a11y.md`.
5. [x] Update `branch-tracking.md` authoritative iOS pointer.
6. [ ] Commit, push, open PR. Gate = CI `iOS Tests`.

## Non-goals

- Wiring the stat buttons to actions or changing their `UIButton` trait
  (they are display-only) — deferred, it is a semantics decision.
- Any Android / Web / backend / SDK change.
