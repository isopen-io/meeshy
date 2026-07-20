# Iteration 195i — `BrandSignature` VoiceOver label i18n

**Date**: 2026-07-20
**Surface**: `apps/ios/Meeshy/Features/Main/Components/BrandSignature.swift`
**Type**: Accessibility + Localization (i18n)
**Scope**: iOS only

## Context

`BrandSignature` is the brand footer shown on the splash screen (`MeeshyApp`) and
the login screen (`LoginView`): a version/build line, the localized
"Made with ❤️ by Services CEO" credit (`splash.madeWithLove`, translated in
de/en/es/fr/pt-BR) and the heart logo.

The whole `VStack` is collapsed into a single VoiceOver element via
`.accessibilityElement(children: .combine)` with an explicit `.accessibilityLabel`.

## Problem

The explicit VoiceOver label was a **hardcoded English string literal**:

```swift
.accessibilityLabel(Text("Meeshy version \(appVersion), build \(buildNumber). Made with love by Services CEO."))
```

Consequences:

1. **i18n gap** — every non-English VoiceOver user hears the footer read out in
   English ("Meeshy version 1.0.0, build 42. Made with love by Services CEO."),
   while the *visible* credit right next to it is correctly localized via
   `splash.madeWithLove`. The label was the only English-only string on an
   otherwise fully-localized, shared brand surface.
2. **Stale catalog pollution** — because it was a raw `Text("…")` literal, Xcode
   string-extraction had captured it as an auto-generated key
   `"Meeshy version %@, build %@. Made with love by Services CEO."` with a single
   untranslated `fr` unit (`state: "new"`, English value) — a permanently-broken
   entry that could never resolve.

This has been flagged as a deferred track since iteration 186i
(`docs/analyses/uiux/2026-07-20-iteration-186i-messagemoresheet.md:100`,
`branch-tracking.md:2657`) but never addressed.

## Why not just reuse `splash.madeWithLove`?

The visible credit uses the ❤️ emoji. If the accessibility label reused that
string, VoiceOver would read "Made with **red heart** by Services CEO" — the
original explicit label deliberately spelled the WORD "love" to keep the reading
natural. Reusing the emoji string would be a reading-quality regression, so the
faithful fix is a dedicated fully-localized label key that preserves the "love"
wording in every language.

Likewise, dropping the explicit label and letting `.combine` synthesize it from
the visible `Text` children was rejected: it would lose the spelled-out
"version"/"build" words and expose the "·" separator / ❤️ emoji to VoiceOver.

## Fix

1. New localized key **`splash.signature.a11yLabel`** (5 languages, positional
   `%1$@`/`%2$@` for version/build, credit with the word "love"/"amour"/"amor"/
   "Liebe"/"amor"), inserted in alphabetical order between `splash.madeWithLove`
   and `splash.tagline`.
2. `BrandSignature` computes `accessibilityLabelText` via
   `String(localized: "splash.signature.a11yLabel", defaultValue: "…\(appVersion)…\(buildNumber)…", bundle: .main)`
   — stable key, interpolated args resolved into the localized format string.
   `Text(String)` uses the verbatim (non-localizing) initializer so the
   already-resolved string is used as-is.
3. Removed the orphaned auto-extracted catalog entry
   `"Meeshy version %@, build %@. Made with love by Services CEO."`.

## Non-goals / unchanged

- Visible layout, fonts (`MeeshyFont.relative`), colors, spacing, the
  `.combine` grouping and the `.accessibilityHidden(true)` on the logo — all
  untouched.
- No logic, no networking, no new tests (pure a11y/i18n string change).

## Verification

- `Localizable.xcstrings` re-parses as valid JSON (1253 keys); new key present,
  stale key removed (verified with `json.load`).
- Gate = CI `iOS Tests` (XcodeGen regenerates the project; the modified file is
  auto-included via recursive globbing).

## Status

✅ Implemented. 1 Swift file (+11 lines: computed `Text` + doc), 1 catalog file
(+1 localized key ×5 langs, −1 stale key). 0 logic / 0 layout / 0 visual change.
