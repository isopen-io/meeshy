# Iteration-212i — CallView duration readouts VoiceOver label+value

**Date:** 2026-07-21
**Surface:** `apps/ios/Meeshy/Features/Main/Views/CallView.swift`
**Type:** Accessibility (VoiceOver) — WCAG 1.4.1 / naked-numeric-readout doctrine
**Iteration:** 212i (chosen strictly > highest in-flight; 211i `FloatingCallPillView` merged as #2253)

## Problem

The full-screen `CallView` renders the live/ended call duration (`callManager.formattedDuration`, e.g. "0:34") in **three** places that VoiceOver announced as a **bare number with no context** — the exact "naked numeric readout" gap solved for sibling surfaces in 206i / 210i / 211i:

1. **`audioCallLayout`** (audio call, connected) — duration capsule used `.accessibilityElement(children: .combine)`, which folds the child `Text`'s content into the combined label → VoiceOver said just "0:34".
2. **`compactAudioCallHeader`** (audio call with captions active) — same `children: .combine` pattern → "0:34".
3. **`endedView`** (post-call summary) — the final total-duration `Text` had **no** accessibility modifier at all → default label "0:34".

The **video** duration badge (`videoDurationBadgeAccessibilityLabel` + `.accessibilityValue`, lines ~961/1066) was already correct — this iteration brings the audio/ended paths to parity.

## Fix

Mirror the established 211i / video-badge pattern: give each readout an explicit **label** (context) + **value** (the number), so VoiceOver announces "Durée de l'appel, 0:34".

- Reuse the **existing** `call.duration.a11y.label` key (= "Durée de l'appel"), already defined in `Localizable.xcstrings` and consumed by the video badge → **0 new i18n keys**.
- `audioCallLayout` / `compactAudioCallHeader`: replace `.accessibilityElement(children: .combine)` with `.accessibilityElement(children: .ignore)` + `.accessibilityLabel` + `.accessibilityValue`; keep `.accessibilityAddTraits(.updatesFrequently)`.
- `endedView`: add `.accessibilityLabel` + `.accessibilityValue` on the static final-duration `Text` (no `.updatesFrequently` — the call has ended).

### Why the audio label carries no signal state (unlike the video badge)

The video badge composes signal-quality / peer-network / reconnecting state into its label because it is the **only** surface for that state in the video chrome. The audio layout surfaces the same states through a **separate `statusPill` row** ("Connexion instable", "Reconnexion…", etc.), each with its own accessible label. Folding signal state into the audio duration label would **double-announce** degradation. The decorative `TransientCallSignalGlyph` sibling is therefore correctly dropped from the badge's a11y element (`children: .ignore`).

## Scope

- **1 file**, +19 lines (11 comment). 0 logic / 0 network / 0 layout / 0 visual / 0 new i18n key / 0 new test.
- Verified all four `formattedDuration` render sites on the screen are now covered (video badge was already done).

## Verification

- Static review: label/value parity with proven siblings `FloatingCallPillView.statusLine` (211i, #2253), `AudioPostComposerView.durationLabel` (210i), the CallView video badge, and the doctrine documented in the file's own comments (lines ~952–972).
- iOS build/tests not runnable on Linux (no Xcode/Swift toolchain) → **gate = CI `iOS Tests`**.
- Collision check: `CallView` absent from all open iOS PRs (only #2255 shared/languages open at branch time).

## ⚠️ Do NOT re-flag

`CallView` call-duration readouts (audio connected, compact captions header, ended summary) — VoiceOver label/value soldered **212i**. The video badge was already covered pre-212i.

## Next 213i+ path

Other bare numeric readouts on call surfaces: `CallBubbleView` (collapsed pill), participant-count / stats readouts; audit label+value pairing, verify swarm collision via `list_pull_requests` first.
