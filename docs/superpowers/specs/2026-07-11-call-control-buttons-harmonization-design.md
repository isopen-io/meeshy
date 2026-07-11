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

State is derived, not stored redundantly. `CallView` derives `captionsMode` from the two flags that already exist (`transcriptionService.isTranscribing`, `showOriginalText`) rather than adding a third source of truth. The derivation is a **pure init on the enum itself** (not a computed property buried in the View), so it's testable with plain XCTest independent of any SwiftUI host:

```swift
private enum CaptionsMode: Equatable {
    case off, translated, original

    init(isTranscribing: Bool, showOriginalText: Bool) {
        guard isTranscribing else { self = .off; return }
        self = showOriginalText ? .original : .translated
    }

    var next: CaptionsMode {
        switch self {
        case .off: return .translated
        case .translated: return .original
        case .original: return .off
        }
    }
}
```

`CallView` just calls it:

```swift
private var captionsMode: CaptionsMode {
    CaptionsMode(isTranscribing: transcriptionService.isTranscribing, showOriginalText: showOriginalText)
}
```

The button's action applies `captionsMode.next` by driving the existing two flags — no new service API, no CallManager change. **Known pre-existing edge case, not introduced by this change**: if `toggleTranscription()`'s async start path fails (permission denied, recognizer unavailable), `showTranscript`/`isShowingOverlay` are set optimistically before that failure surfaces, so the transcript surface can briefly show empty — the current `transcriptionToggleButton` has the exact same behavior today. `captionsMode` itself stays correct either way (falls back to `.off` once `isTranscribing` settles false), so the cycle never gets stuck; only the transcript-panel-visibility edge case is pre-existing and out of scope here.

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

Both `CaptionsMode.next` and the `init(isTranscribing:showOriginalText:)` derivation are pure enum members — genuinely unit-testable with plain XCTest (not just a source-pattern guard), which is the stronger test this codebase's TDD standard asks for whenever logic is extractable from the View body.

The button view itself — this is where the accessibility semantics actually live, so it's specified in full rather than left to the implementer to improvise:

```swift
private var captionsCycleButton: some View {
    let mode = captionsMode
    let (icon, tint): (String, Color) = {
        switch mode {
        case .off: return ("captions.bubble", .white)
        case .translated: return ("captions.bubble.fill", MeeshyColors.indigo400)
        case .original: return ("character.bubble.fill", MeeshyColors.indigo400)
        }
    }()
    let valueLabel: String = {
        switch mode {
        case .off: return String(localized: "call.control.captions.state.off", defaultValue: "Désactivés", bundle: .main)
        case .translated: return String(localized: "call.control.captions.state.translated", defaultValue: "Traduction", bundle: .main)
        case .original: return String(localized: "call.control.captions.state.original", defaultValue: "Texte original", bundle: .main)
        }
    }()

    return Button(action: advanceCaptionsMode) {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 22, weight: .medium))
                .foregroundColor(mode == .off ? .white.opacity(0.9) : tint)
                .callControlGlass(diameter: 56, isActive: mode != .off, tint: tint)
            Text(String(localized: "call.control.transcript.caption", defaultValue: "Sous-titres", bundle: .main))
                .font(.caption2.weight(.medium))
                .foregroundColor(.white.opacity(0.7))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(width: 68)
    }
    .pressable()
    // Constant label (the feature's name) + a live value (its current state) —
    // NOT `.callToggleAccessibility(isToggle: true, ...)`: that helper's
    // `.isToggle` trait + on/off value is for binary toggles. This is a
    // 3-state cycle, so VoiceOver hears "Sous-titres, Traduction" today and
    // "Sous-titres, Texte original" after the next double-tap — the default
    // `Button` action already IS the cycle-forward gesture, so no
    // `.accessibilityAdjustableAction` is added: a 3-state cycle has no
    // natural "backward", and mapping both increment AND decrement to the
    // same forward step would teach a VoiceOver user that swiping down also
    // advances — worse than just not offering the swipe gesture at all.
    .accessibilityLabel(String(localized: "call.control.transcript.caption", defaultValue: "Sous-titres", bundle: .main))
    .accessibilityValue(valueLabel)
}
```

`AdaptiveGlassContainer` wraps this single button at the exact spot the current `VStack(spacing: 12)` occupies (call site inside `connectedView`, trailing-edge floating stack) — fixing finding #2 even though the stack now holds one button instead of up to two, and future-proofing the spot if another floating control ever joins it:

```swift
AdaptiveGlassContainer(spacing: 12) {
    VStack(spacing: 12) {
        captionsCycleButton
    }
}
```

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
            .callControlGlass(diameter: 28, isActive: false, tint: .white)
            .frame(width: 44, height: 44)   // HIG hit-target floor, unchanged
            .contentShape(Rectangle())
    }
    .accessibilityLabel(label)
    .optionalAccessibilityHint(hint)
}
```

`callControlGlass` already delegates to the SDK's `adaptiveGlass`, which is precedented over live video content in this same file (`transcriptOverlay` already floats glass over the video stream), so legibility over an arbitrary self-preview frame is not a new risk. The two `pipFrameButton` call sites (flip camera, effects toggle) get this for free — no call-site changes beyond the shared function body.

Diameter stays `28` (unchanged from today) — the fix changes the visual *treatment* (real adaptive glass vs. a flat dot), not the *size*; `28` is still what the existing comment at this call site dictates ("the 100×140 tile has no room for a 44pt circle"). No new diameter constant needed (matches the existing precedent of inlining diameters at call sites — `56`/`64`/`28` are all already inlined, not centralized). Modifier order is precedented and safe: the chevron minimize button already does `callControlGlass(diameter: 40, ...)` followed by an outer `.frame(44, 44)` tap-box, and it ships correctly today — the glass circle renders at its own diameter, centered inside the larger hit-frame.

### 3. `effectsToggleButton` stays two call sites, both now in the `adaptiveGlass` family

`effectsToggleButton` (pre-connect, 64pt `callControlGlass`) and the connected-video `pipFrameButton` "filters" entry point remain two different call sites (this mirrors reality: before the call connects there is no self-preview frame to pin a button to, so a row button is the only option). What changes is that *both* now route through the shared `adaptiveGlass` family instead of one being a real Liquid Glass control and the other a flat dot. This is **not** full visual parity — they still differ in diameter (64 vs 28, each dictated by their own layout constraint) and in whether they reflect `hasActiveEffects` as an active tint (the row button does; the frame button stays a neutral `isActive: false`, matching its current behavior) — only the *material family* is unified. No further consolidation attempted (would require inventing a frame overlay during ringing, which doesn't exist and isn't part of this task).

## Non-goals

- No change to `controlButtonsRow` membership, order, or position.
- No change to where effects/flip-camera live (self-preview frame once connected, row before).
- No change to `CallManager` or the gateway/translation pipeline — this is styling + a local state-machine collapse, nothing crosses the socket.
- xcstrings inventory (5 locales: de/en/es/fr/pt-BR) — **5 keys retired** (confirmed via grep: no other call site references them): `call.control.transcript.off`, `call.control.transcript.on`, `call.control.translation.caption`, `call.control.translation.showTranslated`, `call.control.translation.showOriginal`. **1 key reused as-is**: `call.control.transcript.caption` ("Sous-titres") — doubles as both the button's visible caption text and its `accessibilityLabel`. **3 keys added**: `call.control.captions.state.off` ("Désactivés"), `call.control.captions.state.translated` ("Traduction"), `call.control.captions.state.original` ("Texte original") — used as `accessibilityValue`. Net: −5 +3 = 2 fewer keys, matching the 2-buttons-into-1 collapse.

## Testing

- New `CaptionsModeTests` (plain XCTest, no source-pattern guard needed — both members are pure): `next` cycles `.off → .translated → .original → .off`; `init(isTranscribing:showOriginalText:)` matches all 4 `(Bool, Bool)` combinations (`showOriginalText: true` while `isTranscribing: false` must still resolve to `.off`, not `.original` — the guard takes priority).
- Source-pattern guards (same style as `CallViewAccessibilityTests`/`CallSignalIndicatorTests`) for: `captionsCycleButton` exists and its action is `advanceCaptionsMode`; it does **not** use `.callToggleAccessibility(isToggle: true, ...)`; `pipFrameButton` uses `.callControlGlass`, not `Color.black.opacity`; the floating stack wraps `captionsCycleButton` in `AdaptiveGlassContainer`.
- **Existing tests to rewrite, not just add to** — these currently hard-assert the two properties this design removes, and will fail the build otherwise: `CallSignalIndicatorTests.test_transcriptionToggleButton_wiresToCallManager`, `test_translationToggleButton_togglesShowOriginalText`, `test_connectedView_showsTranslationButton_nextToTranscriptionToggle` (all in `apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift`) → replace with equivalent guards on `captionsCycleButton`/`advanceCaptionsMode`. `CallViewAccessibilityTests`'s `pipFrameButton` hit-target test survives unchanged (still asserts `.frame(44, 44)` + `.contentShape(Rectangle())`, both untouched) but its "28pt" comment must stay accurate since the diameter is NOT changing (§2/R3).
- Full `meeshy.sh test` targeted subset + `build-for-testing` on the existing iOS 18.2 verification simulator (same pattern as the multi-speaker-captions and pill-fix chantiers earlier this session).
- Manual device verification (queued, not blocking commit): confirm the cyclic button's `accessibilityValue` reads correctly with VoiceOver across all 3 states via plain double-tap (no swipe gesture to test — none is added, see §1); confirm the PiP frame buttons still hit-test correctly; **check glyph contrast** of the smaller glass circle over a bright, close-up front-camera self-view (known past failure mode in this app: white-on-glass legibility over bright call surfaces) — not just the hit-test.
