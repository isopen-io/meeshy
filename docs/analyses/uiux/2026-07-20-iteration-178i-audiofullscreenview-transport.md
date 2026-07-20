# Iteration-178i — VoiceOver for `AudioFullscreenView` transport controls

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — full-screen audio player transport
**File touched:** `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift` (1 file, 0 logic, 0 new test)

## Component

`AudioFullscreenView` is the immersive, full-screen audio player presented when
an audio attachment is opened (conversation bubbles, feed posts, comments,
reels). Each page (`AudioFullscreenPage`) stacks: a top bar (close / page
indicator / download), author row, a scrubbable **waveform**, center transport
(−10s / play-pause / +10s), a draggable **seek bar**, a **time row**, a
**speed row** (1× / 1.25× / 1.5× / 1.75× / 2×), and a transcription panel with
per-language pills.

## Findings

The icon-only transport buttons (close, skip ±10, play/pause, download,
translate) were already labelled in prior passes. Three gaps remained, all on
the **playback transport** — the surface a VoiceOver user most needs to operate:

1. **The seek bar was invisible to VoiceOver.** `seekBar` is a fully custom
   scrubber — `Capsule` track + `Capsule` fill + `Circle` thumb driven by a
   `DragGesture`. It carried **no** accessibility element, so playback position
   lived only in the fill width and thumb offset (a geometry/color channel), and
   there was **no way to seek without sight**. A custom control that replaces a
   `Slider` must re-declare the slider semantics.

2. **The waveform exposed a second, conflicting seek affordance.**
   `waveformSection` is a decorative bar visualization that *also* seeks on tap.
   With no accessibility treatment it swept as 80 anonymous fragments, and —
   had it been made adjustable — VoiceOver would have offered **two** adjustable
   scrubbers for the same position, which is worse than one.

3. **Selected playback speed was conveyed by color only.** Each `speedRow`
   button signalled the active speed solely through the accent-fill capsule +
   black text. VoiceOver read "1.5×, button" with no indication that it was the
   selected rate — a "never rely on color alone" violation.

## Fix

1. **`seekBar` → native VoiceOver slider.**
   - `.accessibilityElement()` collapses the shape children into one control.
   - `.accessibilityLabel` — stable identity ("Position de lecture").
   - `.accessibilityValue(seekPositionAccessibilityValue)` — the spoken position
     ("0:42 sur 3:15"), mirroring the visible `timeRow` and following the live
     seek preview (`isSeeking ? seekValue * estimatedDuration : currentTime`).
   - `.accessibilityAdjustableAction` — VoiceOver swipe-up/down seeks ±10 s by
     reusing the existing `player.skip(seconds:)` (identical behavior to the
     ±10 s transport buttons; **no new playback logic**), plus a light haptic.
   One supporting computed helper `seekPositionAccessibilityValue`.

2. **`waveformSection` → `.accessibilityHidden(true).`** It is a decorative
   visualization and a *duplicate* tap-to-seek affordance; the accessible slider
   is `seekBar`. Hiding it leaves exactly one adjustable scrubber for the
   position.

3. **`speedRow` → name + selected trait.** `.accessibilityLabel` ("Vitesse
   {label}") gives the buttons context beyond a bare "1×", and
   `.accessibilityAddTraits(player.speed == speed ? .isSelected : [])` carries
   the active rate through a non-color channel.

Three new inline-`defaultValue` keys — `audio.fullscreen.seek.a11y-label`,
`audio.fullscreen.seek.a11y-value`, `audio.fullscreen.speed.a11y-label` —
French defaults ship inline (code-only, **0 `.xcstrings` edits**), matching the
existing `audio.fullscreen.*` key family already in this file.

## Rationale

Loading/interaction states and "never rely only on color" are explicitly in the
UX + accessibility review scope. A full-screen media player whose **primary
control cannot be operated by VoiceOver** is the sharpest accessibility gap on
this screen. `.accessibilityAdjustableAction` is the canonical Apple pattern for
a custom slider (precedent: SDK `DurationHandle`/`PlayheadView`, app `CallView`);
the empty-traits ternary and interpolated `String(localized:defaultValue:)`
follow established precedent (167i `UploadProgressBar`). No visual design change
(Instant-App / Indigo brand identity preserved).

## Verification

- **Static review:** `accessibilityElement`, `accessibilityLabel`/`Value`,
  `accessibilityAdjustableAction`, `accessibilityHidden`, `accessibilityAddTraits`
  are all standard SwiftUI iOS 16.0+ APIs. App floor is iOS 16.0 — no
  availability guard needed. `player.skip(seconds:)` is the same method already
  called by the ±10 s transport buttons (lines 670/707).
- **No test churn:** no test references `AudioFullscreenView`/`AudioFullscreenPage`
  transport internals. The `.accessibilityValue` derives from existing
  `formatMediaDuration` + `estimatedDuration`; no behavior change.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations)

- Page indicator `Text("\(pageIndex + 1) / \(totalPages)")` (line ~483) still
  reads as terse "1 / 3" — a "Piste X sur Y" label (163i `AudioCarouselView`
  precedent) is a small future win.
- `timeRow`'s two time labels sweep as separate elements — acceptable
  (informational; the slider value now carries the combined position).
- The 6 `.font(.system(size:))` in this file are frozen chrome glyphs
  (doctrine 82i) — intentionally unchanged.

**Status: RESOLVED for `AudioFullscreenView` transport-control VoiceOver
(seek bar slider, waveform decorative hide, speed selected-state).**
