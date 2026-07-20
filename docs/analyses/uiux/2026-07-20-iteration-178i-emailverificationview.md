# Iteration-178i — VoiceOver structure for `EmailVerificationView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — auth email-code verification screen
**File touched:** `apps/ios/Meeshy/Features/Auth/Views/EmailVerificationView.swift`
(1 file, 0 logic, 0 new test)

## Component

`EmailVerificationView` is the modal auth screen that asks the user to enter the
6-digit code emailed to them, with a Verify button, a Resend action, an inline
error row, and a full-screen success overlay. Driven by `EmailVerificationViewModel`
(`isVerifying`, `isResending`, `resendSuccess`, `verificationSuccess`, `error`).

## Findings

The screen was already fully localized (`String(localized:…)` everywhere) and used
**semantic Dynamic Type fonts** (`.system(.title)`, `.subheadline`, `.headline`,
`.footnote`, `.system(.title, design: .monospaced)`) — so **no i18n literal debt and no
Dynamic Type migration**. It had, however, **zero accessibility annotations**
(`grep accessibility` = 0), leaving real VoiceOver defects:

1. **Code field announced as its placeholder.** The `TextField` placeholder `"000000"`
   became the VoiceOver label while empty → *"000000, text field"*, giving no clue what
   to enter.
2. **Verify button became an anonymous button while working.** During `isVerifying` the
   button label reduced to a bare `ProgressView` (no `Text`) → VoiceOver read an
   **unlabeled button**.
3. **Resend button had the same defect** in its `isResending` state (spinner-only label).
4. **Decorative hero glyph** (`envelope.open.fill`) swept as noise.
5. **Error row fragmented** — decorative alert triangle + message read as two focuses.
6. **Big title** absent from the Headings rotor.
7. **Success overlay never surfaced.** The state-driven checkmark + "Email vérifié !"
   overlay was not announced and did not trap VoiceOver focus, so a VoiceOver user got no
   confirmation the verification succeeded.

## Fix

Additive VoiceOver modifiers only — no logic, no ViewModel change:

- **Hero icon** → `.accessibilityHidden(true)` (meaning carried by title + subtitle).
- **Title** → `.accessibilityAddTraits(.isHeader)` (Headings rotor).
- **Code field** → `.accessibilityLabel` ("Code de vérification") +
  `.accessibilityHint` ("Entrez le code à 6 chiffres reçu par email"), replacing the
  placeholder-as-label.
- **Error row** → `.accessibilityElement(children: .combine)` → the message reads as one
  element; the decorative triangle contributes nothing.
- **Verify button** → stateful stable `.accessibilityLabel` via
  `verifyButtonAccessibilityLabel` ("Verifier" ⇄ "Vérification en cours") so the button is
  never anonymous.
- **Resend button** → stateful stable `.accessibilityLabel` via
  `resendButtonAccessibilityLabel` covering repos / en-cours / confirmé, and overriding the
  decorative inner glyphs.
- **Success overlay** → `.accessibilityElement(children: .combine)` on the content +
  `.accessibilityAddTraits(.isModal)` on the overlay so VoiceOver focus moves into it and
  the dimmed background is ignored.

4 new i18n keys added inline via `String(localized:defaultValue:)` (codebase idiom —
**no `.xcstrings` edit**): `emailVerification.code.a11yLabel`,
`emailVerification.code.a11yHint`, `emailVerification.verifying.a11y`,
`emailVerification.resending.a11y`. Terminal button states reuse existing keys
(`emailVerification.verifyButton`, `emailVerification.resendButton`,
`emailVerification.resendConfirmed`). Pre-existing unaccented inline defaults left
untouched (the `.xcstrings` catalog owns FR accents); new keys written with correct accents.

State distinctions (verifying / resending / success / error) are conveyed by **text**, not
color alone — HIG-compliant.

## Verification

- View-only change; `EmailVerificationViewModelTests` exercises the ViewModel, not the
  View → no test references the modified surface (grep confirmed).
- No `.system(size:)` present → no Dynamic Type regression risk; semantic fonts retained.
- No open iOS PR touches `EmailVerificationView.swift` → 0 contention.
- Gate: CI `iOS Tests`.

## Status

**SOLDÉ 178i** — `EmailVerificationView` VoiceOver structure complete (code-field label,
stateful button labels, decorative glyphs hidden/combined, header trait, modal success
overlay). Do not re-audit: typography already semantic, no frozen `.system(size:)` glyph
remains to justify a follow-up.
