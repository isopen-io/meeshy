# Iteration-195i (iOS) — BrandSignature VoiceOver label localization

**Date:** 2026-07-20
**Scope:** iOS only — Localization (i18n) × Accessibility (VoiceOver)
**Target:** `apps/ios/Meeshy/Features/Main/Components/BrandSignature.swift`
**Branch:** `claude/laughing-thompson-xnsbok` (from `main` HEAD `be4a52c`)

## Surface

`BrandSignature` is the version + credit footer shared by the **splash screen**
(`MeeshyApp`) and the **login screen** (`LoginView`). It stacks three elements:

1. `Text("Meeshy \(appVersion) · \(buildNumber)")` — version line
2. `Text(String(localized: "splash.madeWithLove", bundle: .main))` — the
   "Fait avec ❤️ par Services CEO" credit (fully localized: de/en/es/fr/pt-BR)
3. `Image("AppIconFooter")` heart logo — `.accessibilityHidden(true)`

The whole stack is grouped with `.accessibilityElement(children: .combine)` and
then given an explicit `.accessibilityLabel`.

## Problem — hardcoded English VoiceOver label

The explicit label (line 43) was a **hardcoded English `Text` literal**:

```swift
.accessibilityLabel(Text("Meeshy version \(appVersion), build \(buildNumber). Made with love by Services CEO."))
```

Consequences:

- **Untranslated for VoiceOver users on every non-English locale.** The visible
  credit right above it (`splash.madeWithLove`) is localized in 5 languages, but
  a blind French/German/Spanish/Portuguese user heard the credit read out in
  **English only**. This is the exact inverse of the Prisme/localization
  discipline: the sighted experience was localized, the VoiceOver experience
  was not.
- **Catalog pollution.** Because the literal was a plain interpolated `Text`,
  Xcode's string extractor had captured it into `Localizable.xcstrings` as its
  own key — `"Meeshy version %@, build %@. Made with love by Services CEO."` —
  with a single, `state: "new"` (untranslated) French entry that was byte-for-byte
  the English string. A phantom, unmanaged key.

## Fix

Resolve the label through a **stable, explicit key** instead of an English
literal, mirroring the proven sibling `story.mine.row.a11y` (source-level
VoiceOver label built via `String(localized:defaultValue:)`):

```swift
.accessibilityLabel(
    String(
        localized: "brand.signature.accessibilityLabel",
        defaultValue: "Meeshy version \(appVersion), build \(buildNumber). Made with love by Services CEO.",
        bundle: .main
    )
)
```

- `bundle: .main` matches the `splash.madeWithLove` call two lines up (same file).
- The `%1$@ / %2$@` placeholders carry `appVersion` / `buildNumber`.
- The `.accessibilityLabel(String)` overload treats the resolved string
  verbatim (localization already done) — no double-lookup.
- The label deliberately spells out "version"/"build"/"love" (no "·", no ❤️
  emoji) so VoiceOver reads a clean sentence rather than the raw glyphs of the
  visible line — a genuine a11y win preserved from the original.

### Catalog

- **Added** `brand.signature.accessibilityLabel` with `extractionState: manual`
  and translations for the full sibling language set **de/en/es/fr/pt-BR**
  (identical coverage to `splash.madeWithLove`). "Made with love" is rendered
  idiomatically per locale (fr "Fait avec amour", de "Mit Liebe gemacht",
  es "Hecho con amor", pt-BR "Feito com amor").
- **Removed** the orphaned auto-extracted key
  `"Meeshy version %@, build %@. Made with love by Services CEO."`.

## Constraints honored

- 1 production file (`BrandSignature.swift`, +6/−1 lines), 1 catalog edit,
  0 logic, 0 visual change, 0 layout change, 0 color change.
- No new visible strings (the on-screen credit is untouched — this is a
  VoiceOver-only + catalog change).
- Surgical `.xcstrings` text edit (Xcode's mixed compact/expanded JSON
  formatting preserved; a full re-serialize would have churned the whole file).

## Test

New source-level guard `BrandSignatureLocalizationTests` (mirror of
`MessageMoreSheetAccessibilityTests`, non-`@MainActor`, auto-included by CI
`xcodegen generate`):

1. `test_accessibilityLabel_isLocalizedNotHardcodedEnglish` — asserts the source
   references `brand.signature.accessibilityLabel` and no longer contains the
   `.accessibilityLabel(Text("Meeshy version …` literal.
2. `test_catalog_shipsAllSplashLanguagesForBrandSignatureLabel` — parses the
   `.xcstrings`, asserts the new key covers every language of
   `splash.madeWithLove`, and that the orphaned English literal key is gone.

## Gate

CI `iOS Tests` (macOS runner) — build + VoiceOver run happen in CI (this is a
Linux container). New guard test auto-included via `xcodegen generate`.

## Completion

- [x] Localized VoiceOver label via stable key `brand.signature.accessibilityLabel`.
- [x] Catalog: key added (5 langs), orphan English literal key removed, JSON valid.
- [x] Source-level guard test added.
- [x] Analysis + plan + branch-tracking updated.

**⚠️ Do not re-flag `BrandSignature` for VoiceOver-label localization — solved
195i.** Remaining deferred (187i+ pointer): `MessageViewsDetailView.sendAttemptsCard`
FR literals; `MessageDetailSheet` views-filter chip + reaction-filter capsule
color-only selection state.
