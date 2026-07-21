# Plan — Iteration 210i — Share Extension `ContactRow` VoiceOver semantics

**Track**: iOS UI/UX (`i`) · **Branch**: `claude/laughing-thompson-g3s7uq` · **Base**: `main` HEAD `22465a5`

## Goal
Give the Share Extension contact-selection row proper VoiceOver semantics: announce the
selected recipient (not color/glyph-only) and present the tappable row as a button.

## Target
`apps/ios/MeeshyShareExtension/ShareViewController.swift` → `struct ContactRow`.

## Steps
1. Hide the decorative avatar `ZStack` from VoiceOver (`.accessibilityHidden(true)`).
2. Hide the redundant `checkmark.circle.fill` glyph (`.accessibilityHidden(true)`).
3. Combine the row into one element (`.accessibilityElement(children: .combine)`) →
   clean "{name}, {status}" label.
4. Add `.isButton` trait (row selects a contact on tap).
5. Add `.isSelected` trait conditionally (`isSelected ? [.isSelected] : []`).

## Constraints
- Purely additive a11y modifiers: 0 visual, 0 logic, 0 layout, 0 network, 0 new i18n key.
- Do NOT touch brand-color or i18n hold-outs (separate future iterations — see analysis).

## Verification
- No Swift toolchain on host → inspection + parity with the app-wide `.isSelected` idiom.
- Extension is compiled by the `Meeshy` scheme → gate = CI `iOS Tests`.
