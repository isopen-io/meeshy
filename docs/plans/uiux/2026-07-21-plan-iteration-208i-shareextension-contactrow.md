# Plan — Iteration 208i (iOS): Share Extension `ContactRow` VoiceOver selection state

**Track**: iOS UI/UX (`i`)
**Base**: `main` HEAD `22465a5`
**Working branch**: `claude/laughing-thompson-5s0yg3`

## Goal

Close the color-only selection-state defect on `ContactRow` (Share Extension
recipient picker): expose the selected state, button role, and a coherent
combined label to VoiceOver — 0 visual/logic/layout change.

## Steps

1. `apps/ios/MeeshyShareExtension/ShareViewController.swift` → `ContactRow`:
   - `.accessibilityHidden(true)` on the decorative avatar `ZStack`.
   - `.accessibilityHidden(true)` on the conditional checkmark `Image`.
   - `.accessibilityElement(children: .combine)` on the row.
   - `.accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)`.
2. Add `ShareExtensionContactRowAccessibilityTests` (source-level guard,
   3 tests) under `apps/ios/MeeshyTests/Unit/Views/`.
3. Analysis + plan + branch-tracking updated.

## Constraints

- 1 production file, +5 lines. 0 i18n key, 0 logic, 0 network, 0 visual.
- Mirror proven sibling `CallsTab.chip` / `MessageReactionsDetailView`.

## Gate

CI `iOS Tests`. Extension target not compiled by the `Meeshy` scheme (signing
pending); guard test parses source text so it validates regardless.
