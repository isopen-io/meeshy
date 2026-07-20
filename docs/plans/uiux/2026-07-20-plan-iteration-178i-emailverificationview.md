# Plan — Iteration-178i — VoiceOver structure for `EmailVerificationView`

**Date:** 2026-07-20
**Scope:** iOS only — Accessibility (VoiceOver)
**File:** `apps/ios/Meeshy/Features/Auth/Views/EmailVerificationView.swift` (1 file, 0 logic, 0 new test)

## Base
- Working branch: `claude/laughing-thompson-v3u8qn`, base `main` HEAD `cfc839e`.
- 167i (`UploadProgressBar`) merged as #2037.

## Why this surface
Auth email-code verification screen — high-visibility flow, **never a11y-audited**
(grep `accessibility` = 0). It is already fully localized (`String(localized:…)`
throughout) and uses **semantic Dynamic Type fonts** (`.system(.title)`, `.subheadline`,
`.headline`, `.footnote`) — so **0 Dynamic Type migration, 0 i18n literal debt**. The
defect is structural VoiceOver.

## Findings (real defects)
1. **Code field label = placeholder.** The `TextField` placeholder `"000000"` becomes the
   VoiceOver label when empty → VoiceOver announces *"000000, text field"* with no idea
   what to type. → proper `.accessibilityLabel` + `.accessibilityHint`.
2. **Verify button collapses to a bare spinner.** While `isVerifying`, the button label is
   only a `ProgressView` (no `Text`) → VoiceOver reads an **unlabeled button**. → stateful
   stable `.accessibilityLabel` ("Verifier" ⇄ "Vérification en cours").
3. **Resend button same defect.** While `isResending`, label is spinner-only → unlabeled
   button. → stateful `.accessibilityLabel`.
4. **Decorative hero glyph** (`envelope.open.fill` in a circle) read as noise →
   `.accessibilityHidden(true)`.
5. **Error row fragmented** (triangle glyph + message) → `.accessibilityElement(children:
   .combine)` (glyph carries no label; message read as one element).
6. **Big title** not a rotor header → `.accessibilityAddTraits(.isHeader)`.
7. **Success overlay never surfaced to VoiceOver.** State-driven overlay (checkmark +
   "Email vérifié !") → `.combine` + `.accessibilityAddTraits(.isModal)` so VoiceOver focus
   moves into it and the dimmed background behind is ignored.

## Fix shape
Additive a11y modifiers only. 2 computed label helpers for the stateful buttons. 4 new i18n
keys via inline `String(localized:defaultValue:)` (codebase idiom — **no `.xcstrings` edit**):
`emailVerification.code.a11yLabel`, `emailVerification.code.a11yHint`,
`emailVerification.verifying.a11y`, `emailVerification.resending.a11y`. Existing keys reused
for the terminal button states.

## Non-goals
- No logic / ViewModel change (`isVerifying`, `isResending`, `resendSuccess`,
  `verificationSuccess`, `error` untouched).
- Existing unaccented inline defaults on pre-existing keys left as-is (catalog owns FR
  accents); new keys written with correct accents.

## Contention
Open iOS PRs (#2076/#2074/#2072/#2071/#2069/#2066/#2062/#2059/#2056/#2051/#2049/#2047/#2045/
#2043/#2041/#2040/#2039/#2038/#2030/#2028/…) touch other files — **none** touch
`EmailVerificationView.swift`. `EmailVerificationViewModelTests` exercises the ViewModel only
(not the View) → View-only changes are test-safe.

## Gate
CI `iOS Tests`. PR to follow.
