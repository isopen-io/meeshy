# Iteration-186i — i18n + VoiceOver for the translation-confidence badge (PostTranslationSheet)

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (number formatting) + Accessibility (VoiceOver) — Prisme Linguistique
**File touched:** `apps/ios/Meeshy/Features/Main/Views/PostTranslationSheet.swift` (1 file, 0 logic, 0 test, 0 catalog edit)

## Component

`PostTranslationSheet` is the Prisme Linguistique language picker for a **feed
post**: it lists the original language, the available translations, and the
missing preferred languages a user can request. Each available-translation row
(`translationsSection`, `resultRow`-style `Button`) shows the language flag,
name, a one-line preview of the translated text, and — when the backend
returned a `confidenceScore` — a small trailing badge with the translation
quality as a percentage.

## Finding

The confidence badge was the **only** confidence-percentage display in the
entire iOS app (verified: `grep confidence * .swift` → this is the single UI
site), and it was built by hand:

```swift
if let confidence = availableTranslations[lang]?.confidenceScore {
    Text("\(Int(confidence * 100))%")          // ← manual, Latin-only, unlabeled
        .font(.caption.weight(.medium))
        .foregroundColor(theme.textMuted)
}
```

Two defects:

1. **i18n — hardcoded number format.** `Int(confidence * 100)` renders
   Western-Arabic digits and appends a literal `%`. This is not locale-aware:
   Arabic/Persian locales use their own numeral glyphs and place the percent
   sign differently, and RTL layouts expect the sign mirrored. The mission's
   i18n section calls this out explicitly ("number formatting", "avoid
   hardcoded strings"). The codebase already established the correct
   locale-aware idiom in 173i (`MiniAudioPlayerBar.swift:226`):
   `value.formatted(.percent.precision(.fractionLength(0)))`.

2. **a11y — meaningless VoiceOver announcement.** The bare badge exposes only
   "`85 %`" to VoiceOver. Inside the row `Button`, SwiftUI concatenates the
   child labels, so a VoiceOver user hears "`Français, {preview}, 85 %`" — the
   trailing number has no meaning. Nothing tells the user it is a *translation
   confidence* score.

## Fix

Single, self-contained change on the badge, mirroring the shipped 173i idiom
and the `String(localized:defaultValue:)`-with-interpolation a11y pattern
already used at `StatusBarView.swift:88`:

```swift
if let confidence = availableTranslations[lang]?.confidenceScore {
    let percent = confidence.formatted(.percent.precision(.fractionLength(0)))
    Text(percent)                                       // ← locale-aware digits + sign
        .font(.caption.weight(.medium))
        .foregroundColor(theme.textMuted)
        .accessibilityLabel(String(localized: "feed.post.translation.confidence.a11y",
                                   defaultValue: "Confiance de traduction \(percent)",
                                   bundle: .main))       // ← self-describing for VoiceOver
}
```

- `confidence.formatted(.percent.precision(.fractionLength(0)))` is numerically
  identical to `Int(confidence * 100)%` for the current data (`.percent`
  multiplies a `Double` by 100), but renders locale-correct numerals and sign
  placement, RTL-aware. `FloatingPointFormatStyle.Percent` is iOS 15+ — safely
  under the iOS 16 floor and already in production via `MiniAudioPlayerBar`.
- The `.accessibilityLabel` gives the badge meaning. Because the row is a single
  `Button` (one tap target — profile-open equivalent), overriding a *static*
  child's label is safe and does not repeat the 181i "combine over interactive
  children" hazard: there is only one action here, so SwiftUI's automatic child
  concatenation now reads "`Français, {preview}, Confiance de traduction 85 %`".

## Non-goals / deliberately untouched

- **Visual density unchanged.** The badge stays the same subtle muted percentage
  — Prisme "discrétion" (§ Principes) wants the quality signal quiet, not a
  labelled chip. Only the *format* and the *VoiceOver* announcement change.
- **The request-translation rows** (`requestTranslationSection`: unlabeled
  `ProgressView` in the requesting state, decorative `checkmark` read literally
  in the requested state) are a separate VoiceOver-structure concern — deferred
  to a future iteration to keep this change single-purpose.

## Verification status

- **Compile:** no Swift toolchain on this Linux host (iOS compiles on macOS CI).
  Change is view-only; `.formatted(.percent…)` and interpolated
  `String(localized:defaultValue:)` are both established, compiling idioms in
  this codebase (173i, `StatusBarView`, 52 interpolated-defaultValue sites).
  Gate = CI "iOS Tests".
- **Tests:** none added — view-only format/a11y change with no new pure logic,
  consistent with prior single-badge iterations (173i). `PostTranslationSheet`
  has no existing test suite; `missingLanguages`/`availableTranslations` logic
  is untouched.
- **Catalog:** one code-only a11y key (`feed.post.translation.confidence.a11y`),
  no `.xcstrings` edit — consistent with swarm convention.

## Résultat

- ✅ Translation-confidence percentage is now locale-aware (numerals + sign,
  RTL-correct).
- ✅ VoiceOver announces the badge with meaning ("Confiance de traduction 85 %")
  instead of a bare "85 %".
- ✅ No visual regression, no interaction change, no logic change, 1 file.
