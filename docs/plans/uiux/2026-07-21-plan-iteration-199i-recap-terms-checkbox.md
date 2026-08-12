# Plan — Iteration-199i — Recap terms-of-service consent checkbox VoiceOver state

**Date:** 2026-07-21 · **iOS only** · base = `main` HEAD `22465a5`

## Goal

Expose the checked/unchecked state of `StepRecapView.termsCheckbox` to
VoiceOver (currently color/glyph-only → WCAG 1.4.1 violation on the
account-creation consent gate).

## Steps

1. [x] Sync `main`, reset working branch `claude/laughing-thompson-hni9s1`.
2. [x] Confirm surface (`termsCheckbox`) absent from prior analyses; named as a
       fresh candidate by the 199i pointer.
3. [x] Add `.accessibilityAddTraits(viewModel.acceptTerms ? .isSelected : [])`
       to the `termsCheckbox` button.
4. [x] Add `.accessibilityHidden(true)` to the decorative `checkmark` glyph.
5. [x] Add `OnboardingRecapStepAccessibilityTests` source-level guard.
6. [x] Write analysis (`docs/analyses/uiux/`) + update tracking file.
7. [ ] Commit + push branch; gate on CI `iOS Tests`.

## Constraints honored

- Mirror of proven pattern (198i `languageCard`, `CallsTab.chip`).
- 0 visual / 0 logic / 0 network / 0 new i18n key.
- 1 production file, 1 new test file.
