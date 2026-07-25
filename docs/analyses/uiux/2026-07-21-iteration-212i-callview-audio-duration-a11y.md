# Iteration-212i — CallView audio-call duration: labelled VoiceOver value

**Date:** 2026-07-21
**Track:** iOS UI/UX (suffix `i`)
**Area:** Accessibility (VoiceOver) — active-call chrome
**File:** `apps/ios/Meeshy/Features/Main/Views/CallView.swift` (+ test)

## Context / doctrine

This continues the "bare numeric readout" a11y line soldered by:
- **206i** — `MessageReactionsDetailView` filter count (label + value)
- **210i** — `AudioPostComposerView.durationLabel` recording chrono
- **211i** — `FloatingCallPillView.statusLine` call duration

Each fixed a prominent number that VoiceOver announced **without semantic
context** by pairing a static `.accessibilityLabel` with a dynamic
`.accessibilityValue` (so the label reads once and the value updates under
`.updatesFrequently`).

The tracking pointer for 212i explicitly nominated **`CallView` fullscreen**
call-duration displays as the next target.

## Defect

`CallView` has three duration readouts:

| Site | State | a11y before |
|------|-------|-------------|
| `videoCallLayout` badge (l.1026) | ✅ already fixed | composed `videoDurationBadgeAccessibilityLabel` + `.accessibilityValue(formattedDuration)` + `children: .ignore` + `.updatesFrequently` |
| `audioCallLayout` capsule (l.845) | ❌ **bare** | `.accessibilityElement(children: .combine)` only |
| `compactAudioCallHeader` capsule (l.919) | ❌ **bare** | `.accessibilityElement(children: .combine)` only |

Both audio capsules render `Text(callManager.formattedDuration)` next to a
`TransientCallSignalGlyph`. That glyph is **invisible on a healthy link** (it
only appears on degradation — see `CallSignalGlyph.swift`), so on a normal
call the combined element announces a **context-free "1:23"** — a VoiceOver
user cannot tell it is the call timer. This is exactly the 211i defect on the
fullscreen surface.

## Fix

On each audio duration `Text`, add:

```swift
.accessibilityLabel(String(localized: "call.duration.a11y.label"))
.accessibilityValue(callManager.formattedDuration)
```

- **Reuses the existing `call.duration.a11y.label` key** already used by the
  video badge — fully localized in `Localizable.xcstrings` (en "Call
  duration" / fr "Durée de l'appel" / de / es / pt-BR). **0 new i18n keys, 0
  `.xcstrings` edit.**
- **Keeps `.accessibilityElement(children: .combine)`** on the capsule (does
  NOT collapse to `.ignore`). Unlike the video badge — which has no status
  row and must fold degraded state into a composed label — the audio capsule
  relies on `.combine` so the glyph's own `.accessibilityLabel` ("Signal
  faible", etc.) still merges in when the link degrades. `audioCallLayout`
  additionally surfaces degraded/muted/signaling state via its `statusPill`
  row; `compactAudioCallHeader` (caption mode) has no status row, so keeping
  the glyph merge is the only way its signal state reaches VoiceOver.
- `.accessibilityAddTraits(.updatesFrequently)` already present on both
  capsules — unchanged.

Result — VoiceOver announces:
- healthy link → "Durée de l'appel, 1:23"
- degraded link → "Signal faible, Durée de l'appel, 1:23" (glyph merged)

## Scope / non-goals

- 2 duration Texts in 1 file, +label/+value each. **0 logic / 0 network / 0
  layout / 0 visual change.** Static label + separate value is the correct
  timer pattern (label read once, value re-read on tick, not the whole label).
- The **ended-summary** duration (`endedView`, l.1475) is intentionally out of
  scope: it is static/past-tense and framed by the adjacent
  `endReasonText(reason)` ("Appel terminé") stop → weaker case, different
  treatment (no `.updatesFrequently`). Nominated as the 213i path.

## Tests

`apps/ios/MeeshyTests/Unit/Views/CallViewAccessibilityTests.swift` — source-
inspection tests (the file's established convention), scoped per layout marker:
- `test_audioCallLayout_durationCapsule_hasLabelledAccessibilityValue`
- `test_compactAudioCallHeader_durationCapsule_hasLabelledAccessibilityValue`
- `test_audioDurationCapsules_keepCombineToPreserveSignalGlyph` (regression
  guard against a future collapse to `.ignore` that would swallow the glyph)

## Verification status

- ✅ Static parity: label/value insertion mirrors the file's own video badge
  (l.1054/1068) and the 211i FloatingCallPillView pattern.
- ✅ Reused i18n key confirmed present + localized in `Localizable.xcstrings`.
- ✅ Existing video-badge tests unaffected (they anchor on `videoCallLayout` /
  `videoDurationBadgeAccessibilityLabel`).
- ⏳ Gate: CI **iOS Tests** (compile Xcode 26.1.1 / Swift 6.2, simulator iOS
  18.2). Author runs in a Linux container (no Xcode toolchain) → Xcode
  build/tests validated in CI.

## Completion

Audio-call duration capsules (`audioCallLayout`, `compactAudioCallHeader`) now
carry an explicit labelled VoiceOver value. **⚠️ Do NOT re-flag** these two
capsules — soldered 212i. The video badge was already covered.
