# Plan — Iteration-178i — `ShareLinksView` VoiceOver status + i18n

**Date:** 2026-07-20 · **Scope:** iOS only · **Branch:** `claude/laughing-thompson-opq5zi`
**Base:** `main` HEAD `ee34b79`

## Objective

Close two real gaps in `ShareLinksView` (the "Mes liens" management screen):
1. Active/inactive link status is conveyed by colour alone (badge glyph is
   hidden from VoiceOver) → WCAG 1.4.1 violation.
2. The `N rejoints` counter is built by concatenating a number with a standalone
   localized word → breaks pluralization/word-order.

## Steps

1. [x] Sync branch from latest `main`; confirm no open PR / prior iteration
   touches `ShareLinksView` (`list_pull_requests`; swarm 140i→177i checked).
2. [x] Confirm `MyShareLink` exposes `isActive`, `currentUses`,
   `conversationTitle`, `displayName` (SDK `ShareLinkModels.swift`).
3. [x] Add `joinedCountLabel(_:)` — single interpolated localized unit
   (`share.links.joined_count`), replace the concatenated visible caption.
4. [x] Add `rowAccessibilityLabel(_:)` — `displayName, status, N rejoints[, conv]`
   with localized "Actif"/"Inactif" (`share.links.status.active`/`.inactive`).
5. [x] Apply `.accessibilityElement(children: .ignore)` + `.accessibilityLabel`
   to the row's text `VStack` only (copy button + NavigationLink preserved).
6. [x] Verify: old `share.links.joined_label` reference gone; new keys code-only
   (0 `Localizable.xcstrings` edits); no test references the view.
7. [x] Write analysis + plan docs; update `branch-tracking.md`.
8. [ ] Commit, push, open PR; gate on CI `iOS Tests`.

## Constraints honoured

- 1 file, 0 logic, 0 network, 0 new test, 0 xcstrings edit.
- Label-level only — no visual/layout/colour change; frozen glyphs untouched.
- iOS 16.0+ APIs only (app floor); idiom parity with 155i/164i.
