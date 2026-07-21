# Plan — Iteration-205i — AffiliateView empty state dedup

**Date:** 2026-07-21 · **Track:** iOS UI/UX (`i` suffix) · **Branch:** `claude/laughing-thompson-h91l73`

## Goal

Remove the last hand-rolled `*.empty.*` empty-state `VStack` in
`Features/Main/Views` by adopting the shared `EmptyStateView` primitive, keeping
the section card chrome and all existing i18n keys.

## Steps

1. [x] Resync `claude/laughing-thompson-h91l73` to `origin/main` HEAD `22465a5`.
2. [x] Identify target: `AffiliateView.emptyTokensState` (bespoke icon+title+subtitle
   `VStack`, `.system(size: 36)` fixed hero) — sibling `ShareLinksView` already
   migrated in 178i.
3. [x] Replace inner `VStack` with `EmptyStateView(icon: "link", title:, subtitle:,
   accentColor: accentColor, compact: true)`, preserving `.padding(.vertical, 30)`
   and the `RoundedRectangle(16)` `surfaceGradient` + `border` card background.
4. [x] Add `import MeeshyUI`.
5. [x] Reuse `affiliate.empty.title` / `affiliate.empty.subtitle` → 0 new keys.
6. [x] Verify by inspection (accentColor is `String`; keys retained; braces balanced).
7. [x] Document analysis + plan + branch-tracking.
8. [ ] Commit + push to `claude/laughing-thompson-h91l73`.
9. [ ] Open/refresh PR when GitHub MCP is available (unavailable this headless run).

## Collision check

`AffiliateView.swift` last touched 180i (#2142, merged). Absent from the
recently-merged 60-commit window as an active edit target. Open-PR verification
via `list_pull_requests` was **not possible** — the GitHub MCP server did not
finish connecting in this scheduled/headless run (documented caveat for
interactively-authenticated MCP servers). Iteration number 205i chosen as the
natural successor to the highest recorded iteration (204i done, 203i in-flight).

## Non-goals

Stat cards, header, token rows, ViewModel, networking — untouched.
