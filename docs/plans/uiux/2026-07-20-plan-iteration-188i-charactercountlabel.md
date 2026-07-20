# Plan — Iteration-188i — shared `CharacterCountLabel`

**Date:** 2026-07-20 · **Scope:** iOS only · **Branch:** `claude/laughing-thompson-q2e8os`

## Goal

Consolidate the two hand-rolled character counters (`ReportUserView`,
`StatusComposerView`) into one reusable, locale-aware, VoiceOver-friendly
app-level component.

## Steps

1. [x] Create `CharacterCountLabel` in `Meeshy/Features/Main/Components/`
   - `count:limit:warningThreshold:font:`
   - `Int.formatted()` numerals + `.monospacedDigit()`
   - warning color at `warningThreshold` (default ⌈80 %⌉)
   - `.accessibilityLabel` → `components.characterCount.a11y`
   - `static` pure helpers: `resolvedThreshold`, `isNearLimit`, `accessibilityLabel`
2. [x] Rewire `ReportUserView` (limit 500, threshold 450, font 11)
3. [x] Rewire `StatusComposerView` (limit 122, threshold 101, font 10)
4. [x] Add `components.characterCount.a11y` to `Localizable.xcstrings` (de/en/es/fr/pt-BR)
5. [x] Add `CharacterCountLabelTests` (threshold / near-limit / a11y-label)
6. [x] Analysis doc + this plan
7. [ ] Commit, push, open PR; CI validates compile + tests

## Non-goals

- No SDK/`MeeshyUI` change (routine is iOS-app-scoped).
- No change to report/status business logic.
- No visual redesign — thresholds/fonts preserved per-site.

## Risk

- Cannot build locally (Linux). Component is small, additive, and mirrors
  existing patterns; CI is the compile gate.
