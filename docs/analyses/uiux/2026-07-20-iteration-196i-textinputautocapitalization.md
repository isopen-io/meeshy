# Iteration-196i — Modernize deprecated `.autocapitalization(_:)` to `.textInputAutocapitalization(_:)`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Native platform integration / API modernization / design-system consistency — text-entry fields
**Files touched:**
- `apps/ios/Meeshy/Features/Main/Views/SecurityView.swift` (email-change field)
- `apps/ios/Meeshy/Features/Main/Views/DeleteAccountView.swift` (confirmation-phrase field)

(2 files, 0 logic change, 0 new i18n key, 0 SDK change, 0 new test — behavior-preserving.)

## Component

Two text-entry surfaces in destructive/sensitive settings flows:

1. **`SecurityView.emailEditContent`** — the "Nouvel email" `TextField` used to
   change the account email. It configures `.textContentType(.emailAddress)`,
   `.keyboardType(.emailAddress)` and disabled autocapitalization (emails are
   lowercase).
2. **`DeleteAccountView.confirmationSection`** — the confirmation-phrase
   `TextField`. The user must type the server-side literal
   `SUPPRIMER MON COMPTE` verbatim; the field force-uppercases input so the typed
   phrase matches the required all-caps contract.

## Finding

Both fields used **`UITextAutocapitalizationType`-based `.autocapitalization(_:)`**,
a UIKit-era modifier **deprecated since iOS 13** (formally superseded in iOS 15 by
the SwiftUI-native `TextInputAutocapitalization` API). The app floor is iOS 16, so
the deprecated call is pure legacy carry-over.

These were the **only two remaining `.autocapitalization(_:)` call sites** in the
entire app and SDK. The modern `.textInputAutocapitalization(_:)` is already the
established codebase convention — 10+ existing sites use it
(`ContactsListTab`, `DiscoverTab`, `KeypadTab`, `OnboardingStepViews`,
`NewConversationView`, `MagicLinkView`, …). The two stragglers were an
inconsistency and a live deprecation warning.

## Fix

Behavior-preserving swap using Apple's documented value mapping
(`UITextAutocapitalizationType` → `TextInputAutocapitalization`):

| Before (deprecated) | After (modern) | View |
|---|---|---|
| `.autocapitalization(.none)` | `.textInputAutocapitalization(.never)` | `SecurityView` email field |
| `.autocapitalization(.allCharacters)` | `.textInputAutocapitalization(.characters)` | `DeleteAccountView` confirmation field |

No visible/interaction change: `.never` still keeps emails lowercase, and
`.characters` still force-uppercases the confirmation phrase so it matches the
`SUPPRIMER MON COMPTE` literal that gates the destructive button.

## Verification

- `grep -rn '\.autocapitalization(' Meeshy packages` → **0 remaining** call sites.
- `.textInputAutocapitalization(.never)` value matches the exact modifier already
  compiled at 10+ other sites in the app (compile-proven by existing code).
- No Xcode toolchain in this Linux CI environment; change is a pure SwiftUI
  modifier swap with an established in-repo precedent, so no runtime surface to
  drive. No new/changed logic → no test added (per "no 1:1 test-to-file" rule).

## Remaining improvements (out of scope, follow-up candidates)

- `SecurityView` email field lacks an explicit `.submitLabel` / keyboard-submit
  handling (relies on the "Envoyer" button).
- `DeleteAccountView`/`SecurityView` still use custom back-button headers rather
  than a native `NavigationStack` toolbar — a larger, app-wide pattern decision,
  intentionally left untouched here.
