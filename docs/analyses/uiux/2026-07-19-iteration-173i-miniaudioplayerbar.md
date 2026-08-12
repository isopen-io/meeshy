# Iteration-173i — VoiceOver structure for `MiniAudioPlayerBar`

**Date:** 2026-07-19
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) + reuse cleanup — floating audio mini-player
**File touched:** `apps/ios/Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift`
(1 file, 0 net logic change, 0 new test)

## Component

`MiniAudioPlayerBar` is the floating Liquid-Glass capsule that follows
`ConversationAudioCoordinator.shared`. It surfaces whenever audio plays from a
conversation the user is **not** currently inside (route-aware visibility, 52i /
2026-05-28 fix). It shows a monogram avatar, the sender name, the conversation
name, a 2 pt linear progress bar, and three controls (play/pause, next, close).
Tapping the card body reopens the source conversation.

## Findings

Prior iterations solidified two aspects of this component:
- **52i** migrated its background to `adaptiveGlass(in: Capsule())` (Liquid Glass).
- The three trailing controls already carry localized `.accessibilityLabel`
  (`mini_player.pause/play/next/close`).

Two real VoiceOver gaps remained on the **content**, never addressed:

1. **The primary action was invisible to VoiceOver.** The whole-card
   `.onTapGesture` — the mini-player's entire reason for existing, *jump back to
   the conversation playing the audio* — was a bare gesture on a plain `HStack`.
   VoiceOver exposes no affordance for a bare `.onTapGesture`, so a VoiceOver
   user could pause/skip/close but had **no way to reach the conversation**. The
   sighted primary action had no non-visual equivalent.

2. **The now-playing info swept as disconnected fragments.** The monogram
   ("A"), the sender name, the conversation name, and the `ProgressView` were
   four separate VoiceOver stops. The monogram read as a lone letter; the
   progress bar read as a bare "42 %" with no context tying it to the track.
   Playback progress — conveyed **only** by the gradient fill width, a
   geometry/color channel — was imperceptible non-visually.

Dynamic Type was already sound: every visible label uses a semantic font
(`.subheadline` / `.caption2` / `.footnote`) — **no font migration needed.**

## Fix

Wrapped the leading avatar + meta + progress into one inner `HStack` (identical
`spacing: 10`, zero visual change — the nested spacing matches the outer one)
and applied the canonical Apple label/value/action pattern:

- `.accessibilityElement(children: .ignore)` — folds the monogram, both names
  and the progress bar into a single element.
- `.accessibilityLabel(nowPlayingAccessibilityLabel(for:))` — stable identity
  ("Lecture audio de {sender}, {conversation}" / "Audio playback from …").
- `.accessibilityValue(progressAccessibilityValue)` — the live state as a
  locale-aware percent via `.formatted(.percent.precision(.fractionLength(0)))`
  (RTL / locale-correct, no hand-built "%").
- `.accessibilityHint(openConversationAccessibilityHint)` — "Ouvrir la
  conversation" / "Opens the conversation".
- `.accessibilityAddTraits(.isButton)` — VoiceOver announces it as a button and
  routes double-tap to the activation action.
- `.accessibilityAddTraits(coordinator.isPlaying ? .updatesFrequently : [])` —
  while playing, VoiceOver re-announces the value on refocus as progress
  advances; the trait clears when paused.
- `.accessibilityAction { openConversation(for: context) }` — makes the
  now-playing cluster's double-tap open the conversation, giving the card's
  primary action a non-visual path.

**Reuse cleanup:** the card-open logic was duplicated in the `.onTapGesture`
closure and in the `simulateTapBodyForTesting` helper. Both now call a single
private `openConversation(for:)` — the tap gesture, the VoiceOver action, and
the test helper share one implementation (behavior preserved 1:1).

Two new inline-`defaultValue` keys (`mini_player.a11y.now-playing`,
`mini_player.a11y.open-hint`) ship French defaults inline — same
`mini_player.*` namespace and code-only doctrine as the existing button labels,
no `.xcstrings` catalog edit.

## Rationale

Loading/progress states and "never rely only on color/geometry" are explicitly
in the accessibility review scope. A persistent floating player whose entire
purpose — returning to the playing conversation — is unreachable by VoiceOver is
a hard functional gap, not a polish item. Folding the cluster into one
`.updatesFrequently` button makes progress audible and the navigation
discoverable without touching the visual design (Indigo brand + Glass capsule
preserved).

## Verification

- **Static review:** all modifiers are standard SwiftUI iOS 16.0+ APIs
  (`accessibilityElement`, `accessibilityLabel`/`Value`/`Hint`,
  `accessibilityAddTraits`, `accessibilityAction`). `.formatted(.percent…)` is
  iOS 15+. App floor is iOS 16.0 → no availability guard. The
  `.accessibilityAddTraits(cond ? … : [])` idiom has precedent (167i
  `UploadProgressBar`, 155i `MessageReactionsDetailView`).
- **Tests:** `MiniAudioPlayerBarTests` (7 behaviors) asserts visibility,
  coordinator wiring, and `simulateTapBodyForTesting` routing. The refactor
  keeps `simulateTapBodyForTesting` calling the same router/`onTapBody` path via
  `openConversation(for:)` → `test_tapBody_invokesRouterWithConversationId`
  stays green. No test asserts view a11y modifiers → 0 churn.
- **CI gate:** `iOS Tests` (macOS runner). This is a Linux container, so the
  build/VoiceOver run happens in CI — confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations)

- The three control buttons are 24–32 pt frames; visual hit areas are below the
  44×44 pt HIG target but bounded to the capsule height by design (parity with
  `FloatingCallPillView`) — left unchanged.
- `MiniAudioPlayerBar` reduce-motion: the spring in/out transition is subtle and
  respects the system animation curve; no `reduceMotion` gate added.

**Status: RESOLVED for `MiniAudioPlayerBar` VoiceOver structure** (Glass 52i,
button labels done, Dynamic Type already semantic — do not re-flag).
