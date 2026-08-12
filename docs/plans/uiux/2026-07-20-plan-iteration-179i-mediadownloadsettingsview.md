# Plan — Iteration-179i — `MediaDownloadSettingsView`

**Date:** 2026-07-20 · **Scope:** iOS only · **Base:** `main` HEAD `fc38a0b`
**Working branch:** `claude/laughing-thompson-k9l43k`

## Goal

Consolidate `MediaDownloadSettingsView` onto the Indigo brand palette (remove
all raw off-brand hex) and expose its section headers to VoiceOver — without
touching layout, logic, or persistence.

## Steps

1. `accentColor "E67E22"` → `MeeshyColors.brandPrimaryHex` (screen accent).
2. Traductions-audio chip `"F39C12"` → `MeeshyColors.indigo400Hex`.
3. Video chip `"E74C3C"` → `MeeshyColors.indigo300Hex`.
4. Info header + background `"6B7280"` (×2) → `MeeshyColors.neutral500Hex`
   (exact-value token; zero visual change).
5. `sectionHeader`: hide decorative icon, combine children, natural-case
   `.accessibilityLabel`, add `.isHeader` trait.

## Constraints

- 1 file only, 0 logic, 0 new i18n key, 0 new test.
- All swaps are `String` → `String` (hex literal → existing hex token).
- No sibling-file change (avoids the affiliate intra-feature-consistency trap).

## Verification

- No Swift toolchain on Linux → static review + CI `iOS Tests` is the gate.
- Confirmed `brandPrimaryHex` / `indigo400Hex` / `indigo300Hex` /
  `neutral500Hex` all exist in `MeeshyUI/Theme/MeeshyColors.swift`.
- Confirmed no test references `MediaDownloadSettingsView`.
- Confirmed no open PR touches the file.
