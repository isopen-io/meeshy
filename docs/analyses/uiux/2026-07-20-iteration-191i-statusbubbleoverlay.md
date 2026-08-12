# Iteration-191i — VoiceOver reachability for `StatusBubbleOverlay`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — mood/status pop-up bubble (reply action, audio transport, dismiss)
**File touched:** `apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift` (1 file, 0 logic, 1 new inline key, 0 SDK change, 0 new test)

## Component

`StatusBubbleOverlay` is the floating pop-up shown when a mood/status avatar is
tapped (rendered as a ZStack overlay via `StatusBubbleController` /
`ConversationListView`). It shows either a **text mood** or an **audio mood**
(auto-playing voice clip with a linear progress bar), the relative time, an
optional « via @username » for republished moods, and — for **other users'**
moods only — an optional **Republish** button. Tapping the bubble body triggers
a **reply** (also other-users-only, wired in `StatusBubbleController:106`).

## Findings (explicitly deferred by 184i as "its own focused iteration")

The bubble carried three VoiceOver defects, and the nested interactive controls
are exactly why 184i deferred it:

1. **Reply was invisible to VoiceOver.** The primary reply affordance is a bare
   `.onTapGesture { replyTapped() }` on the bubble content. `.onTapGesture`
   creates **no** accessibility action, so a VoiceOver user had **no way to
   reply** — a WCAG 2.1.1 failure. The pre-existing `.accessibilityHint` was
   attached to a container that wasn't itself an accessibility element, so it
   was effectively dropped.
2. **Audio progress had no accessible value.** The `ProgressView(value:)` linear
   bar conveyed playback position purely visually — no `.accessibilityValue`
   (Apple: "use `.accessibilityValue()` for stateful controls … progress").
3. **No VoiceOver dismiss path.** The bubble is a ZStack overlay (not a system
   sheet), and tap-to-dismiss is a non-focusable `Color.clear` — so VoiceOver
   users had no standard way to close it.

A naïve `.accessibilityElement(children: .combine)` (the usual fix for a
color/state-only row) was **wrong** here: the content nests an audio
play/stop `Button` and a conditional Republish `Button`, which `.combine` would
either swallow or leave ambiguous (which button does a double-tap trigger?).

## Fix (idiome 183i — `CommunityLinksView`)

Modelled the whole bubble as **one deliberate VoiceOver element** with the
primary action as activation and the secondary controls re-exposed via the
Actions rotor — the same proven pattern used in 183i:

- `.accessibilityElement(children: .ignore)` — collapse the bubble (text/audio
  content, timestamp, via, nested buttons, progress bar) into a single element.
- `.accessibilityLabel(bubbleAccessibilityLabel)` — composed « {contenu | Humeur
  audio}, {ancienneté}[, via @…] ».
- `.accessibilityValue(bubbleAccessibilityValue)` — audio playback percentage,
  formatted locale-aware via `progress.formatted(.percent.precision(.fractionLength(0)))`
  (**0 new i18n key**); empty for text moods.
- `.accessibilityAddTraits(onReplyTapped != nil ? .isButton : [])` — button
  trait only when reply is actually available (other users' moods).
- `.accessibilityAction { replyTapped() }` — default activation (double-tap) =
  reply, mirroring the sighted tap (`replyTapped()` already no-ops when reply is
  unavailable, matching the always-present `.onTapGesture`).
- `.accessibilityActions { … }` — rotor actions: **Play/Stop mood** (audio moods)
  and **Republish** (other users' moods), reusing the existing localized button
  strings (`status.bubble.audio.play/stop`, `status.bubble.republish`).
- `.accessibilityAction(.escape) { dismiss() }` on the root ZStack — the standard
  VoiceOver two-finger-scrub now closes the bubble.

The now-inert inner `.accessibilityLabel` on the audio play button was removed
(its semantics live in the container's named action under `children: .ignore`),
replaced by an explanatory comment.

## Rationale

Moods are a lightweight, expressive social surface; a VoiceOver user must be
able to (a) know whose mood this is and when, (b) reply, (c) play/scrub the
audio and know how far it's played, (d) republish, and (e) close the bubble.
The fix delivers all five through native SwiftUI accessibility APIs without
touching layout, color, animation, gestures, or the Indigo/glass visual
identity. Double-tap = reply (matches the sighted primary tap); rotor = the
secondary controls (matches the small visible buttons).

## i18n

- **1 new inline key** `status.bubble.audio.a11yLabel` (default « Humeur audio »),
  declared via `String(localized:defaultValue:bundle:)` — **0 `.xcstrings` edit**,
  identical idiom to every other `status.bubble.*` string already inline in this
  file. All other announced strings reuse existing keys or locale-aware
  `FormatStyle`, so no catalog churn.

## Verification

- **Static review:** `.accessibilityElement(children:)`, `.accessibilityAction`,
  `.accessibilityActions`, `.accessibilityAction(.escape)`, and
  `Double.formatted(.percent…)` are all iOS 16.0+ (`.formatted` is 15.0+). App
  floor is iOS 16.0 — no availability guard needed. `audioPlayer.progress:Double`,
  `isPlaying:Bool`, `togglePlayPause()` API confirmed in
  `MeeshyUI/Media/AudioPlayerView.swift`.
- **No visual/logic change:** only accessibility modifiers were added/moved; the
  visible bubble, buttons, progress bar, auto-play, animations, haptics, reply
  callback, and dismiss timing are untouched. Accessibility modifiers don't
  affect hit-testing, so sighted tap-to-reply, the audio button, and
  tap-outside-to-dismiss are unaffected.
- **No test churn:** no test references `StatusBubbleOverlay` (grep across
  `MeeshyTests` / `MeeshyUITests` / SDK tests = 0). Call sites
  (`StatusBubbleController`, `ConversationListView`) pass the same parameters.
- **Contention:** 0 open PRs touch `StatusBubbleOverlay` (`search_pull_requests`).
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  compile/VoiceOver run happens in CI. Confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `ConversationDashboardView` `periodPicker` — `ChartPeriod.all = "Tout"` hardcoded
  French + color/weight-only selection (already in flight #2158/#2167 — do not
  re-flag).
- `AudioFullscreenView` — playback-speed pills + `languagePill` color-only
  selection (in flight #2144 — do not re-flag).
- `FeedCommentsSheet` (1717 l, several `.system(size:)`) — hardcoded font sizes
  → Dynamic Type; large file, warrants a dedicated iteration.

**Status: RESOLVED for `StatusBubbleOverlay` VoiceOver reachability (reply
action, audio transport value, dismiss). Do not re-flag.**
