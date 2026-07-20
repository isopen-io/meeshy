# Iteration-195i — Localize the hardcoded English VoiceOver label of `BrandSignature`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver)
**Files touched:**
- `apps/ios/Meeshy/Features/Main/Components/BrandSignature.swift` (1 Swift file)
- `apps/ios/Meeshy/Localizable.xcstrings` (1 new key, 5 languages)

(0 logic change, 0 layout/visual change, 0 SDK change, 0 new test)

## Component

`BrandSignature` is the shared brand footer — a version line
(`Meeshy {version} · {build}`), the "Fait avec ❤️ par Services CEO" credit
(`splash.madeWithLove`, already localized in de/en/es/fr/pt-BR) and the heart
logo. It is rendered on **both** the splash screen (`MeeshyApp`) and the login
screen (`LoginView`), so every user hits it before authenticating — a
high-frequency first-impression surface.

## Finding

The visible credit text was correctly localized via `splash.madeWithLove`, but
the VoiceOver label overriding the combined element shipped **hardcoded English**
regardless of app language:

```swift
.accessibilityElement(children: .combine)
.accessibilityLabel(Text("Meeshy version \(appVersion), build \(buildNumber). Made with love by Services CEO."))
```

A French, German, Spanish or Brazilian-Portuguese VoiceOver user saw a French
credit on screen but heard *"Meeshy version 1.0.0, build 1. Made with love by
Services CEO."* spoken in English — an SSOT + localization violation (the same
credit is stored translated one property above, yet re-typed in English here) and
a genuine accessibility-parity defect (spoken content diverges from displayed
content). The literal also duplicated the "Made with love by Services CEO" credit
instead of reusing the single source `splash.madeWithLove`.

## Fix

All additive, maximum reuse, zero behavior change:

- Extracted a `accessibilityLabelText: Text` computed property that composes the
  spoken label from **two localized pieces**:
  1. a new key `brand.signature.version.a11y` = `"Meeshy version %1$@, build %2$@"`
     (positional format, translated across the 5 shipped languages: de/en/es/fr/pt-BR),
     interpolating `appVersion` / `buildNumber` via `String(format:)`;
  2. the existing `splash.madeWithLove` credit — **reused, not re-typed** (fixes
     the SSOT duplication so the credit is now spoken in the same language it is
     shown, emoji included).
- Joined with `". "` and passed to `.accessibilityLabel(accessibilityLabelText)`.

The visible layout, fonts (`MeeshyFont.relative`), colors, the decorative heart
`.accessibilityHidden(true)`, and the `.combine` grouping are all byte-identical.
Only the spoken string changed — from English-only to fully localized.

### New i18n key

`brand.signature.version.a11y` (extractionState `manual`, all 5 units
`translated`):

| Lang | Value |
|------|-------|
| fr (source) | `Meeshy version %1$@, build %2$@` |
| en | `Meeshy version %1$@, build %2$@` |
| de | `Meeshy Version %1$@, Build %2$@` |
| es | `Meeshy versión %1$@, compilación %2$@` |
| pt-BR | `Meeshy versão %1$@, build %2$@` |

Net: **1 new key** (version line only) + **1 key reused** (`splash.madeWithLove`).

## Rationale

The footer is the first thing every user's VoiceOver hits at launch/login;
speaking it in the wrong language is a jarring, easily-avoided inconsistency. The
version line legitimately needs new copy (there was no existing key for it), but
the credit is already a single source — reusing it removes the duplication that
caused the drift in the first place, so the label can never again diverge from the
visible credit when the credit string is updated.

## Verification

- **Static review:** `String(localized:defaultValue:bundle:)`, `String(format:)`
  and `.accessibilityLabel(_ text: Text)` are all iOS 16+ APIs (app floor iOS 16.0)
  with heavy precedent in this codebase — no availability guard. `%1$@`/`%2$@`
  positional specifiers are honored by every listed locale's translation. The
  `.xcstrings` file re-parses as valid JSON after insertion (1246 strings).
- **No behavior change:** version/build read from the same `Bundle.main` keys;
  visible Texts, layout, and the heart logo are untouched. Only the spoken
  accessibility string is now localized.
- **Test churn:** none. Pure-additive VoiceOver-metadata + i18n changes aren't
  observable through XCTest without a UI-test harness — consistent with the swarm
  precedent (183i/184i/185i/191i all shipped 0 new test for this class of fix).
- **CI gate:** `iOS Tests` (macOS runner). This is a Linux container, so the
  compile + run happen in CI (`xcodegen generate` auto-includes no new source file;
  the edited `.xcstrings` is bundled). Confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `MessageViewsDetailView.sendAttemptsCard` — French literals
  (`"Historique d'envoi"`, `"1ère tentative"`, `"Tentative \(n)"`) hardcoded
  (candidate: localize with a pluralized/positional key). Noted as deferred since
  186i; verify collision with the swarm via `list_pull_requests` before taking it.
- `MessageDetailSheet` views-filter chip + reaction-filter capsule — color-only
  selected state without `.isSelected` (large file; own focused iteration).

**Status: RESOLVED for `BrandSignature` VoiceOver label localization.**
