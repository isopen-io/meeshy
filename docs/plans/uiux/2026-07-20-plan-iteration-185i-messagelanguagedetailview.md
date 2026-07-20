# Plan — Iteration-185i

**Date:** 2026-07-20
**Scope:** iOS only — Accessibility (VoiceOver)
**Target:** `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift`
**Branch:** `claude/laughing-thompson-l4tmrh` (base `main` HEAD `217cba9`)

## Context

The `laughing-thompson` iOS swarm is dense: open PRs run 144i → 184i (#2135
`StatusComposerView`). `list_pull_requests` verified — **no** open PR touches
`MessageLanguageDetailView`. Iteration number **185i** chosen strictly > 184i.

## Problem

`MessageLanguageDetailView` (the Prisme Linguistique **Langue** panel) had
**zero** `.accessibilityLabel` in the whole file, with two **icon-only**
buttons (`xmark.circle.fill` close, `arrow.clockwise` re-translate) that
VoiceOver announced as unlabeled "button", plus a language row whose selected
state was conveyed by **color + glyph only** (no `.isSelected` trait — WCAG
1.4.1).

Dynamic Type (semantic fonts only) and localization (`message-detail.*` keys)
were already sound — this is a purely VoiceOver iteration.

## Steps

1. [x] Sync working branch from latest `main` (`217cba9`).
2. [x] Scout a fresh, unclaimed surface (Explore agent) — picked
       `MessageLanguageDetailView`; confirmed 0 PR collision, 0 test refs.
3. [x] Add `.accessibilityLabel` to the `xmark.circle.fill` close button
       (`message-detail.a11y.close-translation`).
4. [x] Add `.accessibilityLabel` to the `arrow.clockwise` re-translate button
       (`message-detail.a11y.retranslate`).
5. [x] Add `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` to the
       language row `Button`.
6. [x] Write analysis + plan docs; update `branch-tracking.md`.
7. [ ] Commit, push, open PR. Gate = CI `iOS Tests`.

## Constraints honored

- 1 production file, 0 logic, 0 visual, 0 new test.
- 2 new a11y keys inline via `String(localized:defaultValue:bundle:.main)` —
  code-only, 0 `.xcstrings` edit (parity 100i/104i/164i).
- Standard iOS 15/16+ APIs, app floor iOS 16.0 → no availability guard.
- No SDK / Android / Web / backend changes.

## Verification

- Static: only additive a11y modifiers; brace balance preserved.
- No test references the view (grep = 0).
- CI `iOS Tests` (macOS) is the compile/VoiceOver gate — this container is Linux.
