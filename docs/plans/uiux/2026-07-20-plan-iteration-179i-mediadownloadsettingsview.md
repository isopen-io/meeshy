# Plan — Iteration-179i — `MediaDownloadSettingsView`

**Base:** `origin/main` (post-177i)
**Working branch:** `claude/laughing-thompson-bj8jnf`
**Scope:** iOS only · 1 file · 0 logic · 0 new i18n key · 0 new test

## Goal
Re-converge `MediaDownloadSettingsView` on the audited `SupportView` helper
pattern and the Indigo brand doctrine.

## Steps
1. [x] `accentColor = "E67E22"` → `MeeshyColors.brandPrimaryHex`.
2. [x] Audio-translations `"F39C12"` → `MeeshyColors.indigo400Hex`.
3. [x] Video `"E74C3C"` → `MeeshyColors.brandDeepHex`.
4. [x] Info-section `"6B7280"` (×2) → `MeeshyColors.neutral500Hex`.
5. [x] `sectionHeader`: add `.accessibilityElement(children: .combine)` +
   `.accessibilityAddTraits(.isHeader)`.
6. [x] `fieldIcon`: `.system(size: 14, weight: .medium)` + `.accessibilityHidden(true)`
   + doctrine comment (mirror `SupportView.fieldIcon`).

## Guardrails
- No layout / copy / logic / selection-behavior change.
- No new symbols; all tokens pre-exist in `MeeshyColors`.
- No test touches this view → no test edits.

## Verification
- Static: iOS 16.0+ APIs, all mirror `SupportView` verbatim.
- `grep` confirms 0 raw hex literals remain, 0 test references.
- Gate: CI `iOS Tests`.
