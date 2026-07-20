# Iteration 195i — `BrandSignature` VoiceOver label i18n

## Surface
`apps/ios/Meeshy/Features/Main/Components/BrandSignature.swift` — the brand
signature footer (version line + « Fait avec ❤️ par Services CEO » credit + heart
logo). Shared by the splash screen (`MeeshyApp`) and the login screen (`LoginView`).

## Defect (real, single)
The `.accessibilityElement(children: .combine)` group carried a **hardcoded English
literal** VoiceOver label:

```swift
.accessibilityLabel(Text("Meeshy version \(appVersion), build \(buildNumber). Made with love by Services CEO."))
```

Consequences:
- **i18n** — Swift auto-extracted this literal into the catalog as the key
  `"Meeshy version %@, build %@. Made with love by Services CEO."`, which carried a
  single **untranslated** French stub (`state: "new"`, English value). VoiceOver users
  in de/es/fr/pt-BR heard an English sentence, while the *visible* credit right above
  it (`splash.madeWithLove`) is fully localized in all 5 languages. The screen-reader
  experience diverged from the on-screen experience by language.
- **Maintainability** — a dangling auto-extracted catalog key that would forever read
  `state: "new"` (never surfaced to translators as a proper manual key).

This was the exact deferral flagged by the 185i pointer note:
> `BrandSignature.swift:43` (`.accessibilityLabel(Text("Meeshy version … Made with love by Services CEO."))` littéral anglais dur alors que le crédit visible utilise `splash.madeWithLove` — i18n).

## Fix
Composed the VoiceOver label from two localized halves:

```swift
private var accessibilityLabel: String {
    let versionLine = String(
        localized: "brand.signature.a11y.version",
        defaultValue: "Meeshy version \(appVersion), build \(buildNumber)",
        bundle: .main
    )
    let credit = String(localized: "splash.madeWithLove", bundle: .main)
    return "\(versionLine). \(credit)"
}
```

- **Reuses `splash.madeWithLove`** for the credit half — the harder-to-translate part
  (brand name + heart glyph) is already translated in all 5 languages, so **zero new
  strings for the credit**. Single source of truth: the same key drives the visible
  credit and its spoken form → they can never diverge again.
- **New key `brand.signature.a11y.version`** (`extractionState: manual`) supplies only
  the "Meeshy version %1$@, build %2$@" scaffold, translated de/en/es/fr/pt-BR.
- Idiom mirrors the established `String(localized:defaultValue:bundle:)` interpolation
  pattern (`StoryViewerView+Content.swift:74`, 52+ sites).
- Removed the orphaned auto-extracted key
  `"Meeshy version %@, build %@. Made with love by Services CEO."` from the catalog.

## Non-goals / left intact
- Visible layout, fonts (`MeeshyFont.relative`), colors, heart logo, `padding` — unchanged.
- The visible version `Text("Meeshy \(appVersion) · \(buildNumber)")` — locale-neutral
  (brand name + numerals), left as-is.
- `.accessibilityElement(children: .combine)` retained: the explicit label overrides the
  combined children with a clean, spoken sentence (no raw "middle dot" from the visible line).

## Scope
1 Swift file (+8 net lines, 1 computed property, label call simplified), 1 catalog key
added × 5 languages, 1 stale catalog key removed. 0 logic / 0 network / 0 visual change /
0 new test. Gate = CI `iOS Tests`.

## Verification
- `Localizable.xcstrings` re-parses as valid JSON; new key present with all 5 locales;
  orphan key removed (verified via `python3 -c "json.load(...)"`).
- No behavior change beyond the spoken VoiceOver string.
