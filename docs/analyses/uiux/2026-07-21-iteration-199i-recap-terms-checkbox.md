# Iteration-199i — VoiceOver selected-state for the onboarding terms-of-service consent checkbox

**Date:** 2026-07-21
**Scope:** iOS only
**Surface:** `StepRecapView.termsCheckbox` in `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`

## Problem

The final onboarding step (`StepRecapView`, "Recapitulatif") gates account
creation behind a terms-of-service consent checkbox (`termsCheckbox`). The
checkbox is a `Button` whose checked/unchecked state was conveyed to sighted
users **only** through:

1. the stroke/fill color (`MeeshyColors.success` green vs `systemGray3`), and
2. a `checkmark` SF Symbol glyph that appears when accepted.

Neither signal is exposed to assistive technology:

- The button carried **no `.isSelected` accessibility trait**, so VoiceOver
  announced the same string whether or not the user had accepted — a WCAG
  **1.4.1 (Use of Color)** violation on the single most consequential control
  of the registration flow (it toggles the enablement of "Create account").
- The `checkmark` glyph was not marked `.accessibilityHidden`, risking a raw
  "checkmark" utterance folded into the button label once state is exposed.

This is the exact class of defect already resolved for the sibling surfaces
`StepLanguageView.languageCard` / `languageTargetTab` (198i),
`ConversationDashboardView.periodPicker` + `ConversationInfoSheet.tabSelector`
(186i), and `CallsTab.chip` / `RequestsTab`.

## Fix

Mirror the proven swarm pattern — zero visual, zero logic, zero network, zero
new i18n key change:

1. `.accessibilityAddTraits(viewModel.acceptTerms ? .isSelected : [])` on the
   `termsCheckbox` button so VoiceOver announces "sélectionné" once the terms
   are accepted.
2. `.accessibilityHidden(true)` on the decorative `checkmark` `Image` — the
   `.isSelected` trait now carries the state, so the glyph must not be
   announced raw inside the label.

The visible checkbox, its green fill, the accept/read-terms copy, the toggle
behavior, and the haptic are all unchanged.

## Guard test

`OnboardingRecapStepAccessibilityTests` (source-level, non-`@MainActor`,
auto-included by `xcodegen generate`) asserts both modifiers are present on the
`termsCheckbox` body. Mirror of `OnboardingLanguageStepAccessibilityTests`.

## Verification status

- 1 production file touched (`OnboardingStepViews.swift`): +1 modifier, +1
  `.accessibilityHidden(true)`, +2 explanatory comments.
- 1 new test file (source-level guard).
- 0 logic / 0 network / 0 new i18n key / 0 visual change.
- Gate: CI `iOS Tests`.

## Completion

Resolved 2026-07-21. The consent checkbox now exposes its accepted state to
VoiceOver. **Do not re-flag `StepRecapView.termsCheckbox` for selected-state**
— solved in 199i.

### Remaining improvements (candidates for 200i+)

- The nested "Lire les conditions" `Button` sits inside the outer consent
  `Button`'s label — a nested-control anti-pattern that can make the inner link
  hard/impossible to reach under VoiceOver. Addressing it cleanly requires a
  small structural change (hoisting the link out as a sibling) and its own
  iteration, so it is intentionally deferred here to keep 199i visual-neutral.
- Other onboarding steps (`StepProfileView` photo pickers), remaining
  color-only segmented selectors (`ContactsHubView`, `NewConversationView`,
  `NotificationSettingsView`).
