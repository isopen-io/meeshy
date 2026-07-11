# Call Control Buttons Harmonization — Design

> Task #17 (session todo): "UI: harmoniser les boutons de contrôle d'appel (adaptive glass) + bouton traduction cyclique". Explicitly deferred by the user earlier this session pending its own brainstorming. Written autonomously (user stepped away mid-session with a standing instruction to iterate through brainstorm → Opus review → plan → inline implementation without further check-ins) — the "clarifying questions" a live brainstorm would normally put to the user are answered below from direct code audit + prior explicit user feedback already on record in this file, instead of left open.

## Problem

`CallView.swift` accumulated three call-control button subsystems across separate chantiers (main transport row, live-captions floating stack, self-preview frame controls). Each solved its own problem correctly in isolation, but never got reconciled into one visual language:

1. **Three different "circular icon button" visual treatments coexist** for what a user perceives as the same kind of control:
   - `callControlGlass` (`.adaptiveGlass`, 56pt, tint-on-active) — mute, speaker, camera-picker, video, PiP, and (at 64pt) the pre-connect effects button. This is the real SDK Liquid-Glass wrapper, correctly grouped in `AdaptiveGlassContainer` via `controlBar`.
   - `endCallGlass` (`.adaptiveGlassProminent`, 56pt, red) — hang-up only. Deliberately distinct (every mainstream calling UI marks hang-up as the one visually different control) — **not a bug, kept as-is**.
   - `pipFrameButton` (flip-camera + effects-toggle, rendered on the self-preview tile once video is connected) — a hand-rolled `Color.black.opacity(0.45)` circle that never touches `adaptiveGlass` at all. This is the one genuine inconsistency: the same "toggle effects" action looks like a real Liquid Glass control before the call connects, and a flat dark dot once it does.
2. **The floating trailing-edge stack** (`transcriptionToggleButton` + `translationToggleButton`) is a bare `VStack`, not wrapped in `AdaptiveGlassContainer`. `AdaptiveGlass.swift`'s own doc comment says adjacent glass shapes must share a container ("glass can't sample glass") — `controlBar` follows that rule, this stack doesn't. On iOS 26, with both buttons visible, this can clip.
3. **Two buttons express what is really one tri-state idea.** `transcriptionToggleButton` (captions off/on) and `translationToggleButton` (original/translated, shown only once captions are on) are two separate taps to reach a state that's really: *off → captions (translated) → captions (original)*. The task explicitly asks for a **cyclic** button here instead.

## Approaches considered

**A — Merge everything into one big adaptive-glass tray** (captions/translation + effects folded into `controlButtonsRow`). Rejected: contradicts standing, already-encoded user feedback in the file itself (2026-07-10 comment: "the main horizontal row — mute/speaker/camera/video/PiP/end — must stay uncrowded") and the 2026-07-02 decision to move effects/flip onto the self-preview frame specifically to declutter that row. Re-litigating either would be undoing explicit prior product decisions without a new signal from the user to do so.

**B — Harmonize the *visual system*, not the *layout*: one shared adaptive-glass button primitive, reused everywhere (row, floating stack, PiP frame), plus collapse the 2-button caption/translation pair into 1 cyclic button.** Keeps every button exactly where the user already asked for it; fixes the actual "doesn't feel like one product" complaint, which is materially a styling+state-machine problem, not a placement problem. **Recommended.**

**C — Cyclic button only, leave the glass inconsistency alone.** Under-delivers on half the task title ("harmoniser... (adaptive glass)" is not incidental wording — it names the specific technique). Rejected as incomplete given the user set up a full brainstorm→review→plan pipeline for this, signaling they want the substantive version, not the smallest patch.

**Decision: B.**

## Design

### 1. Cyclic captions/translation button

Replace `transcriptionToggleButton` + `translationToggleButton` (2 buttons, 1 floating stack slot each) with a single button cycling through 3 states on tap:

```
.off → .translated → .original → .off → …
```

- `.off`: captions inactive. Icon `captions.bubble`. Tap starts transcription and lands on `.translated`.
- `.translated` (the sane default once captions turn on — never surprise the user by opening straight into "original"): icon `captions.bubble.fill`, indigo tint. Tap advances to `.original` (no service call — transcription keeps running, only the display flag flips).
- `.original`: icon `character.bubble.fill`, indigo tint. Tap advances to `.off`, which stops transcription and resets the local "show original" flag so the *next* activation starts clean at `.translated` again.

State is derived, not stored redundantly:

```swift
private enum CaptionsMode: Equatable {
    case off, translated, original

    var next: CaptionsMode {
        switch self {
        case .off: return .translated
        case .translated: return .original
        case .original: return .off
        }
    }
}
```

`CallView` computes `captionsMode` from the two flags that already exist (`transcriptionService.isTranscribing`, `showOriginalText`) rather than adding a third source of truth:

```swift
private var captionsMode: CaptionsMode {
    guard transcriptionService.isTranscribing else { return .off }
    return showOriginalText ? .original : .translated
}
```

The button's action applies `captionsMode.next` by driving the existing two flags — no new service API, no CallManager change:

```swift
private func advanceCaptionsMode() {
    switch captionsMode.next {
    case .translated:
        showOriginalText = false
        let willStart = !transcriptionService.isTranscribing
        showTranscript = willStart
        transcriptionService.isShowingOverlay = willStart
        callManager.toggleTranscription()
    case .original:
        showOriginalText = true
    case .off:
        showOriginalText = false
        showTranscript = false
        transcriptionService.isShowingOverlay = false
        callManager.toggleTranscription()
    }
}
```

`CaptionsMode.next` is a pure enum method — genuinely unit-testable with plain XCTest (not just a source-pattern guard), which is the stronger test this codebase's TDD standard asks for whenever the logic is extractable from the View body.

**Accessibility**: `accessibilityLabel` stays constant ("Sous-titres" — the feature name); `accessibilityValue` reflects the live state ("Désactivés" / "Traduction" / "Texte original"); add `.accessibilityAdjustable()` with increment/decrement actions both calling `advanceCaptionsMode()` (a 3-state cycle has no natural "decrement", so both directions simply advance — better for VoiceOver users than forcing 3 double-taps with no swipe shortcut). This is a net accessibility improvement over today's two-plain-toggles setup.

The floating trailing-edge stack shrinks from up-to-2 buttons to exactly 1, and gets wrapped in `AdaptiveGlassContainer` (fixing finding #2) even though it's a single button today — cheap correctness fix, and future-proofs the spot if another floating control ever joins it.

### 2. One shared adaptive-glass button primitive, used everywhere

`callControlGlass(diameter:isActive:tint:)` already exists and is correct; it's just not used by `pipFrameButton`. Give `pipFrameButton` the same treatment instead of its bespoke `Color.black.opacity(0.45)` circle:

```swift
private func pipFrameButton(icon: String, label: String, hint: String? = nil, action: @escaping () -> Void) -> some View {
    Button {
        action()
        HapticFeedback.light()
    } label: {
        Image(systemName: icon)
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.white.opacity(0.95))
            .callControlGlass(diameter: 32, isActive: false, tint: .white)
            .frame(width: 44, height: 44)   // HIG hit-target floor, unchanged
            .contentShape(Rectangle())
    }
    .accessibilityLabel(label)
    .optionalAccessibilityHint(hint)
}
```

`callControlGlass` already delegates to the SDK's `adaptiveGlass`, which is precedented over live video content in this same file (`transcriptOverlay` already floats glass over the video stream), so legibility over an arbitrary self-preview frame is not a new risk. The two `pipFrameButton` call sites (flip camera, effects toggle) get this for free — no call-site changes beyond the shared function body.

No new diameter constant needed beyond the literal `32` (matches the existing precedent of inlining diameters at call sites — `56`, `64` are already both inlined, not centralized).

### 3. `effectsToggleButton` stays two call sites, now provably consistent

`effectsToggleButton` (pre-connect, 64pt `callControlGlass`) and the connected-video `pipFrameButton` "filters" entry point remain two different call sites (this mirrors reality: before the call connects there is no self-preview frame to pin a button to, so a row button is the only option). What changes is that *both* now route through the shared `adaptiveGlass` family — the user no longer sees a "real" Liquid Glass control before connecting and a flat dot after. No further consolidation attempted (would require inventing a frame overlay during ringing, which doesn't exist and isn't part of this task).

## Non-goals

- No change to `controlButtonsRow` membership, order, or position.
- No change to where effects/flip-camera live (self-preview frame once connected, row before).
- No change to `CallManager` or the gateway/translation pipeline — this is styling + a local state-machine collapse, nothing crosses the socket.
- No new xcstrings keys beyond replacing 2 existing caption strings (`call.control.transcript.*`, `call.control.translation.*`) with 3 state-labeled ones for the merged button — old keys retired, not kept as dead aliases (5 locales: de/en/es/fr/pt-BR).

## Testing

- New `CaptionsModeTests` (plain XCTest, no source-pattern guard needed): `next` cycles `.off → .translated → .original → .off`; `captionsMode` computed property matches `(isTranscribing, showOriginalText)` combinations.
- Source-pattern guards (same style as `CallViewAccessibilityTests`/`CallSignalIndicatorTests`) for: the merged button replaces both old properties; `pipFrameButton` uses `.callControlGlass`, not `Color.black.opacity`; the floating stack is wrapped in `AdaptiveGlassContainer`.
- Full `meeshy.sh test` targeted subset + `build-for-testing` on the existing iOS 18.2 verification simulator (same pattern as the multi-speaker-captions and pill-fix chantiers earlier this session).
- Manual device verification (queued, not blocking commit): confirm the cyclic button reads correctly with VoiceOver's increment/decrement gesture, and that the PiP frame buttons still hit-test correctly at the smaller glass diameter over real video.
