# Iteration-189i — VoiceOver slider values for `VideoFilterControlView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — adjustable slider values
**File touched:** `apps/ios/Meeshy/Features/Main/Views/VideoFilterControlView.swift` (1 file, 0 logic, 0 new key, 0 new test)

## Component

`VideoFilterControlView` is the color-grading control shown inside
`VideoFiltersPanel` (the in-call video effects overlay). It exposes an
enable/disable `Toggle` plus five adjustment `Slider`s — Temperature,
Brightness, Contrast, Saturation, Exposure — each rendered by the private
`filterSlider(icon:label:value:range:neutral:)` helper. Every row shows a
leading SF Symbol, a localized label, the slider, and a trailing monospaced
value read out of `formatValue(_:neutral:)` (e.g. `0`, `+0.2`, `-0.4`).

The screen was already **fully localized** (`String(localized:defaultValue:)`
at every call site), used **only semantic fonts** (`MeeshyFont.relative`),
brand-correct tints (`MeeshyColors.indigo500` / `brandGradient`), had its
header marked `.isHeader`, hid decorative glyphs, and labelled the enable
`Toggle`. Dynamic Type, i18n and brand color were therefore already sound —
the remaining gap was the sliders' VoiceOver **value**.

## Findings

Each slider carried `.accessibilityLabel(label)` but **no
`.accessibilityValue`**. A SwiftUI `Slider` is natively *adjustable* under
VoiceOver, so without an explicit value it announces its raw position as a
**percentage of the `range`** — which is meaningless here:

- Brightness range is `-0.5…0.5`, neutral `0` → the slider announces
  "50 %" at the neutral center instead of "0".
- Temperature is driven through a normalized `0…1` binding
  (`temperatureBinding`), so its percentage bears **no relation** to the
  Kelvin value or to the "±delta" number sighted users read.

So a sighted user saw a precise, neutral-relative delta (`+0.2`) while a
VoiceOver user heard an unrelated, misleading percentage. This is the same
"stateful control announces the wrong/absent value" gap the doctrine calls
out explicitly ("Use `.accessibilityValue()` for stateful controls —
sliders, toggles, progress"), and a **WCAG 1.3.1 / 4.1.2** (name/role/value)
failure.

Secondarily, the leading label `Text` and the trailing value `Text` were
**separate VoiceOver elements**, so sweeping a row produced three stops —
"Brightness" (label text), "Brightness, adjustable, 50 %" (slider), "+0.2"
(value text) — a redundant, confusing focus order.

## Fix

Fold both satellite `Text`s into the slider so each row is a **single
adjustable VoiceOver element** carrying the label *and* the meaningful value:

1. `Slider` → add `.accessibilityValue(formatValue(value.wrappedValue,
   neutral: neutral))`. Reuses the **exact same** `formatValue` call the
   visible trailing label already renders, so the spoken value and the shown
   value can never diverge, and increment/decrement swipes re-read it
   (binding write → body re-eval → fresh `accessibilityValue`).
2. Leading label `Text(label)` → `.accessibilityHidden(true)` (its content is
   already the slider's `accessibilityLabel`).
3. Trailing value `Text` → `.accessibilityHidden(true)` (folded into the
   slider's `accessibilityValue`).

Result: VoiceOver now reads e.g. "Brightness, +0.2, adjustable" and swiping
up/down announces the neutral-relative delta the sighted user sees.

## Constraints honoured

- **0 logic change** — no binding, range, `formatValue`, or layout math
  touched; purely additive accessibility modifiers.
- **0 visual change** — both `Text`s still render identically on screen; only
  their exposure to the accessibility tree changed.
- **0 new i18n key** — `formatValue` output is numeric (`+0.2`), locale-neutral
  by design; the label already localized.
- **0 new test** — no test references the view; behaviour is unchanged.

## Verification

- Build not runnable in this Linux CI container (no Xcode); change is limited
  to three standard SwiftUI accessibility modifiers on existing views.
- Parity guaranteed by construction: the `accessibilityValue` string is the
  same `formatValue(_:neutral:)` expression as the visible trailing `Text`.
- Gate = CI `iOS Tests`.

## Status

**RESOLVED.** `VideoFilterControlView` sliders now expose neutral-relative
values to VoiceOver and each row is a single adjustable element. Do not
reintroduce a bare `Slider` without `.accessibilityValue` here.

### Remaining candidates (distinct files — verify contention first)
- `VideoFiltersPanel` `presetSelector` / `advancedToggles` — check selected-state
  and toggle labelling.
- `MessageOverlayMenu` slider (font-size / other) — same `.accessibilityValue` audit.
