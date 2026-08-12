# Iteration-195i — VoiceOver value for the video position `Slider` in `MessageOverlayMenu`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — video scrubber parity with the audio scrubber
**File touched:** `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift` (1 file, 0 logic, 0 new i18n key, 0 SDK change, 0 new test, 0 visual)

## Component

`MessageOverlayMenu` is the long-press message overlay (quick-reaction bar +
elevated bubble preview + glass actions list). When the previewed message
carries a **video** attachment, `PreviewVideoPlayer.videoControls` renders an
inline transport: a position **`Slider`**, play/pause, ±5 s skip, a percentage
readout, elapsed/total time, and a speed menu — all driven by the shared
`OverlayAudioPlayer` (`player.progress` / `player.percentInt`). The sibling
**audio** transport (`PreviewAudioPlayer`, same file) uses the identical player
and an identical `Slider`.

## Finding

The **audio** position `Slider` (l.884–893) is fully accessible:

```swift
.accessibilityLabel(String(localized: "media.playbackPosition", …))
.accessibilityValue("\(player.percentInt) %")
```

The **video** position `Slider` (l.986–993) carried only `.tint(accent)` — **no
`.accessibilityLabel` and no `.accessibilityValue`**. Consequences for a
VoiceOver user scrubbing a video:

1. **No accessible value.** A native SwiftUI `Slider` is adjustable, so VoiceOver
   announces its *raw* normalized position (a bare `0…1`/percent-of-range) with
   no context — Apple's guidance is to supply `.accessibilityValue()` for
   stateful controls (sliders/progress). The visible percentage `Text` right
   next to it (l.1021) is `.accessibilityHidden(true)`, so the position is
   conveyed **purely visually** — a VoiceOver user got no playback-position
   feedback at all.
2. **No label.** The control had no name, unlike every other control in the
   panel (play/pause l.1009, skip l.1019/1035 all labelled) and unlike its own
   audio twin.

This is a pure **parity gap**: the audio path was fixed, the video path — same
player, same slider — was missed.

## Fix (idiome 189i — accessible sliders)

Two additive modifiers on the video `Slider`, byte-for-byte mirroring the audio
twin:

```swift
.accessibilityLabel(String(localized: "media.playbackPosition", defaultValue: "Playback position", bundle: .main))
.accessibilityValue("\(player.percentInt) %")
```

Now the one adjustable control in the video transport announces a name and a
meaningful position value, matching the audio transport exactly.

## Rationale

Scrubbing is the primary interaction of a media transport; a VoiceOver user must
know *where* playback is and be able to move it. The fix reuses the **existing**
`media.playbackPosition` string (the same inline key the audio slider already
declares via `String(localized:defaultValue:bundle:)`) and the **existing**
`OverlayAudioPlayer.percentInt` accessor — so it introduces **no new i18n key**,
no catalog churn, no logic, and no visual change. It simply extends the proven
189i "accessible slider" idiom to the one control that was overlooked.

## i18n

- **0 new keys.** `media.playbackPosition` is already referenced by the audio
  slider (l.892) with the same `defaultValue: "Playback position"`. The value
  string is a locale-neutral integer percentage (`"\(percentInt) %"`), identical
  to the audio twin — no catalog edit.

## Verification

- **Static review:** `.accessibilityLabel` / `.accessibilityValue` are iOS 13+;
  app floor is iOS 16 — no availability guard. `OverlayAudioPlayer.percentInt`
  (`Int(progress * 100)`) is defined in-file (l.1103) and already consumed by
  the audio slider and the hidden percentage `Text` — API confirmed.
- **Only Slider in the video panel:** the two `Slider(` occurrences in the file
  are the audio scrubber (now both labelled) and this video scrubber (now
  labelled) — no other unlabelled adjustable control remains.
- **No visual/logic change:** only accessibility modifiers were added;
  layout, tint, binding, seek behaviour, animations, and the visible percentage
  readout are untouched. Accessibility modifiers don't affect hit-testing, so
  sighted scrubbing is unaffected.
- **No test churn:** the single test referencing this file,
  `ConversationMenuSystemDesignGuardTests`, is a source-structure guard
  (reactions bar / bubble preview / actions menu presence) — the additive
  modifiers don't touch any guarded element. No test references
  `videoControls`, `percentInt`, or `playbackPosition`.
- **Contention:** no open iOS PR touches `MessageOverlayMenu` (verified against
  the in-flight swarm list #2146–#2182).
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  compile/VoiceOver run happens in CI. Confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `MeeshyAppIntents.swift` (`NotificationCheckView`) — hardcoded `.foregroundColor(.blue)`
  bell icon (→ Indigo brand) + non-localized `Text("\(unreadCount) Unread")` /
  `Text("Try asking Siri:")` (Siri snippet view, under-tested). One dedicated
  iteration.
- `EditPostSheet.swift` — segmented Post/Réel `Picker` (l.241–246) has no
  `.accessibilityValue` for the selected type, unlike its sibling fields.

**Status: RESOLVED for `MessageOverlayMenu` video-scrubber VoiceOver value/label
parity. Do not re-flag.**
