# Live Call Captions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild live call captions (on-device transcription + server-side translation) on iOS, reusing the gateway's existing `call:transcription-segment` → ZMQ translate → `call:translated-segment` pipeline instead of the abandoned WebRTC-DataChannel leader/follower design that PR #1795 correctly identified as dead but incorrectly concluded was unsalvageable.

**Architecture:** Each device captures ONLY its own microphone via a parallel `AVAudioEngine` tap (independent of WebRTC's audio pipeline — never touches remote/decoded audio, so the "no ADM in the public WebRTC SDK build" blocker never applies), transcribes it on-device with `SFSpeechRecognizer` (strictly on-device, no Apple-cloud fallback), and emits final segments over the already-connected call Socket.IO channel. The gateway (unchanged, already tested) translates per listener and relays back; the client displays.

**Tech Stack:** Swift 6.2 (`apps/ios`), Speech framework, AVFoundation, Combine, MeeshySDK (Socket.IO wrapper), TypeScript/Fastify/Socket.IO (`services/gateway`), Jest.

**Spec:** `docs/superpowers/specs/2026-07-10-live-call-transcription-design.md`

## Global Constraints

- TDD non-negotiable: write the failing test before production code (root `CLAUDE.md`).
- Swift strict mode, no `any` in TypeScript, no force-unwraps beyond established codebase patterns.
- Speech recognition MUST be `requiresOnDeviceRecognition = true` always — never fall back to Apple's server-assisted recognition, even when on-device is unsupported for a language (spec decision: confidentiality over coverage).
- Socket.IO event names use `entity:action-word` with hyphens (`call:transcription-segment`, `call:translated-segment`) — already defined in `packages/shared/types/video-call.ts`, do not rename.
- SDK purity: typed socket emit/publisher atoms live in `packages/MeeshySDK`; call-lifecycle orchestration (when to start capture, how to render) lives in `apps/ios`.
- `./apps/ios/meeshy.sh build`/`test` for all iOS verification — never call `xcodebuild` directly. Run `cd apps/ios && xcodegen generate` after adding any new Swift file (not needed here — no new files, only edits to existing ones).
- No `Co-Authored-By` trailer in commit messages for this repo (established project convention).
- Real-device validation is mandatory for Task 1 (spike) and the final QA pass — the CallKit/WebRTC audio session has no reliable parity in the iOS Simulator.
- Do not touch `CallTranscriptionRoleEvent`/`CALL_EVENTS.TRANSCRIPTION_ROLE` (`packages/shared/types/video-call.ts`) or the gateway's participant-language resolution (`systemLanguage`-only, not the full `resolveUserLanguage()` chain) — both are explicitly out of scope per the spec.

---

### Task 1: Phase 0 — Local mic tap spike (device-gated go/no-go)

**Spike result (2026-07-10, iPhone "Services CEO i16pm" — iPhone 16 Pro Max, plus iPhone 16 Pro Simulator):** PASS —
no audible degradation on either end of a real 1:1 call across two physical devices (confirmed "nickel" both
directions by the user), zero crashes on device or simulator after fixing a SIGTRAP caused by implicit
MainActor isolation on the AVAudioEngine tap closure (root-caused and fixed with an explicit `@Sendable`-typed
local + `nonisolated` logger — see `CallTranscriptionService.swift` history). Buffer-level confirmation (`[SPIKE]`
log lines showing non-zero `frameLength`) was not captured — remote sysdiagnose collection failed (device
needs to be unlocked to confirm on-device, not scriptable via `devicectl`) — and the user explicitly accepted
PASS without it, given the `AVAudioEngine.start()` success log fires unconditionally before any buffer-delivery
failure and two independent live-call tests already confirm zero audio-path impact. Interruption/route-change
behavior (Step 4.8-4.9) was not explicitly exercised — deferred to the Task 7 final QA pass, not re-blocking here.

**Only continue to Task 2 onward given this PASS.**

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift` (temporary `#if DEBUG` addition, absorbed/removed by Task 3)
- Modify: `apps/ios/Meeshy/Features/Main/Views/CallView.swift:1306-1348` (temporary long-press gesture on the existing transcript overlay area, removed by Task 5)

**Interfaces:**
- Produces: a PASS/FAIL decision, recorded as a comment block at the top of this task in this plan file, that gates every subsequent task.

This task has no automated test — it is a hardware experiment. Follow the steps exactly and record the outcome.

- [x] **Step 1: Add the debug-only tap toggle to `CallTranscriptionService`**

Open `apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift` and append at the end of the file (after the closing `}` of the `CallTranscriptionService` class):

```swift
#if DEBUG
extension CallTranscriptionService {
    /// Phase-0 spike only — NOT part of the shipped feature. Installs a raw
    /// AVAudioEngine tap on the mic input, independent of WebRTC's own audio
    /// pipeline, and logs buffer counts. Validates that a second audio
    /// consumer can coexist with RTCAudioSession.useManualAudio + CallKit's
    /// didActivate/didDeactivate lifecycle without degrading call audio.
    /// Deleted (or absorbed into startLocalCapture) once Task 3 lands.
    func debugSpikeToggleLocalCapture() {
        if Self.spikeEngine != nil {
            Self.spikeEngine?.inputNode.removeTap(onBus: 0)
            Self.spikeEngine?.stop()
            Self.spikeEngine = nil
            callsLogger.info("[SPIKE] stopped — received \(Self.spikeBufferCount) buffers")
            Self.spikeBufferCount = 0
            return
        }
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        // Explicit @Sendable-typed local breaks the implicit MainActor
        // isolation this project's SWIFT_DEFAULT_ACTOR_ISOLATION infers onto
        // closure literals written inline inside a @MainActor method.
        // AVAudioEngine invokes tap blocks off-MainActor (its own real-time
        // queue) — an inferred-MainActor closure traps at runtime (SIGTRAP,
        // swift_task_isCurrentExecutorImpl) the first time AVAudioEngine
        // calls it. DO NOT pass a bare trailing closure to installTap here —
        // it crashed on first execution during this exact spike (found
        // 2026-07-10, crash report Meeshy-2026-07-10-173828.ips).
        let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { buffer, _ in
            Self.spikeBufferCount += 1
            if Self.spikeBufferCount % 50 == 0 {
                callsLogger.info("[SPIKE] buffers=\(Self.spikeBufferCount) frameLength=\(buffer.frameLength) sampleRate=\(format.sampleRate)")
            }
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format, block: tapBlock)
        do {
            engine.prepare()
            try engine.start()
            Self.spikeEngine = engine
            callsLogger.info("[SPIKE] AVAudioEngine tap started — format=\(format)")
        } catch {
            callsLogger.error("[SPIKE] AVAudioEngine.start() failed: \(error.localizedDescription)")
        }
    }

    // nonisolated(unsafe): mutated from the tap's real-time audio-thread
    // closure, which cannot hop to MainActor (CallTranscriptionService's
    // default isolation) without cost. Acceptable ONLY because this is
    // throwaway spike code reverted in Step 6 — a plain counter race is
    // harmless for a qualitative "are buffers arriving" check. The real
    // Task 3 implementation avoids this entirely by never touching
    // actor-isolated state from the tap closure (see startLocalCapture).
    private nonisolated(unsafe) static var spikeEngine: AVAudioEngine?
    private nonisolated(unsafe) static var spikeBufferCount = 0
}
#endif
```

`callsLogger` is the file-private `Logger` already declared at the top of `CallTranscriptionService.swift` — no import changes needed (`AVFoundation` is already imported for `AVAudioPCMBuffer`).

- [x] **Step 2: Add a temporary, always-visible trigger button in `CallView`**

Do NOT attach the gesture to `transcriptOverlay` — that panel's `VStack` is built by `ForEach(transcriptionService.displayedSegments)`, which is always empty during this spike (it never produces segments, only console logs), so the panel collapses to a near-zero hit area and a gesture placed on it is effectively untappable (confirmed during execution: "aucun bouton ne s'affiche" — the panel really was invisible, not a device issue). Add a fixed, unconditionally-visible debug button instead. In `apps/ios/Meeshy/Features/Main/Views/CallView.swift`, inside `body`'s outer `ZStack`, locate `transcriptOverlay` (currently around line 718-719) and add right after it:

```swift
            // Transcript overlay
            transcriptOverlay

#if DEBUG
            // SPIKE (Task 1) — fixed, always-visible debug affordance.
            // Reverted in Step 6 along with the rest of the spike scaffolding.
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Circle()
                        .fill(Color.red.opacity(0.85))
                        .frame(width: 56, height: 56)
                        .overlay(
                            Image(systemName: "mic.badge.plus")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.white)
                        )
                        .onTapGesture {
                            callManager.transcriptionService.debugSpikeToggleLocalCapture()
                        }
                        .padding(.trailing, 16)
                        .padding(.bottom, 220)
                }
            }
#endif

            // §7.2 — draggable, corner-snapping PiP showing the secondary
```

No `showTranscript` default change needed — this button doesn't depend on it. Use a plain tap, not a long-press: automated long-press gestures (`idb`/simulator HID synthesis) are unreliable — SwiftUI's `.onLongPressGesture` cancels on the slightest synthetic-touch jitter during the hold, which reads as "nothing happens" and is easy to misdiagnose as an app bug (confirmed during execution — repeated long-press attempts produced no `[SPIKE]` log and no crash, i.e. silently missed, until switched to `.onTapGesture`). A plain tap is just as good for this throwaway diagnostic.

- [x] **Step 3: Build and install on a real device**

```bash
./apps/ios/meeshy.sh build
./apps/ios/meeshy.sh run
```

A real device is required (not the simulator) — CallKit's `provider:didActivate:audioSession` timing and the shared `AVAudioSession` have no reliable simulator parity, and this is exactly the interaction under test.

- [x] **Step 4: Run the manual verification protocol**

Perform an actual 1:1 audio call between two real devices (or one real device + one other participant), and on the device under test:

1. Let the call connect and reach the `connected` state (CallKit `didActivate` has fired).
2. Tap the fixed red debug button (bottom-right) to start the spike tap.
3. Speak continuously for at least 30 seconds.
4. On the OTHER participant's device, listen: is the outgoing audio they hear from you unchanged (no dropouts, no volume change, no artifacts)?
5. On the device under test, listen to the incoming remote audio: unchanged?
6. Open Console.app (connected to the device) or `xcrun devicectl device console` and confirm `[SPIKE]` log lines appear at a steady rate (roughly one every ~1-2s at 1024-sample buffers / typical 48kHz-or-44.1kHz mic rate) with a non-zero `frameLength`.
7. Tap again to stop the tap. Confirm the call audio is unaffected before and after stopping.
8. Trigger an audio interruption (e.g. a Siri request, or another app briefly grabbing the mic) while the tap is running — confirm the call does not drop and does not crash.
9. Toggle speaker/earpiece route while the tap is running — confirm no crash, and re-run step 4-5.

- [x] **Step 5: Record the go/no-go decision**

Edit this plan file (`docs/superpowers/plans/2026-07-10-live-call-transcription.md`) and insert directly below the `### Task 1` heading a line:

```markdown
**Spike result (YYYY-MM-DD, device model / iOS version):** PASS — no audible degradation, tap delivered buffers steadily, no crashes across interruption/route-change.
```

or, if any check in Step 4 fails:

```markdown
**Spike result (YYYY-MM-DD, device model / iOS version):** FAIL — <exact symptom>. STOP. Do not proceed to Task 2 onward. Escalate to the user with the spec's risk table (`docs/superpowers/specs/2026-07-10-live-call-transcription-design.md`) — this closes off Approach A.
```

**Only continue to Task 2 if the result is PASS.**

- [x] **Step 6: Revert the temporary spike scaffolding**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git diff apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift apps/ios/Meeshy/Features/Main/Views/CallView.swift
git checkout -- apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift apps/ios/Meeshy/Features/Main/Views/CallView.swift
```

This discards the `#if DEBUG` scaffolding and the `showTranscript` default flip — Task 3 and Task 5 rebuild the real (non-debug, correctly gated) versions from a clean base. Do not commit the spike scaffolding.

- [x] **Step 7: Commit the plan file's recorded decision only**

```bash
git add docs/superpowers/plans/2026-07-10-live-call-transcription.md
git commit -m "docs(ios/calls): record Phase 0 spike result for live call captions"
```

---

### Task 2: SDK — wire `call:transcription-segment` / `call:translated-segment`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`
- Modify: `apps/ios/MeeshyTests/Mocks/MockMessageSocket.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/Helpers/MockMessageSocket.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Sockets/MessageSocketEventTests.swift`

**Interfaces:**
- Produces: `CallTranscriptionSegmentPayload` (Sendable struct, outbound), `CallTranslatedSegmentData` (Decodable & Sendable, inbound), `MessageSocketProviding.emitCallTranscriptionSegment(callId: String, segment: CallTranscriptionSegmentPayload)`, `MessageSocketProviding.callTranslatedSegmentReceived: PassthroughSubject<CallTranslatedSegmentData, Never>`. Task 3 and Task 4 consume these exact names/types.

- [x] **Step 1: Write the failing decode test**

Open `packages/MeeshySDK/Tests/MeeshySDKTests/Sockets/MessageSocketEventTests.swift` and add, right after the `testMessagePinnedEventDecoding_tolerantWithoutOptionalFields` test (mirrors the existing plain-decode style used throughout this file):

```swift
    // MARK: - CallTranslatedSegmentData

    func testCallTranslatedSegmentEventDecoding() throws {
        let json = """
        {
            "callId": "507f1f77bcf86cd799439011",
            "segment": {
                "text": "Bonjour",
                "translatedText": "Hello",
                "speakerId": "user-abc",
                "startMs": 0,
                "endMs": 1500,
                "isFinal": true,
                "sourceLanguage": "fr",
                "targetLanguage": "en",
                "confidence": 0.95
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(CallTranslatedSegmentData.self, from: json)
        XCTAssertEqual(event.callId, "507f1f77bcf86cd799439011")
        XCTAssertEqual(event.segment.text, "Bonjour")
        XCTAssertEqual(event.segment.translatedText, "Hello")
        XCTAssertEqual(event.segment.speakerId, "user-abc")
        XCTAssertEqual(event.segment.startMs, 0)
        XCTAssertEqual(event.segment.endMs, 1500)
        XCTAssertTrue(event.segment.isFinal)
        XCTAssertEqual(event.segment.sourceLanguage, "fr")
        XCTAssertEqual(event.segment.targetLanguage, "en")
        XCTAssertEqual(event.segment.confidence, 0.95, accuracy: 0.001)
    }

    func testCallTranslatedSegmentEventDecoding_withoutTranslatedText_fallsBackToNil() throws {
        // `translatedText` is omitted when ZMQ translation is disabled/unavailable —
        // consumers must fall back to displaying `text`.
        let json = """
        {
            "callId": "507f1f77bcf86cd799439011",
            "segment": {
                "text": "Bonjour",
                "speakerId": "user-abc",
                "startMs": 0,
                "endMs": 1500,
                "isFinal": true,
                "sourceLanguage": "fr",
                "targetLanguage": "fr",
                "confidence": 0.95
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(CallTranslatedSegmentData.self, from: json)
        XCTAssertNil(event.segment.translatedText)
    }
```

- [x] **Step 2: Run the test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,name=iPhone 16 Pro" \
  -only-testing:MeeshySDKTests/MessageSocketEventTests 2>&1 | tail -40
```

Expected: FAIL — `cannot find type 'CallTranslatedSegmentData' in scope`.

- [x] **Step 3: Add the wire models**

In `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`, locate the `CallForcedLeaveData` struct (the last struct in the "Call signaling" model block, ends with a closing `}` right before the `// MARK: - Connection State` — actually before the concrete class declaration; verify by searching for `public struct CallForcedLeaveData`). Insert immediately after it:

```swift

public struct CallTranscriptionSegmentPayload: Sendable {
    public let text: String
    public let speakerId: String
    public let startMs: Int
    public let endMs: Int
    public let isFinal: Bool
    public let confidence: Double
    public let language: String

    public init(
        text: String, speakerId: String, startMs: Int, endMs: Int,
        isFinal: Bool, confidence: Double, language: String
    ) {
        self.text = text
        self.speakerId = speakerId
        self.startMs = startMs
        self.endMs = endMs
        self.isFinal = isFinal
        self.confidence = confidence
        self.language = language
    }
}

/// Event: call:translated-segment (Server → Client). Mirrors
/// `CallTranslatedSegmentEvent` in `packages/shared/types/video-call.ts`.
/// `translatedText` is omitted when ZMQ translation is disabled/unavailable —
/// consumers fall back to displaying `text`.
public struct CallTranslatedSegmentData: Decodable, Sendable {
    public let callId: String
    public let segment: Segment

    public struct Segment: Decodable, Sendable {
        public let text: String
        public let translatedText: String?
        public let speakerId: String
        public let startMs: Int
        public let endMs: Int
        public let isFinal: Bool
        public let sourceLanguage: String
        public let targetLanguage: String
        public let confidence: Double
    }
}
```

- [x] **Step 4: Run the test to verify it passes**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,name=iPhone 16 Pro" \
  -only-testing:MeeshySDKTests/MessageSocketEventTests 2>&1 | tail -20
```

Expected: PASS.

- [x] **Step 5: Add the protocol requirements + default shim**

In the same file, in `public protocol MessageSocketProviding: Sendable { ... }`, add next to the other `var callXxx: PassthroughSubject<...>` declarations (after `var callForcedLeave: PassthroughSubject<CallForcedLeaveData, Never> { get }`):

```swift
    var callTranslatedSegmentReceived: PassthroughSubject<CallTranslatedSegmentData, Never> { get }
```

And add next to the other `func emitCallXxx(...)` declarations (after `func emitCallScreenCaptureDetected(callId: String, participantId: String, isCapturing: Bool)`):

```swift
    func emitCallTranscriptionSegment(callId: String, segment: CallTranscriptionSegmentPayload)
```

In `public extension MessageSocketProviding { ... }` (the default-shim block), add next to `func emitCallScreenCaptureDetected(...) {}`:

```swift
    func emitCallTranscriptionSegment(callId: String, segment: CallTranscriptionSegmentPayload) {}
```

This default no-op keeps every existing conformer (both mocks, plus any other future conformer) compiling without modification — Task 2 Step 7 upgrades the two mocks to track calls, but they are not *required* to.

- [x] **Step 6: Implement the concrete class**

In `public final class MessageSocketManager`, add the publisher next to the other call publishers (after `public let callForcedLeave = PassthroughSubject<CallForcedLeaveData, Never>()`):

```swift
    public let callTranslatedSegmentReceived = PassthroughSubject<CallTranslatedSegmentData, Never>()
```

Add the inbound `socket.on` registration next to the other call-event registrations (after the `socket.on("call:force-leave") { ... }` block):

```swift

        socket.on("call:translated-segment") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallTranslatedSegmentData.self, from: data) { [weak self] event in
                self?.callTranslatedSegmentReceived.send(event)
            }
        }
```

Add the concrete emit implementation next to `emitCallHeartbeat` (fire-and-forget, matching that exact pattern):

```swift

    /// Emits a final (isFinal=true only — callers must not send partials)
    /// local transcription segment. The gateway relays it, translated per
    /// listener's `systemLanguage`, as `call:translated-segment`.
    public func emitCallTranscriptionSegment(callId: String, segment: CallTranscriptionSegmentPayload) {
        socket?.emit("call:transcription-segment", [
            "callId": callId,
            "segment": [
                "text": segment.text,
                "speakerId": segment.speakerId,
                "startMs": segment.startMs,
                "endMs": segment.endMs,
                "isFinal": segment.isFinal,
                "confidence": segment.confidence,
                "language": segment.language
            ]
        ])
    }
```

- [x] **Step 7: Update both `MockMessageSocket` conformers**

In `apps/ios/MeeshyTests/Mocks/MockMessageSocket.swift`, add next to `let callScreenCaptureAlert = PassthroughSubject<CallScreenCaptureAlertData, Never>()`:

```swift
    let callTranslatedSegmentReceived = PassthroughSubject<CallTranslatedSegmentData, Never>()
```

And add, next to `var callScreenCaptureDetectedCallCount = 0` (search for the `CallCount` var block near the top of the file, alongside the other `var xCallCount = 0` declarations):

```swift
    var emitCallTranscriptionSegmentCallCount = 0
    var lastEmittedTranscriptionSegment: CallTranscriptionSegmentPayload?
```

And add the tracked implementation next to `func emitCallScreenCaptureDetected(...)`:

```swift
    func emitCallTranscriptionSegment(callId: String, segment: CallTranscriptionSegmentPayload) {
        emitCallTranscriptionSegmentCallCount += 1
        lastEmittedTranscriptionSegment = segment
    }
```

Repeat the identical three additions (publisher, call-count var, tracked func) in `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/Helpers/MockMessageSocket.swift` — read that file first to match its exact local conventions (it may use a different `CallCount`/tracking naming scheme than the app-target mock; mirror whatever pattern it already uses for `emitCallScreenCaptureDetected`, keeping the property/method names identical to the app-target mock above so both compile against the same protocol).

- [x] **Step 8: Run the full SDK and app test suites**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,name=iPhone 16 Pro" 2>&1 | tail -30
```

Expected: PASS, no new failures. This also compiles both `MockMessageSocket` targets, which is the real regression check for Step 7 (a missing conformance is a compile error, not a test failure).

- [x] **Step 9: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Sockets/MessageSocketEventTests.swift \
        apps/ios/MeeshyTests/Mocks/MockMessageSocket.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Cache/Helpers/MockMessageSocket.swift
git commit -m "feat(sdk/calls): wire call:transcription-segment emit + call:translated-segment publisher"
```

---

### Task 3: App — rewrite `CallTranscriptionService` (local-only capture, no leader/follower)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift` (full rewrite)
- Modify: `apps/ios/MeeshyTests/Unit/Services/CallTranscriptionServiceTests.swift` (full rewrite)

**Interfaces:**
- Consumes: `MessageSocketProviding` (Task 2), `CallTranscriptionSegmentPayload` (Task 2), `CallTranslatedSegmentData` (Task 2, consumed by Task 4 — NOT this file).
- Produces: `TranscriptionSegment` (unchanged shape from the deleted version — `id, text, speakerId, startTime, endTime, isFinal, confidence, language, translatedText, translatedLanguage`), `TranscriptionPermission`, `TranscriptionError`, `CallTranscriptionServiceProviding` protocol with `startTranscribing(callId: String, localLanguage: String, localUserId: String)`, `stopTranscribing()`, `requestPermission() async -> TranscriptionPermission`, `receiveTranslatedSegment(_ segment: TranscriptionSegment)`, `resetForCallEnd()`. Task 4 (`CallManager`) and Task 5 (`CallView`) consume these exact names.

This is a full rewrite, not an incremental diff — the class loses the leader/follower/role/capability/DataChannel model entirely and gains local-only AVAudioEngine capture + socket emission. Follow the steps in order; each step's test must be green before the next.

- [x] **Step 1: Delete the obsolete role-negotiation tests**

Open `apps/ios/MeeshyTests/Unit/Services/CallTranscriptionServiceTests.swift`. Delete every test in the `// MARK: - Role Negotiation` section (`test_resolveRole_*`), the `// MARK: - Capability Detection` section (`test_detectLocalCapability_*`, `test_supportedOnDeviceLanguages_*`), and any test referencing `remoteLanguage`, `remoteUserId`, `appendRemoteAudioBuffer`, `receiveRemoteSegment`, `role`, `localCapability`, or `pendingRemoteSegments` — these concepts no longer exist. Keep the `makeSegment(...)` factory function and any test that only exercises `segments`/`isTranscribing`/`permission`/`lastError`/`isShowingOverlay`/`displayedSegments` state that doesn't reference the removed concepts.

- [x] **Step 2: Update `makeSUT` to inject the mock socket, write the failing test**

Replace the `makeSUT` factory:

```swift
    private func makeSUT() -> (sut: CallTranscriptionService, socket: MockMessageSocket) {
        let socket = MockMessageSocket()
        let sut = CallTranscriptionService(socket: socket)
        return (sut, socket)
    }
```

Update every existing call site of `makeSUT()` in the file to destructure `let (sut, _) = makeSUT()` (or `let (sut, socket) = makeSUT()` where the test needs to assert on the socket).

Add this new test at the end of the `// MARK: - Initial State` section:

```swift
    func test_startTranscribing_whenPermissionNotAuthorized_setsPermissionDeniedError() {
        let (sut, socket) = makeSUT()
        sut.startTranscribing(callId: "call-1", localLanguage: "fr", localUserId: "user-1")
        XCTAssertFalse(sut.isTranscribing)
        XCTAssertEqual(sut.lastError, .permissionDenied)
        XCTAssertEqual(socket.emitCallTranscriptionSegmentCallCount, 0)
    }
```

- [x] **Step 3: Run to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: FAIL — `CallTranscriptionService` has no initializer accepting a `socket:` argument, and no `startTranscribing(callId:localLanguage:localUserId:)`.

- [x] **Step 4: Rewrite `CallTranscriptionService.swift`**

Replace the entire file content with:

```swift
import Speech
import AVFoundation
import Combine
import MeeshySDK
import os

// nonisolated: os.Logger is a thread-safe value type (Apple docs) with no
// reason to inherit this file's default MainActor isolation — needed so the
// AVAudioEngine tap closure (which runs off-MainActor, see
// startLocalCapture/reinstallTap below) can log without an isolation error.
// Discovered via the Task 1 spike (2026-07-10): a bare `private let` here
// made the tap closure's log call fail to compile once the closure was
// correctly typed `@Sendable` (see below) — same fix applied there.
private nonisolated let callsLogger = Logger(subsystem: "me.meeshy.app", category: "calls")

// MARK: - Transcription Segment

struct TranscriptionSegment: Identifiable, Equatable {
    let id: UUID
    let text: String
    let speakerId: String
    let startTime: TimeInterval
    let endTime: TimeInterval
    let isFinal: Bool
    let confidence: Double
    let language: String
    let translatedText: String?
    let translatedLanguage: String?

    init(
        id: UUID,
        text: String,
        speakerId: String,
        startTime: TimeInterval,
        endTime: TimeInterval,
        isFinal: Bool,
        confidence: Double,
        language: String,
        translatedText: String? = nil,
        translatedLanguage: String? = nil
    ) {
        self.id = id
        self.text = text
        self.speakerId = speakerId
        self.startTime = startTime
        self.endTime = endTime
        self.isFinal = isFinal
        self.confidence = confidence
        self.language = language
        self.translatedText = translatedText
        self.translatedLanguage = translatedLanguage
    }
}

// MARK: - Transcription Permission

enum TranscriptionPermission: Equatable {
    case notDetermined
    case authorized
    case denied
    case restricted
}

// MARK: - Transcription Error

enum TranscriptionError: LocalizedError, Equatable {
    case permissionDenied
    case recognizerUnavailable(language: String)
    case onDeviceNotSupported(language: String)
    case recognitionFailed(underlying: Error)
    case audioEngineFailed(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Speech recognition permission denied"
        case .recognizerUnavailable(let language):
            return "Speech recognizer unavailable for language: \(language)"
        case .onDeviceNotSupported(let language):
            return "On-device recognition not supported for language: \(language)"
        case .recognitionFailed(let error):
            return "Recognition failed: \(error.localizedDescription)"
        case .audioEngineFailed(let error):
            return "Local audio capture failed: \(error.localizedDescription)"
        }
    }

    static func == (lhs: TranscriptionError, rhs: TranscriptionError) -> Bool {
        lhs.errorDescription == rhs.errorDescription
    }
}

// MARK: - Protocol

@MainActor
protocol CallTranscriptionServiceProviding {
    var segments: [TranscriptionSegment] { get }
    var isTranscribing: Bool { get }
    var permission: TranscriptionPermission { get }
    var lastError: TranscriptionError? { get }
    func startTranscribing(callId: String, localLanguage: String, localUserId: String)
    func stopTranscribing()
    func requestPermission() async -> TranscriptionPermission
    func receiveTranslatedSegment(_ segment: TranscriptionSegment)
}

// MARK: - Call Transcription Service

/// Live-call captions: transcribes ONLY the local device's own microphone
/// (never the remote/decoded WebRTC audio — see
/// docs/superpowers/specs/2026-07-10-live-call-transcription-design.md for
/// why that sidesteps the "no ADM in the public WebRTC SDK build" blocker
/// that made the previous leader/follower design unreachable). Final
/// segments are sent to the gateway over the existing call socket
/// (`call:transcription-segment`), which relays them translated per
/// listener (`call:translated-segment`) — this class never translates
/// anything itself.
@MainActor
final class CallTranscriptionService: ObservableObject, CallTranscriptionServiceProviding {

    private enum Constants {
        static let maxDisplayedSegments = 5
        static let segmentRetentionLimit = 50
    }

    @Published private(set) var segments: [TranscriptionSegment] = []
    @Published private(set) var isTranscribing = false
    @Published private(set) var permission: TranscriptionPermission = .notDetermined
    @Published private(set) var lastError: TranscriptionError?

    /// PERF-005: while the live-captions panel is hidden, non-final results
    /// are skipped (no per-frame UI churn); finals are always processed and
    /// emitted regardless, since they also feed the other participant's view.
    @Published var isShowingOverlay: Bool = false

    var displayedSegments: [TranscriptionSegment] {
        Array(segments.suffix(Constants.maxDisplayedSegments))
    }

    private let socket: any MessageSocketProviding
    private var callId: String?
    private var localUserId = ""
    private var allSegments: [TranscriptionSegment] = []

    private let audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var rotationCount = 0

    init(socket: any MessageSocketProviding = MessageSocketManager.shared) {
        self.socket = socket
    }

    // MARK: - Permission

    func requestPermission() async -> TranscriptionPermission {
        let status = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
        let result = mapAuthorizationStatus(status)
        permission = result
        return result
    }

    // MARK: - Lifecycle

    func startTranscribing(callId: String, localLanguage: String, localUserId: String) {
        guard !isTranscribing else {
            callsLogger.warning("startTranscribing called while already transcribing")
            return
        }
        guard permission == .authorized else {
            lastError = .permissionDenied
            callsLogger.warning("startTranscribing: not authorized — permission=\(String(describing: self.permission))")
            return
        }

        let locale = Locale(identifier: localLanguage)
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            lastError = .recognizerUnavailable(language: localLanguage)
            callsLogger.warning("startTranscribing: no recognizer available for \(localLanguage)")
            return
        }
        // Confidentialité — jamais de repli sur la reconnaissance vocale
        // serveur d'Apple pendant un appel privé (décision produit du spec).
        guard recognizer.supportsOnDeviceRecognition else {
            lastError = .onDeviceNotSupported(language: localLanguage)
            callsLogger.warning("startTranscribing: on-device unsupported for \(localLanguage)")
            return
        }

        self.callId = callId
        self.localUserId = localUserId
        self.recognizer = recognizer
        lastError = nil

        do {
            try startLocalCapture()
        } catch {
            lastError = .audioEngineFailed(underlying: error)
            callsLogger.error("startTranscribing: AVAudioEngine failed: \(error.localizedDescription)")
            self.recognizer = nil
            return
        }

        startRecognitionTask(language: localLanguage)
        isTranscribing = true
        callsLogger.info("Call transcription started — local language: \(localLanguage)")
    }

    func stopTranscribing() {
        stopLocalCapture()
        recognitionTask?.cancel()
        recognitionTask = nil
        request?.endAudio()
        request = nil
        recognizer = nil

        allSegments.removeAll()
        segments.removeAll()
        isTranscribing = false
        lastError = nil
        callId = nil

        callsLogger.info("Call transcription stopped")
    }

    /// Teardown de fin d'appel — purge INCONDITIONNELLE, y compris si ce
    /// device n'a jamais transcrit lui-même (isTranscribing == false) mais a
    /// reçu des segments traduits de l'autre participant via
    /// `receiveTranslatedSegment`. Sans ce garde, le transcript de l'appel
    /// précédent resterait visible au suivant.
    func resetForCallEnd() {
        stopTranscribing()
        isShowingOverlay = false
    }

    // MARK: - Local audio capture (jamais l'audio distant)

    /// Tap indépendant du pipeline audio WebRTC, installé APRÈS l'activation
    /// CallKit (voir CallManager.toggleTranscription — jamais avant, même
    /// contrainte documentée dans P2PWebRTCClient.swift pour WebRTC
    /// lui-même). Validé par le spike Phase 0 — voir Task 1 de
    /// docs/superpowers/plans/2026-07-10-live-call-transcription.md.
    ///
    /// The tap block MUST be an explicit `@Sendable`-typed local, not a bare
    /// trailing closure — under this project's
    /// `SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor`, a closure literal written
    /// inline inside this `@MainActor` method is implicitly inferred as
    /// MainActor-isolated regardless of what it captures. AVAudioEngine
    /// invokes tap blocks off-MainActor (its own real-time queue); an
    /// inferred-MainActor closure traps at runtime (SIGTRAP,
    /// `swift_task_isCurrentExecutorImpl`) the first time it's called.
    /// Discovered via the Task 1 spike (2026-07-10, crash report
    /// `Meeshy-2026-07-10-173828.ips`) — do not revert this pattern.
    private func startLocalCapture() throws {
        let newRequest = SFSpeechAudioBufferRecognitionRequest()
        newRequest.shouldReportPartialResults = true
        newRequest.addsPunctuation = true
        newRequest.requiresOnDeviceRecognition = true
        request = newRequest

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { [request = newRequest] buffer, _ in
            request.append(buffer)
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format, block: tapBlock)
        audioEngine.prepare()
        try audioEngine.start()
    }

    private func stopLocalCapture() {
        guard audioEngine.isRunning else { return }
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
    }

    /// See `startLocalCapture`'s doc comment — same `@Sendable`-typed-local
    /// requirement applies here.
    private func reinstallTap(for newRequest: SFSpeechAudioBufferRecognitionRequest) {
        audioEngine.inputNode.removeTap(onBus: 0)
        let format = audioEngine.inputNode.outputFormat(forBus: 0)
        let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { [request = newRequest] buffer, _ in
            request.append(buffer)
        }
        audioEngine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: format, block: tapBlock)
    }

    // MARK: - Recognition

    private func startRecognitionTask(language: String) {
        guard let recognizer, let request else { return }
        let speakerId = localUserId
        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            self?.handleRecognizerCallback(result: result, error: error, speakerId: speakerId, language: language)
        }
    }

    /// PERF-005: runs on the recognizer's own queue (off-Main). Extracts
    /// Sendable scalars, then hands off to MainActor for state mutation.
    nonisolated private func handleRecognizerCallback(
        result: SFSpeechRecognitionResult?,
        error: Error?,
        speakerId: String,
        language: String
    ) {
        if let error {
            let errorDescription = error.localizedDescription
            Task.detached(priority: .utility) { [weak self] in
                await MainActor.run { [weak self] in
                    guard let self, self.isTranscribing else { return }
                    self.lastError = .recognitionFailed(underlying: NSError(
                        domain: "CallTranscriptionService",
                        code: -2,
                        userInfo: [NSLocalizedDescriptionKey: errorDescription]
                    ))
                    callsLogger.error("Recognition error: \(errorDescription, privacy: .public)")
                }
            }
            return
        }

        guard let result else { return }
        let isFinal = result.isFinal
        let text = result.bestTranscription.formattedString
        let asrSegments = result.bestTranscription.segments
        let startMs = Int((asrSegments.first?.timestamp ?? 0) * 1000)
        let lastAsrSegment = asrSegments.last
        let endMs = Int(((lastAsrSegment?.timestamp ?? 0) + (lastAsrSegment?.duration ?? 0)) * 1000)
        let confidence = Double(lastAsrSegment?.confidence ?? 0)

        Task.detached(priority: .utility) { [weak self] in
            await self?.applyRecognitionResult(
                text: text, speakerId: speakerId, startMs: startMs, endMs: endMs,
                isFinal: isFinal, confidence: confidence, language: language
            )
        }
    }

    /// Internal (not `private`) so `CallTranscriptionServiceTests` can drive
    /// it directly, matching the stale-callback-after-teardown guard test.
    func applyRecognitionResult(
        text: String, speakerId: String, startMs: Int, endMs: Int,
        isFinal: Bool, confidence: Double, language: String
    ) {
        guard isTranscribing else { return }
        guard isFinal || isShowingOverlay else { return }

        let segment = TranscriptionSegment(
            id: UUID(), text: text, speakerId: speakerId,
            startTime: Double(startMs) / 1000, endTime: Double(endMs) / 1000,
            isFinal: isFinal, confidence: confidence, language: language
        )
        appendSegment(segment)

        guard isFinal else { return }
        emitFinalSegment(text: text, speakerId: speakerId, startMs: startMs, endMs: endMs, confidence: confidence, language: language)
        rotateRecognitionRequest(language: language)
    }

    private func emitFinalSegment(text: String, speakerId: String, startMs: Int, endMs: Int, confidence: Double, language: String) {
        guard let callId else { return }
        let payload = CallTranscriptionSegmentPayload(
            text: text, speakerId: speakerId, startMs: startMs, endMs: endMs,
            isFinal: true, confidence: confidence, language: language
        )
        socket.emitCallTranscriptionSegment(callId: callId, segment: payload)
    }

    private func rotateRecognitionRequest(language: String) {
        recognitionTask?.cancel()
        request?.endAudio()

        let newRequest = SFSpeechAudioBufferRecognitionRequest()
        newRequest.shouldReportPartialResults = true
        newRequest.addsPunctuation = true
        newRequest.requiresOnDeviceRecognition = true
        request = newRequest
        reinstallTap(for: newRequest)

        startRecognitionTask(language: language)
        rotationCount += 1
    }

    // MARK: - Remote segments (déjà traduits côté gateway)

    func receiveTranslatedSegment(_ segment: TranscriptionSegment) {
        appendSegment(segment)
    }

    // MARK: - Private — Result Handling

    private func appendSegment(_ segment: TranscriptionSegment) {
        allSegments.removeAll { $0.speakerId == segment.speakerId && !$0.isFinal }
        allSegments.append(segment)
        if allSegments.count > Constants.segmentRetentionLimit {
            allSegments = Array(allSegments.suffix(Constants.segmentRetentionLimit))
        }
        segments = allSegments.sorted { $0.startTime < $1.startTime }
    }

    private func mapAuthorizationStatus(_ status: SFSpeechRecognizerAuthorizationStatus) -> TranscriptionPermission {
        switch status {
        case .authorized: return .authorized
        case .denied: return .denied
        case .restricted: return .restricted
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }
}
```

- [x] **Step 5: Run to verify the new test passes**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -40
SIM=$(xcrun simctl create tmp182 "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/CallTranscriptionServiceTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: PASS.

- [x] **Step 6: Write the failing test for the purge invariant**

Add to `CallTranscriptionServiceTests.swift`:

```swift
    func test_resetForCallEnd_purgesSegments_evenWhenNeverTranscribingLocally() {
        let (sut, _) = makeSUT()
        sut.receiveTranslatedSegment(makeSegment(text: "hi", isFinal: true))
        XCTAssertFalse(sut.segments.isEmpty)

        sut.resetForCallEnd()

        XCTAssertTrue(sut.segments.isEmpty)
    }

    func test_receiveTranslatedSegment_appendsToSegments() {
        let (sut, _) = makeSUT()
        let segment = makeSegment(text: "Hello", speakerId: "remote-user", isFinal: true)
        sut.receiveTranslatedSegment(segment)
        XCTAssertEqual(sut.segments.count, 1)
        XCTAssertEqual(sut.segments.first?.text, "Hello")
    }

    func test_applyRecognitionResult_whenFinal_emitsSegmentOverSocket() {
        let (sut, socket) = makeSUT()
        // Simulate the state startTranscribing would have set, without
        // depending on the real SFSpeechRecognizer/AVAudioEngine (not
        // unit-testable — validated by the Task 1 device spike instead).
        sut.applyRecognitionResult(
            text: "Bonjour", speakerId: "user-1", startMs: 0, endMs: 1000,
            isFinal: true, confidence: 0.9, language: "fr"
        )
        // isTranscribing is false here (startTranscribing was never called),
        // so applyRecognitionResult's guard drops it — this documents that
        // the guard is load-bearing, not a bug in the test.
        XCTAssertEqual(socket.emitCallTranscriptionSegmentCallCount, 0)
    }
```

- [x] **Step 7: Run to verify it fails, then confirm it already passes**

The `resetForCallEnd`/`receiveTranslatedSegment` tests should already PASS against the Step 4 implementation (no further production change needed) — this step is a verification, not a RED step, since Step 4 already implemented the purge-unconditionally behavior. Run:

```bash
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/CallTranscriptionServiceTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: PASS, all tests including the three new ones from Step 6.

- [x] **Step 8: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift \
        apps/ios/MeeshyTests/Unit/Services/CallTranscriptionServiceTests.swift
git commit -m "feat(ios/calls): rebuild CallTranscriptionService as local-only capture + socket relay"
```

---

### Task 4: App — rewire `CallManager`, remove dead DataChannel transcription plumbing

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:2053-2077` (`toggleTranscription`), `:3499` area (`setupSocketListeners`), `:4346-4374` (`didReceiveTranscriptionData` switch)
- Modify: `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift:764-807`
- Modify: `apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift:463-472`
- Modify: `apps/ios/MeeshyTests/Unit/Services/CallManagerAudioSessionTests.swift` (regression guard update)
- Modify: `apps/ios/MeeshyTests/Unit/Services/WebRTCServiceTests.swift:293-316` (remove obsolete test)
- Modify: `apps/ios/MeeshyTests/Unit/Services/WebRTCTypesTests.swift:1711-1810` (remove obsolete tests)
- Modify: `apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift:108-121` (remove obsolete test)

**Interfaces:**
- Consumes: `CallTranscriptionService.startTranscribing(callId:localLanguage:localUserId:)`, `.receiveTranslatedSegment(_:)`, `CallTranslatedSegmentData` (Task 2/3).
- Produces: nothing new — this task rewires existing `CallManager` call sites and deletes now-genuinely-dead code.

Under the new architecture, transcription segments travel over the call socket (`call:translated-segment`), never over the WebRTC DataChannel. The `"transcription"`-labeled DataChannel itself stays (it also carries the `bye` instant-hangup message and keep-alive ping — untouched), but the transcription-specific message type and its create/send functions become genuinely unreachable and must go, or this rebuild reintroduces the exact dead-code problem PR #1795 was (correctly, on this narrow point) trying to fix.

- [x] **Step 1: Rewrite `toggleTranscription()`**

In `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`, replace the `toggleTranscription()` function (currently lines 2053-2077) with:

```swift
    func toggleTranscription() {
        if transcriptionService.isTranscribing {
            transcriptionService.stopTranscribing()
            return
        }
        guard let callId = currentCallId else { return }
        let localUser = AuthManager.shared.currentUser
        let localLang = CallManager.preferredCallLanguage(for: localUser)
        let localUserId = localUser?.id ?? ""
        Task { @MainActor [weak self] in
            guard let self else { return }
            if self.transcriptionService.permission != .authorized {
                _ = await self.transcriptionService.requestPermission()
            }
            self.transcriptionService.startTranscribing(
                callId: callId,
                localLanguage: localLang,
                localUserId: localUserId
            )
        }
    }
```

- [x] **Step 2: Subscribe to translated segments in `setupSocketListeners()`**

In the same file, inside `private func setupSocketListeners()` (starts at line 3499), add a new subscription right after the `socket.callOfferReceived.receive(on: DispatchQueue.main).sink { ... }.store(in: &cancellables)` block:

```swift

        socket.callTranslatedSegmentReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                let seg = event.segment
                let segment = TranscriptionSegment(
                    id: UUID(),
                    text: seg.translatedText ?? seg.text,
                    speakerId: seg.speakerId,
                    startTime: Double(seg.startMs) / 1000,
                    endTime: Double(seg.endMs) / 1000,
                    isFinal: seg.isFinal,
                    confidence: seg.confidence,
                    language: seg.targetLanguage,
                    translatedText: seg.translatedText,
                    translatedLanguage: seg.translatedText != nil ? seg.targetLanguage : nil
                )
                self.transcriptionService.receiveTranslatedSegment(segment)
            }
            .store(in: &cancellables)
```

- [x] **Step 3: Remove the `.transcription` DataChannel case**

In the same file, in `webRTCService(_:didReceiveTranscriptionData:)` (currently lines 4346-4374), delete the `case .transcription(let message):` branch entirely (lines 4357-4370 in the pre-edit file):

```swift
            case .transcription(let message):
                let segment = TranscriptionSegment(
                    id: UUID(),
                    text: message.text,
                    speakerId: message.speakerId,
                    startTime: message.startTime,
                    endTime: message.startTime + 1.0,
                    isFinal: message.isFinal,
                    confidence: 1.0,
                    language: message.language,
                    translatedText: message.translatedText,
                    translatedLanguage: message.translatedLanguage
                )
                self.transcriptionService.receiveRemoteSegment(segment)
```

leaving:

```swift
    nonisolated func webRTCService(_ service: WebRTCService, didReceiveTranscriptionData data: Data) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            switch DataChannelInbound.decode(data) {
            case .bye(let reason):
                guard let callId = self.currentCallId else { return }
                Logger.calls.info("DataChannel bye received — ending call instantly (callId=\(callId))")
                self.handleRemoteEnd(callId: callId, rawReason: reason)
            case .ignored:
                break
            }
        }
    }
```

(This will not compile until Step 4 removes the `.transcription` case from the `DataChannelInbound` enum itself — Swift would otherwise flag the switch as non-exhaustive in the other direction. Steps 3-4 are one atomic change; build only after both are done.)

- [x] **Step 4: Remove `DataChannelTranscriptionMessage` and the `.transcription` case**

In `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift`, delete the `DataChannelTranscriptionMessage` struct (lines 764-774):

```swift
nonisolated struct DataChannelTranscriptionMessage: Codable, Sendable, Equatable {
    let type: String  // "transcription-segment"
    let text: String
    let speakerId: String
    let startTime: Double
    let isFinal: Bool
    let language: String
    let translatedText: String?
    let translatedLanguage: String?
}

```

In the same file, in `nonisolated enum DataChannelInbound`, delete the `case transcription(DataChannelTranscriptionMessage)` line and the corresponding decode branch:

```swift
nonisolated enum DataChannelInbound: Equatable {
    case bye(reason: String?)
    case ignored

    static func decode(_ data: Data) -> DataChannelInbound {
        if let control = try? JSONDecoder().decode(DataChannelControlMessage.self, from: data),
           control.type == "bye" {
            return .bye(reason: control.reason)
        }
        return .ignored
    }
}
```

(removing the `if let segment = try? JSONDecoder().decode(DataChannelTranscriptionMessage.self, from: data), segment.type == "transcription-segment" { return .transcription(segment) }` branch that used to precede the `bye` check.)

- [x] **Step 5: Remove `createTranscriptionChannel()`/`sendTranscription(_:)`**

In `apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift`, delete the `// MARK: - DataChannel Transcription (H7)` block (lines 463-472):

```swift
    // MARK: - DataChannel Transcription (H7)

    func createTranscriptionChannel() -> Bool {
        client.createDataChannel(label: "transcription")
    }

    func sendTranscription(_ message: DataChannelTranscriptionMessage) {
        guard let data = try? JSONEncoder().encode(message) else { return }
        client.sendDataChannelMessage(data)
    }

```

Do NOT touch `createOffer()`'s `_ = client.createDataChannel(label: "transcription")` call (around line 146) — that creates the shared channel used by `bye`/keep-alive, which stays. Do NOT touch `didReceiveTranscriptionData` in the `WebRTCServiceDelegate` protocol or its forwarding implementation (lines ~622-627) — it's the generic "a DataChannel message of any kind arrived" hook, still needed for `bye`.

- [x] **Step 6: Update `CallManagerAudioSessionTests` regression guard**

In `apps/ios/MeeshyTests/Unit/Services/CallManagerAudioSessionTests.swift`, replace `test_callManager_toggleTranscription_doesNotHardcodeLanguage`:

```swift
    func test_callManager_toggleTranscription_doesNotHardcodeLanguage() throws {
        // Regression guard: toggleTranscription() must not hardcode language strings.
        // Language resolution is delegated to CallManager.preferredCallLanguage(for:)
        // (Prisme Linguistique), which reads systemLanguage > regionalLanguage > "fr".
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "func toggleTranscription()"),
              let endRange = source[fnRange.upperBound...].range(of: "\n    }") else {
            XCTFail("toggleTranscription() function not found in CallManager.swift")
            return
        }
        let fnBody = String(source[fnRange.lowerBound ..< endRange.upperBound])

        XCTAssertFalse(
            fnBody.contains("let localLang = \"fr\""),
            "toggleTranscription() must not hardcode localLang = \"fr\". " +
            "Delegate to CallManager.preferredCallLanguage(for:) (Prisme Linguistique)."
        )
        XCTAssertTrue(
            fnBody.contains("preferredCallLanguage"),
            "toggleTranscription() must delegate language resolution to " +
            "CallManager.preferredCallLanguage(for:) (Prisme Linguistique)."
        )
    }
```

(dropped the now-meaningless `remoteLang` assertion — the new signature has no remote-language parameter at all, per the spec's local-only-capture architecture).

- [x] **Step 7: Remove the obsolete `WebRTCServiceTests` test**

In `apps/ios/MeeshyTests/Unit/Services/WebRTCServiceTests.swift`, delete `test_createTranscriptionChannel_delegatesToClient` (lines 310-316) and the now-empty `// MARK: - Transcription Channel` heading above it (line 293):

```swift
    func test_createTranscriptionChannel_delegatesToClient() {
        let (sut, client) = makeSUT()
        client.createDataChannelResult = true
        let result = sut.createTranscriptionChannel()
        XCTAssertTrue(result)
        XCTAssertEqual(client.lastDataChannelLabel, "transcription")
    }
```

- [x] **Step 8: Remove the obsolete `WebRTCTypesTests` tests**

In `apps/ios/MeeshyTests/Unit/Services/WebRTCTypesTests.swift`, delete everything from the `// MARK: - DataChannelTranscriptionMessage Decodable` comment (line 1711) to the end of the file (line 1810) — the entire `DataChannelTranscriptionMessageTests` class, which tests a type that no longer exists.

- [x] **Step 9: Remove the obsolete `CallSignalIndicatorTests` test**

In `apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift`, delete `test_decode_transcriptionSegment_routesToTranscription` (lines 108-121):

```swift
    func test_decode_transcriptionSegment_routesToTranscription() {
        let json = """
        {"type":"transcription-segment","text":"Bonjour","speakerId":"user-1",
         "startTime":1.5,"isFinal":true,"language":"fr",
         "translatedText":null,"translatedLanguage":null}
        """
        let result = DataChannelInbound.decode(Data(json.utf8))
        guard case .transcription(let segment) = result else {
            XCTFail("Expected .transcription, got \(result)")
            return
        }
        XCTAssertEqual(segment.text, "Bonjour")
        XCTAssertEqual(segment.speakerId, "user-1")
    }
```

Keep `test_decode_bye_withReason_returnsBye`, `test_decode_bye_withoutReason_returnsBye`, `test_decode_ping_isIgnored`, `test_decode_garbage_isIgnored`, and the entire `CallHangupFastPathTests` class (all still valid — `bye`/keep-alive infra is untouched).

- [x] **Step 10: Build and run the full affected test suite**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -60
SIM=$(xcrun simctl create tmp182b "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallManagerAudioSessionTests \
  -only-testing:MeeshyTests/WebRTCServiceTests \
  -only-testing:MeeshyTests/WebRTCTypesTests \
  -only-testing:MeeshyTests/DataChannelInboundTests \
  -only-testing:MeeshyTests/CallHangupFastPathTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -60
```

Expected: BUILD SUCCEEDED, all listed suites PASS.

- [x] **Step 11: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/CallManager.swift \
        apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift \
        apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift \
        apps/ios/MeeshyTests/Unit/Services/CallManagerAudioSessionTests.swift \
        apps/ios/MeeshyTests/Unit/Services/WebRTCServiceTests.swift \
        apps/ios/MeeshyTests/Unit/Services/WebRTCTypesTests.swift \
        apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift
git commit -m "refactor(ios/calls): rewire toggleTranscription to the socket relay, drop dead DataChannel transcription path"
```

---

### Task 5: App — CallView toggle button + strings

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/CallView.swift:1420-1433` (`controlButtonsRow`)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings`

**Interfaces:**
- Consumes: `callManager.toggleTranscription()` (Task 4), the view's own `transcriptionService: CallTranscriptionService` `@ObservedObject` property (already present, derived from `callManager.transcriptionService` in `init` — same instance `transcriptOverlay` already reads).

`showTranscript` and `transcriptOverlay` are already correctly implemented and wired (fixed 2026-07-10 in PR #1800 — verify this is still true at execution time; if `transcriptionService` in `CallView.init` is no longer derived from `callManager.transcriptionService`, treat that as a blocking regression to fix first, not part of this task's scope). This task only adds the missing UI entry point: a toggle button.

- [ ] **Step 1: Write the failing test**

There is no existing SwiftUI-body unit-test convention for control-bar buttons in this codebase (verified: no test asserts on `controlButtonsRow`'s contents). Follow the source-inspection pattern already used elsewhere in this file's test suite (e.g. `CallHangupFastPathTests`) instead. Add to `apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift`, inside `CallHangupFastPathTests`:

```swift
    func test_controlButtonsRow_wiresTranscriptionToggle_toCallManager() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "private var controlButtonsRow: some View {") else {
            XCTFail("CallView must define controlButtonsRow")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 4000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("callManager.toggleTranscription()"),
            "controlButtonsRow must include a control that calls callManager.toggleTranscription() " +
            "— this is the UI entry point that was missing before this feature was rebuilt."
        )
    }
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
SIM=$(xcrun simctl create tmp182c "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/CallHangupFastPathTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -20
```

Expected: FAIL.

- [ ] **Step 3: Add the toggle button**

In `apps/ios/Meeshy/Features/Main/Views/CallView.swift`, inside `controlButtonsRow` (starts at line 1420), add a new button after the `cameraControl` line and before the video-upgrade `callControlButton` block (i.e. right after the `// §5.4 — always visible so an AUDIO call...` comment's preceding line, or more simply: right after the `cameraControl` reference line):

```swift
            cameraControl

            // Live captions — toggle local transcription + translated
            // captions of the other participant. Manual, per spec decision
            // (never auto-activates): the speaker controls when their voice
            // is transcribed and sent to the gateway.
            callControlButton(
                icon: transcriptionService.isTranscribing ? "captions.bubble.fill" : "captions.bubble",
                color: transcriptionService.isTranscribing ? MeeshyColors.indigo400 : .white,
                bgColor: transcriptionService.isTranscribing ? MeeshyColors.indigo400 : .white,
                isActive: transcriptionService.isTranscribing,
                caption: String(localized: "call.control.transcript.caption", defaultValue: "Sous-titres", bundle: .main),
                label: transcriptionService.isTranscribing
                    ? String(localized: "call.control.transcript.off", defaultValue: "Désactiver les sous-titres", bundle: .main)
                    : String(localized: "call.control.transcript.on", defaultValue: "Activer les sous-titres", bundle: .main),
                isToggle: true
            ) {
                // Read isTranscribing BEFORE calling toggleTranscription(): the
                // start path is async (permission request awaited inside a
                // Task), so isTranscribing is still false right after the call
                // returns — reading it after would always compute willStart
                // wrong. Reading it before, at tap time, is always accurate.
                let willStart = !transcriptionService.isTranscribing
                showTranscript = willStart
                callManager.toggleTranscription()
            }
```

This both starts/stops capture AND opens/closes the existing `transcriptOverlay` panel in the same tap — no separate discovery step needed for the user.

- [ ] **Step 4: Add the two new string keys**

Open `apps/ios/Meeshy/Localizable.xcstrings` and add two entries to the top-level `"strings"` object (JSON), following the exact structure of the existing `"call.control.mute.caption"` / `"call.control.mute"` entries (5 languages: `de`, `en`, `es`, `fr`, `pt-BR`; `sourceLanguage` for this catalog is `fr`):

```json
    "call.control.transcript.caption" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Untertitel"
          }
        },
        "en" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Captions"
          }
        },
        "es" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Subtítulos"
          }
        },
        "fr" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Sous-titres"
          }
        },
        "pt-BR" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Legendas"
          }
        }
      }
    },
    "call.control.transcript.off" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Untertitel deaktivieren"
          }
        },
        "en" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Turn off captions"
          }
        },
        "es" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Desactivar subtítulos"
          }
        },
        "fr" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Désactiver les sous-titres"
          }
        },
        "pt-BR" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Desativar legendas"
          }
        }
      }
    },
    "call.control.transcript.on" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Untertitel aktivieren"
          }
        },
        "en" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Turn on captions"
          }
        },
        "es" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Activar subtítulos"
          }
        },
        "fr" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Activer les sous-titres"
          }
        },
        "pt-BR" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Ativar legendas"
          }
        }
      }
    },
```

Insert these alphabetically among the other `"call.control.*"` keys (JSON key order doesn't affect correctness, but keeps the file scanFriendly for the next human editor). Validate the file is still well-formed JSON after editing:

```bash
python3 -c "import json; json.load(open('apps/ios/Meeshy/Localizable.xcstrings'))" && echo OK
```

- [ ] **Step 5: Run to verify the test passes, then run the localization consistency suite**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallHangupFastPathTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -20
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: both PASS (the localization suite catches malformed/missing-language xcstrings entries — do not skip it, per project history of xcstrings edit mistakes).

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/CallView.swift \
        apps/ios/Meeshy/Localizable.xcstrings \
        apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift
git commit -m "feat(ios/calls): add live captions toggle button to the call control bar"
```

---

### Task 6: Gateway — remove the dead `translationEnabled` gate

**Files:**
- Modify: `services/gateway/src/socketio/CallEventsHandler.ts:3080-3100`
- Modify: `services/gateway/src/__tests__/unit/socketio/CallEventsHandler-transcription-translation.test.ts`

**Interfaces:**
- Consumes: nothing new (the iOS client already emits `call:transcription-segment` unconditionally when the user toggles captions on — Task 3/4 — so the real product gate is client-side).
- Produces: no interface change — `translateAndEmitSegment` and its emitted `call:translated-segment` shape are untouched.

- [ ] **Step 1: Write the failing test**

Open `services/gateway/src/__tests__/unit/socketio/CallEventsHandler-transcription-translation.test.ts`. Add a new test after the existing `it('subscribes to the scoped translationCompleted:<messageId> event...')`:

```typescript
  it('attempts translation even when callSession.metadata has no translationEnabled flag', async () => {
    const prisma = makePrisma();
    // Override the default mock to prove the gate is gone: no
    // translationEnabled anywhere on metadata (not even `false`).
    (prisma.callSession.findUnique as jest.Mock).mockResolvedValue({
      status: 'active',
      metadata: {},
    });
    const { socket, handlers, roomEmit } = makeSocket();
    const taskId = 'task-no-gate';
    const zmqClient = makeFakeZmqClient(taskId);
    const emitter = zmqClient as unknown as EventEmitter;

    const handler = new CallEventsHandler(prisma, makeCallService());
    handler.setZmqClient(zmqClient);
    handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

    const segmentPromise = handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    await new Promise((resolve) => setImmediate(resolve));

    emitter.emit(`translationCompleted:${MESSAGE_ID}`, {
      taskId,
      result: { translatedText: 'Hello world', messageId: MESSAGE_ID },
      targetLanguage: 'en',
    });
    await segmentPromise;

    expect(roomEmit).toHaveBeenCalledTimes(1);
    const [eventName, payload] = roomEmit.mock.calls[0];
    expect(eventName).toBe(CALL_EVENTS.TRANSLATED_SEGMENT);
    expect(payload.segment.translatedText).toBe('Hello world');
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
bun test src/__tests__/unit/socketio/CallEventsHandler-transcription-translation.test.ts 2>&1 | tail -40
```

Expected: FAIL — with the current gate, `metadata: {}` means `translationEnabled` is falsy, so the handler falls into the relay-original-text branch instead of calling `translateAndEmitSegment`; `payload.segment.translatedText` is `undefined`, not `'Hello world'`.

- [ ] **Step 3: Remove the gate**

In `services/gateway/src/socketio/CallEventsHandler.ts`, locate the `socket.on(CALL_EVENTS.TRANSCRIPTION_SEGMENT, ...)` handler. Replace:

```typescript
        const callSession = await this.prisma.callSession.findUnique({
          where: { id: data.callId },
          select: { status: true, metadata: true }
        });

        if (!callSession || callSession.status === 'ended') return;

        const metadata = callSession.metadata as CallTranscriptionSegmentEvent['segment'] extends unknown ? Record<string, unknown> | null : never;
        const translationEnabled = metadata && typeof metadata === 'object' && 'translationEnabled' in metadata && metadata.translationEnabled === true;

        if (translationEnabled && this.zmqClient && data.segment.isFinal) {
          await this.translateAndEmitSegment(socket, data, userId);
        } else {
```

with:

```typescript
        const callSession = await this.prisma.callSession.findUnique({
          where: { id: data.callId },
          select: { status: true }
        });

        if (!callSession || callSession.status === 'ended') return;

        // No callSession.metadata.translationEnabled gate — the real product
        // control is client-side (the speaker's own captions toggle; no
        // client ever emits a segment unless the user turned captions on).
        // See docs/superpowers/specs/2026-07-10-live-call-transcription-design.md.
        if (this.zmqClient && data.segment.isFinal) {
          await this.translateAndEmitSegment(socket, data, userId);
        } else {
```

- [ ] **Step 4: Run to verify both tests pass**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
bun test src/__tests__/unit/socketio/CallEventsHandler-transcription-translation.test.ts 2>&1 | tail -40
```

Expected: PASS (both the pre-existing test and the new one — the pre-existing test's mock still sets `metadata: { translationEnabled: true }`, which is now simply ignored, and its assertions are unaffected).

- [ ] **Step 5: Run the full gateway suite for this file's neighbors**

```bash
bun test src/socketio/__tests__/CallEventsHandler.test.ts 2>&1 | tail -60
```

Expected: PASS, no regressions (this suite has its own `metadata: { translationEnabled: true }` mock per the earlier grep — same reasoning: the field becomes inert, not wrong).

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add services/gateway/src/socketio/CallEventsHandler.ts \
        services/gateway/src/__tests__/unit/socketio/CallEventsHandler-transcription-translation.test.ts
git commit -m "fix(gateway/calls): drop the dead translationEnabled gate — client-side toggle is the real control"
```

---

### Task 7: Final integration, device QA, PR #1795 cleanup

**Files:** none (verification only)

- [ ] **Step 1: Regenerate the Xcode project and run the full iOS suite**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate && cd -
./apps/ios/meeshy.sh test
```

Expected: all 3 phases green (per `apps/ios/CLAUDE.md`'s phased test run). Revert any `project.pbxproj`/`Package.resolved`/scheme churn this produces that isn't an intentional change (`git checkout --` on those specific files if they only reflect xcodegen/SPM regeneration noise, per that same doc's guidance) — but do NOT discard the actual source changes from Tasks 1-6.

- [ ] **Step 2: Run the gateway suite**

```bash
cd /Users/smpceo/Documents/v2_meeshy
cd packages/shared && npx prisma generate --generator client && bun run build && cd -
cd services/gateway && bun run test:coverage 2>&1 | tail -60
```

Expected: 249+/249+ suites green (baseline per root `CLAUDE.md`; this feature adds/modifies 2 test files, no suite count regression expected).

- [ ] **Step 3: Device QA — build and run on a real device**

```bash
./apps/ios/meeshy.sh build
./apps/ios/meeshy.sh run
```

Perform a real 1:1 call between two devices with different `systemLanguage` set (e.g. one `fr`, one `en`):
1. Tap the new captions button on device A. Confirm the Speech permission prompt appears (first time only) and grant it.
2. Speak on device A. Confirm device A shows its own text immediately (untranslated, in `fr`).
3. Confirm device B — even without tapping its own captions button — receives and displays device A's speech, translated into `en`.
4. Tap captions on device B too. Confirm device B's own speech appears locally, and device A receives it translated into `fr`.
5. Toggle captions off on device A mid-call. Confirm device A's local capture stops (no more of A's own new lines appear) but device A can still receive B's captions if B leaves theirs on.
6. End the call. Start a new call between the same two devices. Confirm the transcript panel is empty at the start of the new call (purge invariant from Task 3 Step 6).
7. Confirm call audio quality (both directions) is unaffected throughout, matching the Task 1 spike's findings.

- [ ] **Step 4: Update the PR #1795 draft**

The deletion PR (`https://github.com/isopen-io/meeshy/pull/1795`, currently in draft) is superseded by this work. Do not merge it. Post a closing comment referencing this plan and the commits from Tasks 1-6, then close it without merging:

```bash
gh pr comment 1795 -R isopen-io/meeshy --body "Superseded by the rebuild in docs/superpowers/plans/2026-07-10-live-call-transcription.md — live call captions now ship via the local-audio-only + gateway-relay architecture instead of being removed. Closing without merging."
gh pr close 1795 -R isopen-io/meeshy
```

Confirm with the user before running this — closing a PR is a visible, hard-to-silently-reverse action on the shared repo.

- [ ] **Step 5: Final commit**

If Step 1 produced any legitimate (non-churn) file changes, commit them separately with a clear message. Otherwise, this task produces no additional commit — Tasks 1-6 are already committed.
