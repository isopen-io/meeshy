# Plan — Iteration-212i — CallView audio duration a11y label/value

**Date:** 2026-07-21 · **Track:** iOS (`i`) · **Base:** `main` HEAD `8ba64bb`

## Goal
Give the two fullscreen audio-call duration capsules an explicit VoiceOver
label + value (reusing `call.duration.a11y.label`), so a healthy-link timer is
announced with context instead of a bare "1:23". Mirror of 206i/210i/211i and
the in-file video badge doctrine.

## Steps
1. [x] Resync branch from latest `main` (`8ba64bb`, after 211i merged).
2. [x] Confirm defect: `audioCallLayout` (l.845) + `compactAudioCallHeader`
   (l.919) capsules use bare `.combine`; glyph invisible on healthy link.
3. [x] Confirm `call.duration.a11y.label` exists + localized in
   `Localizable.xcstrings` → 0 new keys.
4. [x] Add `.accessibilityLabel(String(localized: "call.duration.a11y.label"))`
   + `.accessibilityValue(callManager.formattedDuration)` to both duration
   `Text`s; keep `.combine` + `.updatesFrequently`.
5. [x] Add 3 source-inspection tests (per-layout scoping + combine guard).
6. [x] Write analysis + plan + update branch-tracking.
7. [ ] Commit, push, open PR. Gate = CI **iOS Tests**.

## Risk / mitigation
- **`.combine` value merge**: applied to the leaf `Text` (label + value), not
  the container — the container keeps `.combine`, so no child-swallowing
  (the video-badge warning is about container-level label/value). Glyph label
  still merges when visible.
- **Collision**: only open PR is #2255 (shared/languages) — no iOS/CallView
  overlap. Design-tokens audit #2246 does not touch a11y modifiers here.

## Next (213i+)
- `endedView` duration (l.1475) — static past-tense call-summary timer, no
  label; frame with `call.duration.a11y.label` (no `.updatesFrequently`).
- `CallBubbleView` collapsed-call duration — audit for the same bare readout.
