# Iteration 208i — Legal screens: initial language follows the user's preferred language

**Track**: iOS UI/UX (suffix `i`)
**Date**: 2026-07-21
**Scope**: `apps/ios/Meeshy/Features/Main/Views/TermsOfServiceView.swift`, `apps/ios/Meeshy/Features/Main/Views/PrivacyPolicyView.swift`

## Problem

`TermsOfServiceView` and `PrivacyPolicyView` are twin bilingual (FR/EN) legal screens.
Each holds its displayed-language state as:

```swift
@State private var selectedLanguage = "fr"
```

The initial language was **hardcoded to French for every user**, regardless of their
in-app content-language preferences or their device locale. An English-locale user opening
*Settings → Terms of Service* (or *Privacy Policy*) is shown the French text first and must
manually flip the segmented `Picker` to English.

This violates the **Prisme Linguistique** product principle (CLAUDE.md): *"Par défaut,
l'utilisateur consomme tout le contenu dans sa langue principale configurée"* — legal copy
is content too, and it should open in the user's language automatically, with the picker
kept as the explicit-override affordance.

## Fix

Resolve the initial language from the same signal chain the rest of the app uses, constrained
to the two languages the documents actually ship (`fr`, `en`), falling back to `fr` (the app's
base legal language) when neither is available.

Resolution order (mirrors `resolveUserLanguage()` doctrine — in-app preferences first, device
locale last):

1. `AuthManager.shared.currentUser?.preferredContentLanguages` (reflects `systemLanguage` →
   `regionalLanguage` → `customDestinationLanguage`)
2. `Locale.current.language.languageCode` (device locale — ranked last, per Prisme étendu 2026-05-26)
3. Fallback `"fr"`

```swift
@State private var selectedLanguage: String

private static let supportedLanguages: Set<String> = ["fr", "en"]

@MainActor
init() {
    let preferred = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
    let deviceLocale = Locale.current.language.languageCode?.identifier
    _selectedLanguage = State(initialValue: Self.resolveInitialLanguage(preferred: preferred, deviceLocale: deviceLocale))
}

static func resolveInitialLanguage(preferred: [String], deviceLocale: String?) -> String {
    let candidates = preferred + [deviceLocale].compactMap { $0 }
    for candidate in candidates {
        let code = String(candidate.prefix(2)).lowercased()
        if supportedLanguages.contains(code) { return code }
    }
    return "fr"
}
```

### Why `@MainActor init()`

`AuthManager` is `@MainActor`-isolated. Reading `AuthManager.shared` from a non-isolated
`View.init` would be a Swift 6 concurrency error. Both screens are only ever constructed
inside the `@MainActor` `.sheet { … }` closures of `SettingsView` (lines 112–113), so a
`@MainActor init()` is correct and introduces no new call-site constraint.
(`ThemeManager`, used elsewhere in these files, is `@unchecked Sendable` — not `@MainActor` —
which is why its `.shared` is freely reachable; `AuthManager` is not.)

### Behavior delta

- Users whose preferred/device language resolves to **`en`** now see English legal copy first.
- **Every other user is unchanged** — the fallback stays `"fr"`, and `preferredContentLanguages`
  containing an unsupported language (e.g. `es`) still falls through to `fr`.
- The segmented picker, section rendering, `lastUpdated` line, accent color, and all
  accessibility metadata are untouched.

## Scope

- **2 files** (twins), +19 lines each, symmetric.
- **0** new i18n key (the docs' FR/EN copy dictionaries are unchanged; a separate concern).
- **0** network / **0** visual change on unchanged locales / **0** new test.
- `resolveInitialLanguage` is a pure static function (testable in isolation).

## Collision check

- `search_pull_requests … TermsOfServiceView in:title` → only #2175, which references it as a
  *follow-up* and does not modify it.
- `search_pull_requests … PrivacyPolicyView in:title` → 0.
- Neither file appears as a changed file in the open message-detail/a11y swarm.

## Verification

- iOS build/tests not runnable in this Linux container (no Xcode/Swift toolchain) →
  **gate = CI `iOS Tests`** (compile Xcode 26.1.1 / Swift 6.2, run sim iOS 18.2).
- `init()` call sites (`SettingsView` `.sheet` closures) pass no arguments → the added
  parameterless `@MainActor init()` is call-compatible.
- iOS 16 floor: `Locale.current.language.languageCode` and `State(initialValue:)` are iOS 16+,
  no `@available` guard needed.

## Follow-ups (209i+)

- The FR/EN legal copy is a hardcoded in-file dictionary rather than `.xcstrings` — a genuine
  localization-completeness gap, but a much larger, separate change (and it would make the
  documents translatable beyond fr/en, which changes `supportedLanguages` semantics).
- `PrivacyPolicyView.accentColor` is still a raw `"6366F1"` literal (should be
  `MeeshyColors.brandPrimaryHex`) — owned by the design-system brand-color track (#2175 class).
