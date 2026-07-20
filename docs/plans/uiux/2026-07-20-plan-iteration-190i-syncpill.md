# Plan — Iteration-190i — `SyncPill` i18n + VoiceOver button trait

**Date:** 2026-07-20 · **Scope:** iOS only · **Iteration:** 190i

## Base
- Source branch: `main` (HEAD `1615143`, TrackingLinkDetailView 180i #2122 merged)
- Working branch: `claude/laughing-thompson-igofb1` (reset fresh from `origin/main`)

## Target
`apps/ios/Meeshy/Features/Main/Components/SyncPill.swift` — the globally-mounted
connection/sync status pill. Chosen after excluding all views already covered
by open PRs 185i–189i and prior iterations. Two objective defects:
1. Two hardcoded French a11y strings (hint + multi-signal summary).
2. Tappable pill (`source != nil`) missing `.isButton` trait despite a hint
   promising navigation.

## Steps
1. [x] Localize tap hint → `sync-pill.a11y.tap-hint` (`String(localized:defaultValue:bundle:)`).
2. [x] Localize multi-signal summary → `sync-pill.a11y.summary` (`%1$lld` count, `%2$@` label).
3. [x] Add `.accessibilityAddTraits(source != nil ? [.isButton] : [])` — reuse existing predicate.
4. [x] Add both keys × 5 locales (de/en/es/fr/pt-BR) to `Localizable.xcstrings`, no reformat.
5. [x] Validate xcstrings JSON parses; review Swift edits.
6. [ ] Commit + push to working branch; CI `iOS Tests` gate.

## Constraints honored
- Additive only: 0 logic, 0 visual, 0 SDK change, 0 new test.
- No local Xcode (Linux) → rely on CI compile + `iOS Tests`.
- Status-only rows keep no button trait (tap = rotation advance, not an action).
