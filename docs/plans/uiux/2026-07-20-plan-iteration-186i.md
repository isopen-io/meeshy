# Plan — Iteration-186i (iOS)

**Date:** 2026-07-20
**Branch:** `claude/laughing-thompson-sm8w8b` (from `main` HEAD `f80d5fb`)
**Scope:** iOS only — Accessibility (VoiceOver)
**Target:** `apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift`

## Problem

In `MessageMoreSheet` (the « Plus… » exploration grid off a message's
long-press menu):

1. An exploration pellet's **open** state (its inline panel is expanded) was
   signalled only by color — circle fill/stroke opacity + label tint driven by
   `isActive` — with **no `.accessibilityAddTraits(.isSelected)`**. VoiceOver
   users could not tell which pellet was expanded (WCAG 1.4.1).
2. The inline exploration header's **close button** is an icon-only
   `xmark.circle.fill` `Button` with **no `.accessibilityLabel`** → VoiceOver
   reads the raw SF Symbol name.

## Steps

1. [x] Sync working branch from latest `main` (`f80d5fb`); the branch's only
   prior commit (`#2132`, shared/validators) is already merged into `main`, so
   reset the branch to `origin/main`.
2. [x] Confirm target free of collision: `list_pull_requests` — highest number
   in flight is **185i**; no open PR touches `MessageMoreSheet`; 0
   branch-tracking mentions; no existing test → this is **186i**.
3. [x] `.accessibilityAddTraits(isActive ? [.isSelected] : [])` on the pellet
   `Button`.
4. [x] `.accessibilityLabel(String(localized: "common.close", …))` on the inline
   close button (SSOT key reuse, 0 new key).
5. [x] Add source-level guard test `MessageMoreSheetAccessibilityTests.swift`
   (mirrors `CallsTabAccessibilityTests`).
6. [x] Write analysis doc `2026-07-20-iteration-186i-messagemoresheet.md`.
7. [x] Update `branch-tracking.md` (pointer + row).
8. [ ] Commit + push `-u`; open/confirm PR; confirm `iOS Tests` green.

## Constraints honored

- 1 production file, +2 accessibility modifiers, 0 logic, 0 visual change,
  0 new i18n key (reuses `common.close`).
- No `.accessibilityElement(children: .combine)` on the `Button` (it already
  aggregates its label subtree + adds `.isButton`).
- One-shot action pellets never receive `.isSelected` (guarded by
  `isExploration(item)` inside `isActive`).
- Indigo identity, Dynamic Type (already semantic), localization (already
  complete) untouched.

## Gate

CI `iOS Tests` (macOS runner) — build + VoiceOver run happens in CI (this is a
Linux container). New guard test auto-included via `xcodegen generate`.
