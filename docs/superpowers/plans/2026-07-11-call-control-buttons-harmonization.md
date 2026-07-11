# Call Control Buttons Harmonization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution — no subagent dispatch for this plan). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the two-button captions/translation floating stack into one 3-state cyclic
button, and unify every circular call-control button (`controlButtonsRow`, the floating
stack, the self-preview frame) on the same `adaptiveGlass` visual family.

**Architecture:** Pure UI/presentation refactor — no `CallManager`, gateway, or socket change.
A new `CaptionsMode` enum (pure, testable in isolation) replaces the `showOriginalText` +
`transcriptionService.isTranscribing` pair with a single derived 3-state value; `CallView`
gets one `captionsCycleButton` instead of `transcriptionToggleButton` +
`translationToggleButton`; `pipFrameButton` switches its hand-rolled dark circle for the
existing `callControlGlass` wrapper. Spec:
`docs/superpowers/specs/2026-07-11-call-control-buttons-harmonization-design.md` (brainstormed
autonomously this session, reviewed and corrected via an independent Opus pass — see that
file's history for the R1–R4 corrections already folded in).

**Tech Stack:** Swift 6, SwiftUI, XCTest — same stack as every prior calls chantier this
session.

## Global Constraints

- Do **not** touch `controlButtonsRow` — membership, order, and position stay exactly as they
  are (spec Non-goals; standing 2026-07-10 user feedback baked into the file's own comments).
- Do **not** touch `CallManager`, the gateway, or the translation pipeline — nothing here
  crosses the socket.
- Do **not** move where effects/flip-camera live (self-preview frame once connected, row
  before) — only their glass *treatment* changes (Task 4).
- `pipFrameButton`'s glyph diameter stays `28` — the fix is the visual *treatment*
  (`Color.black.opacity(0.45)` → `.callControlGlass`), not the size. Do not creep this to `32`
  or any other value (spec §2, corrected from an earlier draft).
- The cyclic button uses a plain `Button` with `accessibilityValue`, never
  `.callToggleAccessibility(isToggle: true, ...)` (that helper's `.isToggle` trait is for
  binary toggles) and never `.accessibilityAdjustableAction` (a 3-state cycle has no natural
  "backward" — see spec §1 for the full reasoning).
- TDD strict (RED-GREEN-REFACTOR), per root `CLAUDE.md` and `apps/ios/CLAUDE.md`. Commit after
  every task — no single giant commit at the end.
- Verify on the existing iOS 18.2 verification simulator
  (`/private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt`
  if still present and valid; otherwise create a fresh one exactly as Task 5 shows).

---

### Task 1: `CaptionsMode` — pure, directly-testable state machine

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Models/CaptionsMode.swift`
- Test: `apps/ios/MeeshyTests/Unit/Models/CaptionsModeTests.swift` (new file)

**Interfaces:**
- Produces: `enum CaptionsMode: Equatable, Sendable { case off, translated, original }`,
  `init(isTranscribing: Bool, showOriginalText: Bool)`, `var next: CaptionsMode`. Task 2 uses
  both the initializer (to derive `CallView.captionsMode`) and `next` (inside
  `advanceCaptionsMode()`).

This is the state machine behind the cyclic button, extracted as a standalone type so it's
testable with plain XCTest — no SwiftUI host, no source-pattern guard needed.

- [ ] **Step 1: Write the failing test**

Create `apps/ios/MeeshyTests/Unit/Models/CaptionsModeTests.swift`:

```swift
import XCTest
@testable import Meeshy

final class CaptionsModeTests: XCTestCase {

    // MARK: - next (the cycle)

    func test_next_off_returnsTranslated() {
        XCTAssertEqual(CaptionsMode.off.next, .translated)
    }

    func test_next_translated_returnsOriginal() {
        XCTAssertEqual(CaptionsMode.translated.next, .original)
    }

    func test_next_original_returnsOff() {
        XCTAssertEqual(CaptionsMode.original.next, .off)
    }

    func test_next_fullCycle_returnsToStart() {
        var mode = CaptionsMode.off
        mode = mode.next
        mode = mode.next
        mode = mode.next
        XCTAssertEqual(mode, .off)
    }

    // MARK: - init(isTranscribing:showOriginalText:)

    func test_init_notTranscribing_ignoresShowOriginalText_returnsOff() {
        XCTAssertEqual(CaptionsMode(isTranscribing: false, showOriginalText: false), .off)
    }

    func test_init_notTranscribing_evenWithShowOriginalTextTrue_returnsOff() {
        // The isTranscribing guard takes priority — a stale showOriginalText=true left
        // over from a previous session must never surface .original while captions are off.
        XCTAssertEqual(CaptionsMode(isTranscribing: false, showOriginalText: true), .off)
    }

    func test_init_transcribing_showOriginalTextFalse_returnsTranslated() {
        XCTAssertEqual(CaptionsMode(isTranscribing: true, showOriginalText: false), .translated)
    }

    func test_init_transcribing_showOriginalTextTrue_returnsOriginal() {
        XCTAssertEqual(CaptionsMode(isTranscribing: true, showOriginalText: true), .original)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

`CaptionsModeTests.swift` is a brand-new file. `xcodebuild` compiles whatever
`project.pbxproj` currently lists — it does **not** auto-discover new files (only `xcodegen
generate` does, by re-globbing `project.yml`'s `sources:` path; see `apps/ios/CLAUDE.md`).
Regenerate first, every time this plan adds a new `.swift` file (Task 1 only — later tasks
only modify existing files):

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate && cd -
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: **BUILD FAILED** — `cannot find type 'CaptionsMode' in scope` (the test file
references a type that doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `apps/ios/Meeshy/Features/Main/Models/CaptionsMode.swift`:

```swift
import Foundation

/// The live-captions button's 3-state cycle: off → translated → original → off.
/// Derived from two flags that already exist on `CallView` (`transcriptionService
/// .isTranscribing`, the service's authoritative on/off state, and `showOriginalText`,
/// a local display-only flag) rather than adding a third source of truth — see
/// `docs/superpowers/specs/2026-07-11-call-control-buttons-harmonization-design.md` §1.
enum CaptionsMode: Equatable, Sendable {
    case off
    case translated
    case original

    /// `isTranscribing` takes priority: a stale `showOriginalText` left over from a
    /// previous activation must never surface `.original` while captions are off.
    init(isTranscribing: Bool, showOriginalText: Bool) {
        guard isTranscribing else {
            self = .off
            return
        }
        self = showOriginalText ? .original : .translated
    }

    /// The state one tap advances to. `.translated` is always the entry point when
    /// turning captions on — a user reactivating captions should never land straight
    /// on "original" without having asked for it this session.
    var next: CaptionsMode {
        switch self {
        case .off: return .translated
        case .translated: return .original
        case .original: return .off
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt 2>/dev/null)
if [ -z "$SIM" ] || ! xcrun simctl list devices | grep -q "$SIM"; then
  SIM=$(xcrun simctl create tmp182captions "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
  echo "$SIM" > /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt
fi
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CaptionsModeTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: `Test Suite 'CaptionsModeTests' passed` — 8/8 tests green.

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Models/CaptionsMode.swift \
        apps/ios/MeeshyTests/Unit/Models/CaptionsModeTests.swift
git commit -m "feat(ios/calls): add CaptionsMode — pure 3-state captions/translation cycle"
```

---

### Task 2: `captionsCycleButton` replaces `transcriptionToggleButton` + `translationToggleButton`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/CallView.swift:39` (new `@State`? — none
  needed, `showOriginalText` already exists at this line), `:737-753` (floating stack call
  site inside `connectedView`), `:1872-1918` (`transcriptionToggleButton` +
  `translationToggleButton` — both deleted, replaced by `captionsCycleButton` +
  `advanceCaptionsMode()`)
- Modify: `apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift:223-239`
  (`test_transcriptionToggleButton_wiresToCallManager`), `:276-304`
  (`test_translationToggleButton_togglesShowOriginalText`,
  `test_connectedView_showsTranslationButton_nextToTranscriptionToggle`)

**Interfaces:**
- Consumes: `CaptionsMode` (Task 1) — `init(isTranscribing:showOriginalText:)` and `.next`.
- Produces: `CallView.captionsMode: CaptionsMode` (private computed var),
  `CallView.advanceCaptionsMode()` (private func, the button's action),
  `CallView.captionsCycleButton: some View` (private computed var) — no other task depends on
  these beyond this task's own call site.

- [ ] **Step 1: Write the failing tests (replace the 3 tests these deletions break)**

Open `apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift`. Replace
`test_transcriptionToggleButton_wiresToCallManager` (lines 223-239) with:

```swift
    func test_captionsCycleButton_actionIsAdvanceCaptionsMode() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "private var captionsCycleButton: some View {") else {
            XCTFail("CallView must define captionsCycleButton")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 2200, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("Button(action: advanceCaptionsMode)"),
            "captionsCycleButton must drive its 3-state cycle via advanceCaptionsMode() — " +
            "replaces the old transcriptionToggleButton/translationToggleButton pair."
        )
        XCTAssertFalse(
            body.contains(".callToggleAccessibility(isToggle: true"),
            "captionsCycleButton is a 3-state cycle, not a binary toggle — it must not use " +
            "the .isToggle accessibility trait (that implies exactly 2 states)."
        )
    }
```

Replace `test_translationToggleButton_togglesShowOriginalText` (now at approximately lines
276-288 before this edit — search for the exact text since Step 1's edit shifted offsets)
with:

```swift
    func test_advanceCaptionsMode_off_startsTranscriptionAndLandsOnTranslated() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "private func advanceCaptionsMode() {") else {
            XCTFail("CallView must define advanceCaptionsMode()")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 700, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("case .translated:") && body.contains("callManager.toggleTranscription()"),
            "advanceCaptionsMode's .translated branch must call callManager.toggleTranscription() " +
            "— this is the entry point that actually starts transcription."
        )
        XCTAssertTrue(
            body.contains("case .original:") && body.contains("showOriginalText = true"),
            "advanceCaptionsMode's .original branch must flip showOriginalText without " +
            "calling toggleTranscription() again — transcription keeps running, only the " +
            "display flag changes."
        )
    }
```

Replace `test_connectedView_showsTranslationButton_nextToTranscriptionToggle` with:

```swift
    func test_connectedView_floatingStack_wrapsCaptionsCycleButtonInAdaptiveGlassContainer() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "captionsCycleButton") else {
            XCTFail("CallView must reference captionsCycleButton")
            return
        }
        // Search backward up to 200 chars from the reference for AdaptiveGlassContainer,
        // confirming the floating stack shares a glass container (glass can't sample glass).
        let searchStart = view.index(range.lowerBound, offsetBy: -200, limitedBy: view.startIndex) ?? view.startIndex
        let body = String(view[searchStart ..< range.lowerBound])
        XCTAssertTrue(
            body.contains("AdaptiveGlassContainer"),
            "The floating trailing-edge stack must wrap captionsCycleButton in " +
            "AdaptiveGlassContainer, matching controlBar's own pattern."
        )
    }
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: **BUILD FAILED** — the test file now references `captionsCycleButton` and
`advanceCaptionsMode()`, which don't exist in `CallView.swift` yet.

- [ ] **Step 3: Delete the old properties, add `captionsMode` + `advanceCaptionsMode()` + `captionsCycleButton`**

In `apps/ios/Meeshy/Features/Main/Views/CallView.swift`, delete `transcriptionToggleButton`
and `translationToggleButton` in full (the two `private var` blocks currently at lines
1872-1898 and 1904-1918 — from `/// Live captions — toggle local transcription...` through
the closing `}` of `translationToggleButton`). Replace that entire span with:

```swift
    /// Derived from `transcriptionService.isTranscribing` (authoritative on/off) and
    /// `showOriginalText` (local display flag) — see CaptionsMode's own doc comment.
    private var captionsMode: CaptionsMode {
        CaptionsMode(isTranscribing: transcriptionService.isTranscribing, showOriginalText: showOriginalText)
    }

    /// Advances the 3-state cycle. `.translated`'s start path mirrors the old
    /// transcriptionToggleButton exactly (read isTranscribing BEFORE calling
    /// toggleTranscription(), since the start path is async — permission request
    /// awaited inside a Task — so isTranscribing is still false right after the call
    /// returns; reading it before, at tap time, is always accurate).
    private func advanceCaptionsMode() {
        switch captionsMode.next {
        case .translated:
            showOriginalText = false
            let willStart = !transcriptionService.isTranscribing
            showTranscript = willStart
            // PERF-005: single authoritative place that flips this — the audio
            // structural transcript panel and the video floating banner both key
            // off it, so it must not depend on either view's own lifecycle
            // (onAppear/onChange copies would drift).
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

    /// Live captions — cycles off → captions (translated) → captions (original) → off
    /// on tap. Replaces the old transcriptionToggleButton + translationToggleButton pair
    /// (2 buttons collapsed into 1 — task #17). Manual, per spec decision (never
    /// auto-activates): the speaker controls when their voice is transcribed and sent
    /// to the gateway. Floats on the trailing edge, not in controlButtonsRow — see the
    /// call site's comment.
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
        // Constant label (the feature's name) + a live value (its current state) — NOT
        // .callToggleAccessibility(isToggle: true, ...): that helper's .isToggle trait +
        // on/off value is for binary toggles. This is a 3-state cycle, so VoiceOver hears
        // "Sous-titres, Traduction" today and "Sous-titres, Texte original" after the next
        // double-tap — the default Button action already IS the cycle-forward gesture, so
        // no .accessibilityAdjustableAction is added: a 3-state cycle has no natural
        // "backward", and mapping both increment AND decrement to the same forward step
        // would teach a VoiceOver user that swiping down also advances — worse than not
        // offering the swipe gesture at all.
        .accessibilityLabel(String(localized: "call.control.transcript.caption", defaultValue: "Sous-titres", bundle: .main))
        .accessibilityValue(valueLabel)
    }
```

Then update the floating stack's call site (currently, inside `connectedView`, the comment
block starting `// Live captions toggle — floating vertical control on the trailing` followed
by a bare `VStack { Spacer(); HStack { Spacer(); VStack(spacing: 12) { if
transcriptionService.isTranscribing { translationToggleButton }; transcriptionToggleButton }
} }`). Replace just the inner `VStack(spacing: 12) { ... }` with:

```swift
                    AdaptiveGlassContainer(spacing: 12) {
                        VStack(spacing: 12) {
                            captionsCycleButton
                        }
                    }
```

(Leave the outer `VStack { Spacer(); HStack { Spacer(); ... } }` positioning wrapper, the
`.padding(.trailing, 16).padding(.bottom, 150)`, and the `showControls`-driven
opacity/animation modifiers below it completely untouched — only the innermost content
changes.)

- [ ] **Step 4: Run to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CaptionsModeTests \
  -only-testing:MeeshyTests/CallHangupFastPathTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Note: `CallSignalIndicatorTests.swift` hosts several `XCTestCase` classes in one file
(`CallSignalStrengthTests`, `DataChannelInboundTests`, `CallHangupFastPathTests`,
`CallSignalGlyphReduceMotionTests`). The 3 tests this step replaced (previously named
`test_transcriptionToggleButton_wiresToCallManager`,
`test_translationToggleButton_togglesShowOriginalText`,
`test_connectedView_showsTranslationButton_nextToTranscriptionToggle`, at lines 223-304 before
this task's edit) live inside `CallHangupFastPathTests` (the class spanning lines 160-385,
despite its name predating this file's later accretion of unrelated call-UI tests — a
pre-existing naming quirk, out of scope to rename here). Target that class by name, not the
file name.

Expected: `CallHangupFastPathTests` PASSES, including the 3 new/rewritten tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/CallView.swift \
        apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift
git commit -m "feat(ios/calls): collapse captions+translation toggles into one cyclic button"
```

---

### Task 3: xcstrings — retire 5 keys, add 3

**Files:**
- Modify: `apps/ios/Meeshy/Localizable.xcstrings:12181-12355` (the `call.control.transcript.off`
  through `call.control.translation.showTranslated` block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: catalog entries for `call.control.captions.state.off`,
  `call.control.captions.state.translated`, `call.control.captions.state.original` — Task 2's
  `captionsCycleButton` already references these keys (written in Task 2, so by this point in
  execution order the code already expects them; this task makes `LocalizationConsistencyTests`
  green).

- [ ] **Step 1: Write the failing test expectation (no new test file — reuses the existing suite)**

This task doesn't add a new test; it makes the pre-existing `LocalizationConsistencyTests`
(added in a prior chantier) pass. Confirm it currently fails because of the orphaned keys Task
2 left behind:

```bash
cd /Users/smpceo/Documents/v2_meeshy
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

- [ ] **Step 2: Confirm the failure mode**

Expected: **FAIL** on `test_everyAppCatalogIdentifierKeyIsReferencedInCode` — orphaned keys
`call.control.transcript.off`, `call.control.transcript.on`, `call.control.translation.caption`,
`call.control.translation.showOriginal`, `call.control.translation.showTranslated` (Task 2
deleted their only call sites) — and likely also on
`test_everyUsedIdentifierKeyResolvesInDevelopmentLanguage` if the new
`call.control.captions.state.*` keys are checked (they aren't, since Task 2's call sites pass
`defaultValue:` — but the orphan check alone is enough to fail the suite).

- [ ] **Step 3: Edit `Localizable.xcstrings`**

Open `apps/ios/Meeshy/Localizable.xcstrings`. Delete the 5 blocks for
`"call.control.transcript.off"`, `"call.control.transcript.on"`,
`"call.control.translation.caption"`, `"call.control.translation.showOriginal"`,
`"call.control.translation.showTranslated"` in full (each is a
`"key" : { "extractionState" : "manual", "localizations" : { ... } },` block — currently
spanning lines 12181-12355; **keep** `"call.control.transcript.caption"` at 12146-12180
untouched, it's still referenced by `captionsCycleButton`).

Then insert the 3 new keys, alphabetically, right after `"call.control.camera.caption"`'s
closing `},` and before `"call.control.flipCamera"` (find `"call.control.flipCamera"` — the 3
new keys sort between `camera*` and `flipCamera`):

```json
    "call.control.captions.state.off" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Deaktiviert"
          }
        },
        "en" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Off"
          }
        },
        "es" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Desactivados"
          }
        },
        "fr" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Désactivés"
          }
        },
        "pt-BR" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Desativadas"
          }
        }
      }
    },
    "call.control.captions.state.original" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Originaltext"
          }
        },
        "en" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Original text"
          }
        },
        "es" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Texto original"
          }
        },
        "fr" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Texte original"
          }
        },
        "pt-BR" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Texto original"
          }
        }
      }
    },
    "call.control.captions.state.translated" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Übersetzung"
          }
        },
        "en" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Translation"
          }
        },
        "es" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Traducción"
          }
        },
        "fr" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Traduction"
          }
        },
        "pt-BR" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Tradução"
          }
        }
      }
    },
```

Validate the JSON is still well-formed:

```bash
python3 -c "import json; json.load(open('apps/ios/Meeshy/Localizable.xcstrings'))" && echo OK
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Localizable.xcstrings
git commit -m "feat(ios/calls): xcstrings for the cyclic captions button — retire 5 dead keys, add 3"
```

---

### Task 4: `pipFrameButton` — adopt `callControlGlass`, drop the hand-rolled dark circle

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/CallView.swift:1331-1350` (`pipFrameButton`)
- Test: `apps/ios/MeeshyTests/Unit/Views/CallViewAccessibilityTests.swift` (new test alongside
  the existing `test_pipFrameButton_hitTargetMeetsHIGMinimum` at line 287)

**Interfaces:**
- Consumes: `callControlGlass(diameter:isActive:tint:)` — already exists
  (`CallView.swift:2039`), unchanged by this task.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Open `apps/ios/MeeshyTests/Unit/Views/CallViewAccessibilityTests.swift`. Add this test right
after `test_pipFrameButton_hitTargetMeetsHIGMinimum` (after its closing `}` around line 306):

```swift

    func test_pipFrameButton_usesAdaptiveGlass_notFlatDarkCircle() throws {
        let source = try callViewSource()
        guard let range = source.range(of: "private func pipFrameButton") else {
            XCTFail("pipFrameButton must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 900, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains(".callControlGlass(diameter: 28, isActive: false, tint: .white)"),
            "pipFrameButton must use the same adaptiveGlass-backed callControlGlass wrapper " +
            "as every other circular call control (task #17) — not a hand-rolled " +
            "Color.black.opacity(0.45) circle."
        )
        XCTAssertFalse(
            body.contains("Color.black.opacity(0.45)"),
            "pipFrameButton's old flat dark-circle background must be fully removed, not left " +
            "as dead code alongside the new glass treatment."
        )
    }
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallViewAccessibilityTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: `test_pipFrameButton_usesAdaptiveGlass_notFlatDarkCircle` **FAILS** (the old
`Color.black.opacity(0.45)` is still there); `test_pipFrameButton_hitTargetMeetsHIGMinimum`
still PASSES (untouched so far).

- [ ] **Step 3: Replace the hand-rolled circle with `callControlGlass`**

In `apps/ios/Meeshy/Features/Main/Views/CallView.swift`, replace `pipFrameButton`'s body
(lines 1331-1350) with:

```swift
    /// Small circular control pinned to the local self-view frame (flip
    /// camera, filters). Buttons win the hit-test over the frame's tap-to-swap
    /// and drag gestures, so they stay usable on the 100×140 tile. Uses the
    /// same adaptiveGlass-backed callControlGlass as every other circular call
    /// control (task #17) instead of a bespoke flat dark circle — diameter
    /// stays 28 (unchanged), only the visual TREATMENT changes.
    private func pipFrameButton(icon: String, label: String, hint: String? = nil, action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white.opacity(0.95))
                .callControlGlass(diameter: 28, isActive: false, tint: .white)
                // Visual glyph stays a compact 28pt (the 100×140 tile has no
                // room for a 44pt circle), but the hit target itself must meet
                // the HIG 44×44 minimum — expand invisibly via contentShape.
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(label)
        .optionalAccessibilityHint(hint)
    }
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallViewAccessibilityTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: both `test_pipFrameButton_usesAdaptiveGlass_notFlatDarkCircle` and
`test_pipFrameButton_hitTargetMeetsHIGMinimum` PASS. If
`test_pipFrameButton_hitTargetMeetsHIGMinimum` fails because `.frame(width: 44, height: 44)`
now falls outside its 900-char window from `"private func pipFrameButton"`, widen that test's
`offsetBy: 900` to `offsetBy: 1200` — this codebase has hit this exact window-too-small class of
bug repeatedly (see `apps/ios/CLAUDE.md` test conventions); measure the actual offset with
Python if the first widening isn't enough:

```bash
python3 -c "
text = open('apps/ios/Meeshy/Features/Main/Views/CallView.swift').read()
start = text.index('private func pipFrameButton')
target = text.index('.frame(width: 44, height: 44)', start)
print('offset:', target - start)
"
```

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/CallView.swift \
        apps/ios/MeeshyTests/Unit/Views/CallViewAccessibilityTests.swift
git commit -m "fix(ios/calls): pipFrameButton adopts adaptiveGlass instead of a flat dark circle"
```

---

### Task 5: Full targeted suite + clean build

**Files:** none (verification only).

**Interfaces:** none — this task only runs what Tasks 1-4 already produced.

- [ ] **Step 1: Regenerate the Xcode project (picks up the new `CaptionsMode.swift` file)**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate && cd -
```

`meeshy.sh` does **not** run `xcodegen` automatically (per `apps/ios/CLAUDE.md`) — without this
step, `CaptionsMode.swift` (a brand-new file, Task 1) is invisible to `-only-testing:` even
though it compiles fine as part of the app target's recursive glob.

- [ ] **Step 2: Full build-for-testing**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: **BUILD SUCCEEDED**.

- [ ] **Step 3: Run every suite touched by this plan**

```bash
cd /Users/smpceo/Documents/v2_meeshy
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CaptionsModeTests \
  -only-testing:MeeshyTests/CallHangupFastPathTests \
  -only-testing:MeeshyTests/CallViewAccessibilityTests \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -80
```

Expected: every listed suite reports `passed`, 0 failures.

- [ ] **Step 4: Verify no unrelated churn crept into the diff**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git status --short
git diff --stat apps/ios/Meeshy.xcodeproj/project.pbxproj
```

`project.pbxproj` and `apps/ios/Meeshy/Info.plist`-family files may show a build-number bump
from the `xcodebuild` runs above (`meeshy.sh`'s known auto-bump behavior) — that's expected and
safe to include in this task's commit. If `git status` shows changes to files this plan never
touched (any file outside the list in Tasks 1-4's commits, `project.pbxproj`, or the 4
`Info.plist` files), **stop** — that's very likely another parallel agent/session's
in-progress work in this shared worktree; do not commit or modify it, per this session's
standing git-safety rule.

- [ ] **Step 5: Commit (only the version-bump artifacts, if any)**

```bash
cd /Users/smpceo/Documents/v2_meeshy
# Only run this if Step 4 showed pbxproj/Info.plist changes AND nothing else unexpected.
git add apps/ios/Meeshy.xcodeproj/project.pbxproj \
        apps/ios/Meeshy/Info.plist \
        apps/ios/MeeshyNotificationExtension/Info.plist \
        apps/ios/MeeshyShareExtension/Info.plist \
        apps/ios/MeeshyWidgets/Info.plist
git commit -m "chore(ios): bump build number (call control buttons harmonization verification pass)"
```

---

### Task 6: Manual device QA (not blocking — requires a real device, queued for the user)

**Files:** none — this is a verification checklist, not a code task.

This task cannot be executed autonomously: it requires a physical iPhone (Simulator has no
real front camera feed to check glyph contrast against, and VoiceOver gesture testing is far
more reliable on-device). Do **not** treat Tasks 1-5 as blocked by this one — they are already
fully verified by the simulator build + test suite above. Leave this as an open checklist item
for the user (or a future device-testing session) rather than attempting a simulator
workaround.

- [ ] **Step 1: VoiceOver — 3-state cycle**

Enable VoiceOver (Settings → Accessibility → VoiceOver, or triple-click side button if
configured). Start an audio or video call, enable captions. Double-tap the captions button 3
times and confirm VoiceOver announces, in order: "Sous-titres, Désactivés" (before the first
tap starts it — actually announced as the pre-tap state) → "Sous-titres, Traduction" →
"Sous-titres, Texte original" → back to "Sous-titres, Désactivés". Confirm swiping up/down on
the button does **not** do anything unexpected (no `.accessibilityAdjustableAction` was added
— see Task 2).

- [ ] **Step 2: PiP frame buttons — hit-test + glyph contrast**

Start a video call, let it connect. Confirm the flip-camera and filters buttons on the
self-preview tile still register taps reliably (the diameter didn't change, only the fill).
Point the front camera at a bright, plain background (a white wall, a well-lit face close to
the lens) and confirm the two glyphs (camera flip icon, filters icon) stay legible against the
adaptive-glass circle — this is the known "white-on-glass over bright call surfaces"
regression class flagged during design review; check it explicitly, not just the hit-test.

- [ ] **Step 3: Close out task #17**

Once both checks pass, mark task #17 completed in the task tracker. If either check reveals a
real regression, open a new, narrowly-scoped follow-up task rather than reopening this plan's
already-merged tasks.
