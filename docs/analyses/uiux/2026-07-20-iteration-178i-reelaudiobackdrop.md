# Iteration-178i — Reduce Motion + decorative VoiceOver for `ReelAudioBackdrop`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (Reduce Motion + VoiceOver decorative hiding) — audio-reel feed backdrop
**File touched:** `apps/ios/Meeshy/Features/Main/Views/ReelAudioBackdrop.swift` (1 file, 0 logic, 0 new test)

## Component

`ReelAudioBackdrop` is the background drawn behind an **audio** reel in the feed:
an accent-color gradient plus a 28-bar waveform that pulses while the reel is
the most-centered card (`isActive`), with a large decorative `waveform` glyph.
No audio plays in the feed — sound starts in the fullscreen viewer on tap.
It is an `Equatable` leaf view instantiated at exactly one site
(`ReelFeedCard.swift:173`, the `.audio` case) and has no test references.

## Findings

Two real accessibility gaps, both explicitly in the routine's a11y checklist:

1. **Infinite animation ignoring Reduce Motion.** `startAnimating()` ran an
   `.easeInOut(duration: 0.6).repeatForever(autoreverses: true)` waveform pulse
   unconditionally on appear and on every `isActive` transition. It honored
   neither the system `accessibilityReduceMotion` setting nor Meeshy's in-app
   `meeshyForceReduceMotion` override. Every other animated backdrop in the app
   (`ConversationBackgroundComponents`, `ConversationAnimatedBackground`,
   `CallEffectsOverlay`, …) already gates its perpetual motion on Reduce Motion;
   this one was the outlier — a continuously moving element for a user who has
   explicitly asked the system to stop non-essential motion.

2. **Purely decorative backdrop exposed to VoiceOver.** The view carried no
   accessibility treatment. The semantic content of an audio reel (author,
   caption, audio affordance) is owned by `ReelFeedCard`; this gradient +
   waveform layer is pure decoration, yet the `waveform` SF Symbol sat in the
   accessibility tree as an unlabeled image fragment.

## Fix

Adopted the SDK's existing motion + a11y primitives (no new abstractions):

- Added `@Environment(\.accessibilityReduceMotion)` +
  `@Environment(\.meeshyForceReduceMotion)` and a `reduceMotion` computed
  property resolved through `MeeshyMotion.shouldReduce(system:userForced:)`
  (the pure, testable resolver in `MeeshyUI/Theme/Accessibility.swift`).
- Guarded `startAnimating()` with `guard !reduceMotion else { return }`. When
  Reduce Motion is active the animation never starts, so `phase` stays `0` and
  `barHeight(_:)` returns `base + amp · |sin(i · 0.5)|` — a **static, varied
  waveform silhouette** rather than a flat bar or a running loop. The backdrop
  still reads as a waveform; it simply doesn't move.
- Added `.accessibilityDecorative()` (the SDK's clearer alias for
  `.accessibilityHidden(true)`) to the `ZStack` so VoiceOver skips the whole
  decorative layer and lands on the reel's real content.

No behavior change for users without Reduce Motion: the pulse animation is
identical. Palette, layout, `isActive` gating, and the Equatable conformance are
untouched. The `waveform` glyph stays a fixed 44pt symbol — intentional (bounded,
decorative, now `accessibilityHidden` via the parent), commented per doctrine 86i.

## Rationale

Reduce Motion and "hide decorative elements from VoiceOver" are both first-class
items in the accessibility review scope. A feed can hold several audio reels;
an unbounded pulsing gradient behind content is exactly the kind of ambient
motion Reduce Motion exists to suppress, and consistency with the app's other
backdrops matters. Reusing `MeeshyMotion.shouldReduce` and
`.accessibilityDecorative()` keeps the single-source-of-truth for motion policy
intact instead of introducing a bespoke check.

## Verification

- **Static review:** all four APIs are `public` in `MeeshyUI`, which the file
  already imports (`MeeshyMotion`, `EnvironmentValues.meeshyForceReduceMotion`,
  `View.accessibilityDecorative()`); `accessibilityReduceMotion` is a standard
  SwiftUI environment key. App floor is iOS 16.0 — no availability guard needed.
  The `guard !reduceMotion` + `MeeshyMotion.shouldReduce` pattern matches
  `ConversationBackgroundComponents.startAnimations()` exactly.
- **Equatable safety:** the manual `==` still compares only `accentHex` /
  `isActive`. `reduceMotion` is read in `startAnimating()` (driven by
  `.onAppear` / `.adaptiveOnChange(of: isActive)`), not in `body` layout, so the
  environment reads never widen the leaf view's re-render surface — the
  "Zero Unnecessary Re-render" doctrine holds. Reduce Motion takes effect on the
  next appearance/activation, consistent with the other backdrops.
- **No test churn:** no test references `ReelAudioBackdrop` (grep across
  `MeeshyTests` / `MeeshyUITests` = 0). The single call site
  (`ReelFeedCard.swift:173`) passes `accentHex` / `isActive` unchanged.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations)

- `ReelFeedVideoSurface` / `ReelFeedCard` — audit whether their active-card
  transitions equally honor Reduce Motion (not scanned this iteration).
- The 44pt `waveform` glyph is a fixed symbol font — bounded/decorative, left
  as-is per doctrine 86i.

**Status: RESOLVED for `ReelAudioBackdrop` Reduce Motion + decorative VoiceOver.**
