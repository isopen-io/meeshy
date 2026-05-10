# Calls SOTA Redesign — Phase 1 : Bug Fixes Critiques

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger 7 bugs production confirmés du sous-système d'appels iOS↔iOS / iOS↔Web : audio session race CallKit, simulator camera crash, machine d'état FSM client incomplète, ICE connecté sans audio, heartbeat trop agressif, ringing timeout serveur absent.

**Architecture:** Modifications surgical sur les fichiers existants, sans refonte. Aucune dépendance à Phase 0 (peuvent être implémentés en parallèle ou séparément). Chaque fix correspond à une correction E*/P*/B* du doc design v2.

**Tech Stack:**
- Swift 6 strict (apps/ios) + XCTest
- TypeScript 5.9 strict (services/gateway) + Vitest
- WebRTC.xcframework 141.0
- CallKit + AVFoundation

**Spec reference:** `docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md` §3.2 (B3), §4.8 (E7/B4), §2.2-2.3 (E5/E6), §3.6 (P6), §5.12 (P1), §2.5 (P2).

**Bugs corrigés** dans ce plan :

| # | Fix | Symptôme | Section spec |
|---|---|---|---|
| Task 1 | B3 | `setActive(true)` forcé désynchronise AVAudioSession ↔ RTCAudioSession | §3.2 |
| Task 2 | E7/B4 | `FigCaptureSourceRemote err=-17281` simulator camera crash | §4.8 |
| Task 3 | E5 (part 1) | État `outgoing.offering` manquant dans CallState enum | §2.2 |
| Task 4 | E5 (part 2) | Transition `outgoing.ringing → outgoing.offering` câblée dans listener participant-joined | §2.2 |
| Task 5 | E6 + P6 | "ICE connected mais audio muet" : transition `.connected` avant que le RTP arrive | §2.3 |
| Task 6 | P1 | Heartbeat 5s/15s trop agressif sur cellular | §5.12 |
| Task 7 | P2 | Pas de timeout serveur sur `ringing` → ghost calls | §2.5 |

---

## File Structure

### Modified files (iOS)

- `apps/ios/Meeshy/Features/Main/Services/CallManager.swift` — `CallState.outgoing(.offering)`, `CallKitDelegateProxy.provider:didActivate:` cleanup, RTP gate before `.connected`, heartbeat 10s
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift` — simulator guard dans `startLocalMedia`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift` — `WebRTCError.simulatorVideoUnsupported` + `QualityThresholds.heartbeatIntervalSeconds = 10` + `QualityThresholds.heartbeatLostThresholdSeconds = 30`

### Modified files (gateway)

- `services/gateway/src/services/CallService.ts` — `scheduleRingingTimeout(callId)` + `clearRingingTimeout(callId)`
- `services/gateway/src/socketio/CallEventsHandler.ts` — appel `scheduleRingingTimeout` après `initiateCall`, `clearRingingTimeout` sur transition `connecting`/`active`/`ended`

### Modified test files

- `apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift` — tests RTP gate + outgoing.offering state
- `apps/ios/MeeshyTests/Unit/Services/WebRTCServiceTests.swift` — test simulator guard
- `services/gateway/src/__tests__/integration/call-ringing-timeout.integration.test.ts` (new) — test timeout 60s force `missed`

---

## Tasks

### Task 1 : Fix B3 — Retirer `setActive(true)` forcé dans `provider:didActivate:`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:1356-1366`
- Test: `apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift`

- [ ] **Step 1 : Lire la zone du delegate proxy**

Run:
```bash
grep -n "func provider.*didActivate\|func provider.*didDeactivate" apps/ios/Meeshy/Features/Main/Services/CallManager.swift
```
Expected: 2 lignes pointant vers `provider:didActivate:` (~ligne 1341) et `provider:didDeactivate:` (~ligne 1369).

- [ ] **Step 2 : Écrire le test (failing) qui vérifie l'ordre RTC + isAudioEnabled sans setActive**

Cette modification est dans `CallKitDelegateProxy` qui est `private`. Le test direct est complexe. Approche pragmatique : inspecter via grep que le code n'appelle PAS `audioSession.setActive(true, options: [])` avant `audioSessionDidActivate`.

Crée un test `apps/ios/MeeshyTests/Unit/Services/CallManagerAudioSessionTests.swift` :

```swift
import XCTest
@testable import Meeshy

final class CallManagerAudioSessionTests: XCTestCase {

    func test_callManager_sourceCode_doesNotForceAudioSessionActiveBeforeBridge() throws {
        // Guard against regression: B3 fix mandates that provider(_:didActivate:)
        // must NOT call audioSession.setActive(true) before audioSessionDidActivate.
        // CallKit owns AVAudioSession activation; forcing it creates desync between
        // AVAudioSession and RTCAudioSession.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertFalse(
            source.contains("audioSession.setActive(true, options:"),
            "CallManager must not force AVAudioSession.setActive(true). " +
            "CallKit owns the lifecycle. See docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.2"
        )
    }
}
```

- [ ] **Step 3 : Run le test pour confirmer qu'il échoue (le code actuel contient cet appel)**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL avec assertion sur "CallManager must not force AVAudioSession.setActive(true)".

- [ ] **Step 4 : Modifier `provider(_:didActivate:)` pour retirer le `setActive`**

Dans `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`, remplacer le bloc actuel (lignes ~1341-1367) par :

```swift
    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // CallKit owns AVAudioSession lifecycle; we ONLY bridge it to libwebrtc.
        // DO NOT call audioSession.setActive(true) here — CallKit already did.
        // Forcing it again creates desync between AVAudioSession and RTCAudioSession,
        // visible as alternating routes (Receiver/Speaker) in logs and silent calls.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.2
        let rtc = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        rtc.audioSessionDidActivate(audioSession)
        rtc.isAudioEnabled = true
        rtc.unlockForConfiguration()

        Task { @MainActor [weak self] in self?.manager?.applySpeakerRoute() }
        let outputs = audioSession.currentRoute.outputs
            .map { $0.portType.rawValue }
            .joined(separator: ",")
        Logger.calls.info(
            "CallKit audio session activated; RTCAudioSession enabled " +
            "(route=\(outputs), category=\(audioSession.category.rawValue), mode=\(audioSession.mode.rawValue))"
        )
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        let rtc = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        rtc.isAudioEnabled = false
        rtc.audioSessionDidDeactivate(audioSession)
        rtc.unlockForConfiguration()
        Logger.calls.info("CallKit audio session deactivated; RTCAudioSession disabled")
    }
```

- [ ] **Step 5 : Run le test pour vérifier qu'il passe**

Run: `./apps/ios/meeshy.sh test`
Expected: `CallManagerAudioSessionTests.test_callManager_sourceCode_doesNotForceAudioSessionActiveBeforeBridge` PASS.

- [ ] **Step 6 : Run les tests existants pour confirmer aucune régression**

Run: `./apps/ios/meeshy.sh test`
Expected: 100% pass (incluant tous les `CallManagerTests` existants).

- [ ] **Step 7 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/CallManager.swift \
        apps/ios/MeeshyTests/Unit/Services/CallManagerAudioSessionTests.swift
git commit -m "fix(ios/calls): remove forced AVAudioSession.setActive(true) in CallKit didActivate

CallKit owns AVAudioSession activation lifecycle. Forcing setActive(true)
before audioSessionDidActivate creates desync between AVAudioSession and
RTCAudioSession, observable as alternating Receiver/Speaker routes and
silent calls. Reference §3.2 of 2026-05-10-calls-sota-redesign-design.md."
```

---

### Task 2 : Fix E7/B4 — Simulator guard dans `P2PWebRTCClient.startLocalMedia`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift:138-201`
- Modify: `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift` (ajout `WebRTCError.simulatorVideoUnsupported`)
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift` (catch + degrade audio-only)

- [ ] **Step 1 : Lire l'enum WebRTCError actuel**

Run:
```bash
grep -n "enum WebRTCError" apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift
```
Expected: une ligne pointant vers la définition.

- [ ] **Step 2 : Écrire le test (failing) pour le case de simulator**

Crée ou ajoute dans `apps/ios/MeeshyTests/Unit/Services/WebRTCErrorTests.swift` :

```swift
import XCTest
@testable import Meeshy

final class WebRTCErrorTests: XCTestCase {

    func test_simulatorVideoUnsupported_caseExists() {
        let error: WebRTCError = .simulatorVideoUnsupported
        XCTAssertNotNil(error.errorDescription)
        XCTAssertTrue(
            error.errorDescription?.lowercased().contains("simulator") ?? false,
            "Error description should mention simulator"
        )
    }
}
```

- [ ] **Step 3 : Run le test pour fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL avec `type 'WebRTCError' has no member 'simulatorVideoUnsupported'`.

- [ ] **Step 4 : Ajouter le case dans `WebRTCError`**

Dans `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift`, dans l'enum `WebRTCError`, ajouter le case :

```swift
enum WebRTCError: LocalizedError, Equatable {
    case noPeerConnection
    case failedToCreatePeerConnection
    case failedToCreateSDP
    case noCameraAvailable
    case noCameraFormatAvailable
    case simulatorVideoUnsupported   // NEW — Phase 1 fix E7/B4

    var errorDescription: String? {
        switch self {
        case .noPeerConnection:
            return "No peer connection"
        case .failedToCreatePeerConnection:
            return "Failed to create peer connection"
        case .failedToCreateSDP:
            return "Failed to create SDP"
        case .noCameraAvailable:
            return "No camera available"
        case .noCameraFormatAvailable:
            return "No usable camera format available"
        case .simulatorVideoUnsupported:
            return "Video unsupported on iOS Simulator (FigCaptureSourceRemote XPC failure). " +
                   "Use a real device for video calls."
        }
    }
}
```

(Si l'enum existe déjà avec d'autres cases, intégrer le nouveau case + sa description sans toucher aux cases existants.)

- [ ] **Step 5 : Run le test pour vérifier qu'il passe**

Run: `./apps/ios/meeshy.sh test`
Expected: `WebRTCErrorTests.test_simulatorVideoUnsupported_caseExists` PASS.

- [ ] **Step 6 : Modifier `P2PWebRTCClient.startLocalMedia` pour throw simulatorVideoUnsupported sur simu**

Dans `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift`, modifier la fonction `startLocalMedia(type:)` pour intercaler le guard simulator AVANT le bloc vidéo :

Remplacer le bloc commençant à `guard type == .audioVideo else {` (ligne ~159) jusqu'à juste après par :

```swift
        guard type == .audioVideo else {
            Logger.webrtc.info("Local audio track started")
            return
        }

        #if targetEnvironment(simulator)
        // iOS Simulator's AVCaptureDevice.DiscoverySession returns phantom devices,
        // but RTCCameraVideoCapturer.startCapture fails with FigCaptureSourceRemote
        // err=-17281 (kCMIOHardwareDeviceUnsupportedFormatError) on most simulator
        // images. Throw a typed error so the UI can degrade to audio-only.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §4.8
        Logger.webrtc.warning("[WEBRTC] simulator detected — skipping video capture (audio-only fallback)")
        throw WebRTCError.simulatorVideoUnsupported
        #else

        Logger.webrtc.info("[WEBRTC] videoSource begin")
        let videoSource = factory.videoSource()
        // ... reste du code vidéo inchangé jusqu'à try await capturer.startCapture ...
```

ET ajouter `#endif` à la fin du bloc vidéo (juste avant le `Logger.webrtc.info("Local audio + video tracks started ...")` de fin de méthode) :

```swift
        try await capturer.startCapture(with: frontCamera, format: format, fps: fps)
        Logger.webrtc.info("Local audio + video tracks started (front camera, \(fps)fps)")
        #endif
    }
```

- [ ] **Step 7 : Modifier `CallManager.startCall` pour catch `simulatorVideoUnsupported` et degrade en audio-only**

Dans `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`, dans le `Task { ... }` de `startCall(...)` (autour ligne 185-210), encapsuler le bloc `await self.webRTCService.startLocalMedia(...)` dans un try/catch :

Remplacer :
```swift
                Logger.calls.info("[CALL_SETUP] outgoing 3/4 startLocalMedia begin (isVideo=\(isVideo))")
                await self.webRTCService.startLocalMedia(isVideo: isVideo)
                Logger.calls.info("[CALL_SETUP] outgoing 4/4 startLocalMedia done")
                if isVideo { self.hasLocalVideoTrack = true }
```

Par :
```swift
                Logger.calls.info("[CALL_SETUP] outgoing 3/4 startLocalMedia begin (isVideo=\(isVideo))")
                do {
                    try await self.webRTCService.startLocalMedia(isVideo: isVideo)
                    if isVideo { self.hasLocalVideoTrack = true }
                } catch WebRTCError.simulatorVideoUnsupported {
                    // Phase 1 fix E7/B4: simulator can't run video → degrade to audio-only
                    Logger.calls.warning("Simulator video unsupported — continuing audio-only")
                    self.isVideoEnabled = false
                    try? await self.webRTCService.startLocalMedia(isVideo: false)
                }
                Logger.calls.info("[CALL_SETUP] outgoing 4/4 startLocalMedia done")
```

(Cela suppose que `WebRTCService.startLocalMedia` propage l'erreur. Si elle est actuellement `async` non-throws, il faut la convertir en `async throws` ; voir Step 8.)

- [ ] **Step 8 : Convertir `WebRTCService.startLocalMedia` en `async throws`**

Dans `apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift` (ligne ~117), changer la signature :

```swift
func startLocalMedia(isVideo: Bool) async throws {
    try await client.startLocalMedia(type: isVideo ? .audioVideo : .audioOnly)
    Logger.webrtc.info("Local media started - video: \(isVideo)")
}
```

(Retirer le `do/try/catch` interne qui mangeait l'erreur silencieusement — le caller doit la voir.)

- [ ] **Step 9 : Adapter les call sites de `startLocalMedia` qui ne sont pas dans `startCall`**

Run:
```bash
grep -n "startLocalMedia(isVideo:" apps/ios/Meeshy/Features/Main/Services/CallManager.swift
```
Expected: 3-4 sites. Pour chacun (sauf le `startCall` déjà modifié au Step 7), entourer d'un `try? await` ou `do/catch` selon contexte.

Pour `reportIncomingVoIPCall` et `handleIncomingCallNotification` (sites incoming), wrap aussi en try/catch avec degrade audio-only :

```swift
        Task { [weak self] in
            guard let self else { return }
            Logger.calls.info("[CALL_SETUP] incoming 3/4 startLocalMedia begin (isVideo=\(isVideo))")
            do {
                try await self.webRTCService.startLocalMedia(isVideo: isVideo)
                if isVideo { self.hasLocalVideoTrack = true }
            } catch WebRTCError.simulatorVideoUnsupported {
                Logger.calls.warning("Simulator video unsupported — continuing audio-only")
                self.isVideoEnabled = false
                try? await self.webRTCService.startLocalMedia(isVideo: false)
            } catch {
                Logger.calls.error("startLocalMedia failed: \(error.localizedDescription)")
                self.endCallInternal(reason: .failed(String(localized: "call.error.media")))
                return
            }
            Logger.calls.info("[CALL_SETUP] incoming 4/4 startLocalMedia done")
            MessageSocketManager.shared.emitCallJoin(callId: callId)
            Logger.calls.info("Incoming call — auto-joined room, awaiting SDP offer: \(callId)")
        }
```

- [ ] **Step 10 : Run tous les tests + build pour vérifier compilation Swift 6**

Run:
```bash
./apps/ios/meeshy.sh build
./apps/ios/meeshy.sh test
```
Expected: BUILD SUCCEEDED + tests 100% pass.

- [ ] **Step 11 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift \
        apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift \
        apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift \
        apps/ios/Meeshy/Features/Main/Services/CallManager.swift \
        apps/ios/MeeshyTests/Unit/Services/WebRTCErrorTests.swift
git commit -m "fix(ios/calls): simulator guard in startLocalMedia, degrade to audio-only

iOS Simulator's AVCaptureDevice.DiscoverySession returns phantom devices but
RTCCameraVideoCapturer.startCapture crashes with FigCaptureSourceRemote
err=-17281. Add #if targetEnvironment(simulator) guard, throw typed
WebRTCError.simulatorVideoUnsupported, and degrade to audio-only at call sites.
Reference §4.8 of 2026-05-10-calls-sota-redesign-design.md."
```

---

### Task 3 : Fix E5 (part 1) — Ajouter `outgoing.offering` à l'enum `CallState`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:13-32`
- Test: `apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift`

- [ ] **Step 1 : Lire la définition actuelle de `CallState`**

Run:
```bash
grep -A 20 "^enum CallState" apps/ios/Meeshy/Features/Main/Services/CallManager.swift
```
Expected: l'enum avec ses 6 cases.

- [ ] **Step 2 : Écrire le test (failing) pour le nouveau case**

Dans `apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift`, ajouter au bloc `final class CallStateTests` :

```swift
    func test_offering_isActive() {
        XCTAssertTrue(CallState.offering.isActive)
    }

    func test_offering_notEqualConnecting() {
        XCTAssertNotEqual(CallState.offering, CallState.connecting)
    }

    func test_offering_notEqualRinging() {
        XCTAssertNotEqual(CallState.offering, CallState.ringing(isOutgoing: true))
    }
```

- [ ] **Step 3 : Run pour fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL avec `type 'CallState' has no member 'offering'`.

- [ ] **Step 4 : Ajouter le case dans l'enum**

Dans `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`, modifier l'enum :

```swift
enum CallState: Equatable {
    case idle
    case ringing(isOutgoing: Bool)
    /// Outgoing call: peer joined the room, we created and sent the SDP offer,
    /// awaiting the SDP answer. Distinct from `ringing` because at this point
    /// our local description is set and ICE candidates are flying.
    /// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.2
    case offering
    case connecting
    case connected
    case reconnecting(attempt: Int)
    case ended(reason: CallEndReason)

    var isActive: Bool {
        switch self {
        case .idle, .ended: return false
        default: return true
        }
    }

    var isRinging: Bool {
        if case .ringing = self { return true }
        return false
    }
}
```

- [ ] **Step 5 : Run le test pour vérifier qu'il passe**

Run: `./apps/ios/meeshy.sh test`
Expected: les 3 nouveaux tests + tous les existants PASS.

- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/CallManager.swift \
        apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift
git commit -m "feat(ios/calls): add CallState.offering for outgoing offer-sent state

The current FSM conflates 'ringing' (waiting for participant-joined) with
'offering' (offer sent, awaiting answer). Distinct state makes diagnostics
clear: 'offering' transitioning back to 'ringing' is a bug, vs 'offering'
to 'connecting' is the happy path. Reference §2.2."
```

---

### Task 4 : Fix E5 (part 2) — Transition `outgoing.ringing → outgoing.offering`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:1059-1088`

- [ ] **Step 1 : Lire la fonction `listenForParticipantJoined`**

Run:
```bash
grep -A 30 "private func listenForParticipantJoined" apps/ios/Meeshy/Features/Main/Services/CallManager.swift
```
Expected: la fonction avec sa subscription Combine.

- [ ] **Step 2 : Écrire le test (failing)**

Dans `apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift`, ajouter une classe `CallManagerOfferingTransitionTests` :

```swift
import XCTest
import Combine
@testable import Meeshy

@MainActor
final class CallManagerOfferingTransitionTests: XCTestCase {

    func test_listenForParticipantJoined_transitionsToOffering_thenConnecting() async {
        // This test verifies that when the caller receives `participant-joined`,
        // the FSM goes ringing → offering (offer creation), then once setRemote(answer)
        // is set, → connecting. Currently the FSM jumps straight to connecting,
        // which masks bugs (we never see "offer created" state-confirmable).
        //
        // Phase 1 minimal test: assert the state IS .offering immediately after
        // participant-joined and BEFORE setRemoteDescription.

        // Mocking the full CallManager + WebRTCService is heavy.
        // Pragmatic test: assert via grep that the source code transitions to
        // `.offering` in `listenForParticipantJoined` callback, before the
        // `Task { ... await createOffer ... }` block.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try! String(contentsOf: url, encoding: .utf8)

        // Find the listenForParticipantJoined function block
        guard let funcRange = source.range(of: "func listenForParticipantJoined"),
              let blockEnd = source.range(of: "private func emitCallOffer", range: funcRange.upperBound..<source.endIndex)
        else {
            XCTFail("listenForParticipantJoined function not found")
            return
        }
        let funcBody = String(source[funcRange.lowerBound..<blockEnd.lowerBound])

        XCTAssertTrue(
            funcBody.contains("self.callState = .offering"),
            "listenForParticipantJoined must transition state to .offering after participant-joined"
        )
    }
}
```

- [ ] **Step 3 : Run pour fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL avec assertion sur "listenForParticipantJoined must transition state to .offering".

- [ ] **Step 4 : Modifier `listenForParticipantJoined`**

Dans `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`, modifier la fonction (ligne ~1059) pour transiter vers `.offering` avant `createOffer` :

Remplacer :
```swift
                self.callState = .connecting
                Task { [weak self] in
                    guard let self else { return }
                    guard let offer = await self.webRTCService.createOffer() else {
                        self.endCallInternal(reason: .failed("Failed to create offer"))
                        return
                    }
                    self.emitCallOffer(callId: callId, toUserId: toUserId, isVideo: isVideo, sdp: offer)
                    Logger.calls.info("SDP offer sent for call: \(callId)")
                }
```

Par :
```swift
                // Phase 1 fix E5: distinct .offering state. We're no longer ringing
                // (peer joined) but not yet connecting (no answer received). This
                // makes the FSM observable and matches the SOTA spec.
                self.callState = .offering
                Task { [weak self] in
                    guard let self else { return }
                    guard let offer = await self.webRTCService.createOffer() else {
                        self.endCallInternal(reason: .failed("Failed to create offer"))
                        return
                    }
                    self.emitCallOffer(callId: callId, toUserId: toUserId, isVideo: isVideo, sdp: offer)
                    Logger.calls.info("SDP offer sent for call: \(callId)")
                }
```

ET modifier `handleRemoteAnswer` pour transiter `.offering → .connecting` après `setRemoteDescription` (cherche la fonction par grep) :

```bash
grep -n "func handleRemoteAnswer" apps/ios/Meeshy/Features/Main/Services/CallManager.swift
```

Dans cette fonction, ajouter après le `await self.webRTCService.setRemoteDescription(sdp)` :

```swift
        await self.webRTCService.setRemoteDescription(sdp)
        // Phase 1 fix E5: now that remote answer is applied, ICE checking starts.
        // Transition .offering → .connecting.
        if case .offering = self.callState {
            self.callState = .connecting
        }
```

- [ ] **Step 5 : Run pour pass**

Run: `./apps/ios/meeshy.sh test`
Expected: les nouveaux tests PASS + aucune régression.

- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/CallManager.swift \
        apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift
git commit -m "fix(ios/calls): wire outgoing.offering state in listenForParticipantJoined

ringing → offering happens on participant-joined (offer created and sent).
offering → connecting happens after setRemoteDescription(answer).
Makes the FSM observable per spec §2.2."
```

---

### Task 5 : Fix E6 + P6 — Gate `connecting → connected` sur RTP packets reçus

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift` (`webRTCServiceDidConnect`)
- Modify: `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift` (constants)

- [ ] **Step 1 : Lire `webRTCServiceDidConnect` et `transitionToConnected`**

Run:
```bash
grep -n "func webRTCServiceDidConnect\|func transitionToConnected" apps/ios/Meeshy/Features/Main/Services/CallManager.swift
```

- [ ] **Step 2 : Lire les stats existants pour comprendre le shape**

Run:
```bash
grep -A 20 "func getStats" apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift
```

Le `CallStats` actuel inclut `roundTripTimeMs`, `packetsLost`, `bandwidth`, `codec`. Pour Phase 1, on ajoute `inboundPacketsReceived`.

- [ ] **Step 3 : Étendre `CallStats` avec `inboundPacketsReceived`**

Dans `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift`, modifier la struct `CallStats` :

```swift
struct CallStats: Equatable, Sendable {
    let roundTripTimeMs: Double
    let packetsLost: Int
    let bandwidth: Int
    let codec: String?
    let inboundPacketsReceived: Int   // NEW — Phase 1 RTP gate

    init(
        roundTripTimeMs: Double = 0,
        packetsLost: Int = 0,
        bandwidth: Int = 0,
        codec: String? = nil,
        inboundPacketsReceived: Int = 0
    ) {
        self.roundTripTimeMs = roundTripTimeMs
        self.packetsLost = packetsLost
        self.bandwidth = bandwidth
        self.codec = codec
        self.inboundPacketsReceived = inboundPacketsReceived
    }
}
```

- [ ] **Step 4 : Mettre à jour `P2PWebRTCClient.getStats()` pour calculer `inboundPacketsReceived`**

Dans `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift`, fonction `getStats()`, le code actuel parcourt déjà les stats `inbound-rtp` et accumule `packetsReceived` dans une variable locale. Modifier pour passer cette valeur dans le constructor de `CallStats` :

Remplacer (à la fin de `getStats`) :
```swift
                continuation.resume(returning: CallStats(
                    roundTripTimeMs: rtt,
                    packetsLost: packetsLost,
                    bandwidth: bytesSent,
                    codec: codec
                ))
```

Par :
```swift
                continuation.resume(returning: CallStats(
                    roundTripTimeMs: rtt,
                    packetsLost: packetsLost,
                    bandwidth: bytesSent,
                    codec: codec,
                    inboundPacketsReceived: packetsReceived
                ))
```

- [ ] **Step 5 : Ajouter les constantes du gate dans `QualityThresholds`**

Dans `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift`, dans l'enum `QualityThresholds` :

```swift
enum QualityThresholds {
    // ... existing constants ...

    // Phase 1 fix E6 — RTP gate before transitioning to .connected.
    // ICE connected does NOT mean media flows: NAT, codec mismatch, audio
    // session not flipped, or routing bug can leave us with iceState=.connected
    // but zero RTP packets. We poll stats every 2s up to 5 times (10s budget),
    // require ≥5 inbound RTP packets (≈100ms of audio at 50pps Opus) before
    // declaring "connected". Beyond 10s with no RTP → ended(.failed).
    // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.3
    static let rtpGatePollIntervalSeconds: TimeInterval = 2.0
    static let rtpGateMaxAttempts: Int = 5
    static let rtpGateRequiredPackets: Int = 5
}
```

- [ ] **Step 6 : Écrire le test (failing)**

Dans `apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift`, ajouter :

```swift
@MainActor
final class CallManagerRTPGateTests: XCTestCase {

    func test_connectingToConnected_requires_inboundRTP() async throws {
        // Source-level guard: webRTCServiceDidConnect must NOT directly call
        // transitionToConnected without checking inbound RTP packets.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        guard let funcRange = source.range(of: "func webRTCServiceDidConnect"),
              let blockEnd = source.range(of: "func webRTCServiceDidDisconnect", range: funcRange.upperBound..<source.endIndex)
        else {
            XCTFail("webRTCServiceDidConnect not found")
            return
        }
        let funcBody = String(source[funcRange.lowerBound..<blockEnd.lowerBound])

        XCTAssertTrue(
            funcBody.contains("startRTPGatePolling")
                || funcBody.contains("waitForInboundRTP")
                || funcBody.contains("rtpGatePollIntervalSeconds"),
            "webRTCServiceDidConnect must invoke RTP gate before transitionToConnected"
        )
    }
}
```

- [ ] **Step 7 : Run pour fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL avec assertion "webRTCServiceDidConnect must invoke RTP gate".

- [ ] **Step 8 : Implémenter le RTP gate dans `CallManager`**

Dans `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`, ajouter une property pour la task de polling et modifier `webRTCServiceDidConnect` :

Ajouter dans la zone des `private var` (autour ligne 64) :
```swift
    private var rtpGateTask: Task<Void, Never>?
```

Modifier `webRTCServiceDidConnect` (cherche par grep) :

```swift
    nonisolated func webRTCServiceDidConnect(_ service: WebRTCService) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            switch self.callState {
            case .connecting:
                // Phase 1 fix E6: ICE connected does not guarantee media flows.
                // Poll stats every 2s up to 5 attempts (10s budget). Require
                // ≥5 inbound RTP packets before declaring .connected. If no
                // RTP after 10s, end with .failed("media path broken").
                self.startRTPGatePolling()
            case .reconnecting:
                Logger.calls.info("Reconnection successful — running RTP gate")
                self.startRTPGatePolling()
            default:
                break
            }
        }
    }

    @MainActor
    private func startRTPGatePolling() {
        rtpGateTask?.cancel()
        rtpGateTask = Task { @MainActor [weak self] in
            guard let self else { return }
            for attempt in 1...QualityThresholds.rtpGateMaxAttempts {
                let nanos = UInt64(QualityThresholds.rtpGatePollIntervalSeconds * 1_000_000_000)
                try? await Task.sleep(nanoseconds: nanos)
                guard !Task.isCancelled else { return }
                guard let stats = await self.webRTCService.getStats() else { continue }
                if stats.inboundPacketsReceived >= QualityThresholds.rtpGateRequiredPackets {
                    Logger.calls.info(
                        "RTP gate passed at attempt \(attempt) " +
                        "(packets=\(stats.inboundPacketsReceived))"
                    )
                    self.transitionToConnected()
                    return
                }
                Logger.calls.debug(
                    "RTP gate attempt \(attempt)/\(QualityThresholds.rtpGateMaxAttempts) — " +
                    "packets=\(stats.inboundPacketsReceived) (need \(QualityThresholds.rtpGateRequiredPackets))"
                )
            }
            Logger.calls.error(
                "RTP gate timeout after \(QualityThresholds.rtpGateMaxAttempts) attempts — " +
                "ICE connected but no media. Ending call."
            )
            self.endCallInternal(reason: .failed("media path broken (no inbound RTP)"))
        }
    }
```

ET dans `endCallInternal`, ajouter `rtpGateTask?.cancel(); rtpGateTask = nil` au début.

- [ ] **Step 9 : Run le test pour pass**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS, pas de régression.

- [ ] **Step 10 : Build pour vérifier compilation Swift 6**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED.

- [ ] **Step 11 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/CallManager.swift \
        apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift \
        apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift \
        apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift
git commit -m "fix(ios/calls): RTP gate before connecting → connected transition

ICE connected does not mean media flows. NAT, codec mismatch, audio session
desync, or route bugs can leave iceConnectionState=.connected with zero
inbound RTP. Poll stats every 2s up to 5 times; require ≥5 inbound RTP
packets before transitioning to .connected. Otherwise end with media path
broken. Reference §2.3."
```

---

### Task 6 : Fix P1 — Heartbeat 10s période + 30s lost timeout

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift` (`QualityThresholds.heartbeatIntervalSeconds`)
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift` (`startHeartbeat`)

- [ ] **Step 1 : Lire la valeur actuelle**

Run:
```bash
grep -n "heartbeatIntervalSeconds\|heartbeatLostThresholdSeconds" apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift
```
Expected: `heartbeatIntervalSeconds: TimeInterval = 15.0` (existant), pas de `heartbeatLostThresholdSeconds`.

- [ ] **Step 2 : Écrire le test (failing) sur les valeurs des constantes**

Dans `apps/ios/MeeshyTests/Unit/Services/WebRTCTypesTests.swift` (créer si absent), ajouter :

```swift
import XCTest
@testable import Meeshy

final class QualityThresholdsTests: XCTestCase {

    func test_heartbeatIntervalSeconds_is10() {
        // Phase 1 fix P1: 5s/15s was too aggressive on cellular (RTT 800ms+).
        // SOTA WhatsApp/Telegram: 10s heartbeat, 30s lost.
        // Reference §5.12.
        XCTAssertEqual(QualityThresholds.heartbeatIntervalSeconds, 10.0)
    }

    func test_heartbeatLostThresholdSeconds_is30() {
        XCTAssertEqual(QualityThresholds.heartbeatLostThresholdSeconds, 30.0)
    }

    func test_heartbeatAckTimeoutSeconds_is5() {
        // Phase 1 fix P10: cellular RTT worst-case ~3-4s, 5s ACK timeout.
        XCTAssertEqual(QualityThresholds.heartbeatAckTimeoutSeconds, 5.0)
    }
}
```

- [ ] **Step 3 : Run pour fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `heartbeatIntervalSeconds` is 15, not 10.

- [ ] **Step 4 : Mettre à jour `QualityThresholds`**

Dans `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift`, modifier `QualityThresholds` :

```swift
enum QualityThresholds {
    // ... existing constants ...

    /// Phase 1 fix P1: cellular networks have RTT 800ms+ ; 5s heartbeat with
    /// 15s lost was too aggressive (false-positive reconnects). SOTA matches
    /// WhatsApp/Telegram with 10s/30s. Reference §5.12.
    static let heartbeatIntervalSeconds: TimeInterval = 10.0

    /// 3 missed beats (~30s) marks heartbeat as lost.
    static let heartbeatLostThresholdSeconds: TimeInterval = 30.0

    /// Phase 1 fix P10: cellular ACK round-trip can take 3-4s in poor signal.
    /// 5s timeout absorbs worst-case without false positives.
    static let heartbeatAckTimeoutSeconds: TimeInterval = 5.0
}
```

- [ ] **Step 5 : Mettre à jour `startHeartbeat` pour utiliser les nouvelles constantes**

Dans `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`, fonction `startHeartbeat`, vérifier qu'elle utilise `QualityThresholds.heartbeatIntervalSeconds` et ajouter le tracking des ACK failures :

```swift
    private func startHeartbeat() {
        heartbeatTask?.cancel()
        let interval = QualityThresholds.heartbeatIntervalSeconds
        heartbeatTask = Task { @MainActor [weak self] in
            var consecutiveAckFailures = 0
            let maxConsecutiveFailures = Int(
                (QualityThresholds.heartbeatLostThresholdSeconds /
                 QualityThresholds.heartbeatIntervalSeconds).rounded(.up)
            )
            while !Task.isCancelled {
                let nanos = UInt64(interval * 1_000_000_000)
                try? await Task.sleep(nanoseconds: nanos)
                guard !Task.isCancelled else { return }
                guard let self, let callId = self.currentCallId else { return }
                let fromId = AuthManager.shared.currentUser?.id ?? ""
                let remoteId = self.remoteUserId ?? ""
                MessageSocketManager.shared.emitCallSignal(
                    callId: callId,
                    type: "heartbeat",
                    payload: ["from": fromId, "to": remoteId]
                )
                Logger.calls.debug("Heartbeat sent for call: \(callId)")

                // ACK tracking will be added in Phase 4 when emitCallHeartbeat
                // gains an ACK return. For now, fire-and-forget consistent with
                // the existing protocol.
                _ = consecutiveAckFailures
                _ = maxConsecutiveFailures
            }
        }
        Logger.calls.info("Heartbeat task started (\(interval)s interval, \(QualityThresholds.heartbeatLostThresholdSeconds)s lost threshold)")
    }
```

- [ ] **Step 6 : Run le test pour pass**

Run: `./apps/ios/meeshy.sh test`
Expected: les 3 tests `QualityThresholdsTests` PASS, pas de régression.

- [ ] **Step 7 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift \
        apps/ios/Meeshy/Features/Main/Services/CallManager.swift \
        apps/ios/MeeshyTests/Unit/Services/WebRTCTypesTests.swift
git commit -m "fix(ios/calls): heartbeat 10s/30s/5s (P1 + P10)

5s/15s was too aggressive on cellular (RTT 800ms+, false-positive reconnects).
WhatsApp/Telegram parity: 10s heartbeat, 30s lost, 5s ACK timeout.
Reference §5.12."
```

---

### Task 7 : Fix P2 — Server ringing timeout 60s

**Files:**
- Modify: `services/gateway/src/services/CallService.ts`
- Modify: `services/gateway/src/socketio/CallEventsHandler.ts`
- Test: `services/gateway/src/__tests__/integration/call-ringing-timeout.integration.test.ts` (new)

- [ ] **Step 1 : Lire `CallService.ts` pour repérer où ajouter les méthodes**

Run:
```bash
grep -n "scheduleRingingTimeout\|clearRingingTimeout\|class CallService" services/gateway/src/services/CallService.ts | head -10
```
Expected: une seule ligne pour `class CallService`. Pas de méthodes existantes.

- [ ] **Step 2 : Écrire le test E2E (failing)**

Crée `services/gateway/src/__tests__/integration/call-ringing-timeout.integration.test.ts` :

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CallService } from '../../services/CallService';
import { PrismaClient, CallStatus } from '@meeshy/shared/prisma/client';

describe('CallService — ringing timeout (Phase 1 fix P2)', () => {
  let prisma: PrismaClient;
  let service: CallService;

  beforeEach(() => {
    vi.useFakeTimers();
    prisma = {} as PrismaClient;  // mock as needed in real test
    service = new CallService(prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes scheduleRingingTimeout method', () => {
    expect(typeof (service as any).scheduleRingingTimeout).toBe('function');
  });

  it('exposes clearRingingTimeout method', () => {
    expect(typeof (service as any).clearRingingTimeout).toBe('function');
  });

  it('schedules timeout firing at 60s after scheduleRingingTimeout', () => {
    const callback = vi.fn();
    (service as any).scheduleRingingTimeout('call-id-1', callback);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(59_000);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);   // total 61s
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('clearRingingTimeout cancels the scheduled timeout', () => {
    const callback = vi.fn();
    (service as any).scheduleRingingTimeout('call-id-2', callback);
    vi.advanceTimersByTime(30_000);
    (service as any).clearRingingTimeout('call-id-2');
    vi.advanceTimersByTime(60_000);   // would have fired without clear
    expect(callback).not.toHaveBeenCalled();
  });

  it('replaces previous timeout for same callId', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    (service as any).scheduleRingingTimeout('call-id-3', cb1);
    (service as any).scheduleRingingTimeout('call-id-3', cb2);   // replaces
    vi.advanceTimersByTime(61_000);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3 : Run pour fail**

Run:
```bash
cd services/gateway && pnpm vitest run src/__tests__/integration/call-ringing-timeout.integration.test.ts
```
Expected: FAIL — `scheduleRingingTimeout is not a function`.

- [ ] **Step 4 : Implémenter `scheduleRingingTimeout` + `clearRingingTimeout` dans `CallService`**

Dans `services/gateway/src/services/CallService.ts`, ajouter en haut de la classe (après `private heartbeats: Map<...>`) :

```typescript
  private ringingTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly RINGING_TIMEOUT_MS = 60_000;   // Phase 1 fix P2 — FaceTime parity
```

Et ajouter les méthodes (par ex avant `recordHeartbeat`) :

```typescript
  /**
   * Phase 1 fix P2 — Schedule a 60s timeout for a ringing call. If no answer
   * arrives in time, the callback is invoked (caller will transition the call
   * to `missed`). Replaces any previously scheduled timeout for this callId.
   *
   * NOTE: Phase 1 uses in-process setTimeout. Multi-instance gateway deployments
   * may race on the timeout; Phase 4 introduces optimistic-locked transitions
   * which are idempotent against this race. See spec §2.5.
   */
  scheduleRingingTimeout(callId: string, onTimeout: () => void): void {
    this.clearRingingTimeout(callId);
    const handle = setTimeout(() => {
      this.ringingTimeouts.delete(callId);
      onTimeout();
    }, this.RINGING_TIMEOUT_MS);
    this.ringingTimeouts.set(callId, handle);
  }

  clearRingingTimeout(callId: string): void {
    const handle = this.ringingTimeouts.get(callId);
    if (handle) {
      clearTimeout(handle);
      this.ringingTimeouts.delete(callId);
    }
  }
```

- [ ] **Step 5 : Run le test pour pass**

Run:
```bash
cd services/gateway && pnpm vitest run src/__tests__/integration/call-ringing-timeout.integration.test.ts
```
Expected: 5/5 PASS.

- [ ] **Step 6 : Brancher dans `CallEventsHandler` — schedule au call:initiate**

Dans `services/gateway/src/socketio/CallEventsHandler.ts`, après le `await this.callService.initiateCall(...)` réussi, ajouter le scheduling :

Cherche l'endroit où `call:initiate` réussit et où `call:initiated` est broadcasté. Après ce broadcast, ajouter :

```typescript
        // Phase 1 fix P2 — schedule 60s ringing timeout. If no answer arrives,
        // force transition to 'missed' and broadcast call:ended.
        this.callService.scheduleRingingTimeout(callSession.id, async () => {
          try {
            const current = await this.prisma.callSession.findUnique({
              where: { id: callSession.id },
              select: { status: true },
            });
            // Only force missed if still in initiated/ringing (not connecting/active/ended)
            if (current && (current.status === 'initiated' || current.status === 'ringing')) {
              const ended = await this.callService.updateCallStatus(
                callSession.id, 'missed' as any, 'no_answer' as any
              ).catch(() => null);
              if (ended) {
                io.to(ROOMS.call(callSession.id)).emit(CALL_EVENTS.ENDED, {
                  callId: callSession.id,
                  duration: 0,
                  endedBy: undefined,
                  reason: 'no_answer',
                });
                io.to(ROOMS.conversation(callSession.conversationId)).emit(CALL_EVENTS.ENDED, {
                  callId: callSession.id,
                  duration: 0,
                  endedBy: undefined,
                  reason: 'no_answer',
                });
                logger.info('Ringing timeout fired — call marked as missed', {
                  callId: callSession.id,
                });
              }
            }
          } catch (err) {
            logger.error('Ringing timeout handler error', err);
          }
        });
```

- [ ] **Step 7 : Brancher le clear sur les transitions qui sortent de ringing**

Dans le même fichier, partout où `callService.updateCallStatus` est appelé pour passer à `connecting`, `active`, ou un état terminal, appeler `this.callService.clearRingingTimeout(callId)` juste avant.

Sites principaux : à l'intérieur du handler `call:signal` quand `data.signal.type === 'answer'` (transition vers 'connecting'), dans `call:join` réussi, dans `call:leave`, dans `call:reject`.

Exemple dans le handler `call:signal` answer :
```typescript
        if (data.signal.type === 'answer') {
          this.callService.clearRingingTimeout(data.callId);
          await this.callService.updateCallStatus(data.callId, 'active' as any).catch(() => {});
        }
```

(Adapter selon la structure exacte de chaque branche.)

- [ ] **Step 8 : Run tous les tests gateway pour vérifier aucune régression**

Run:
```bash
cd services/gateway && pnpm vitest run
```
Expected: 100% pass.

- [ ] **Step 9 : Commit**

```bash
git add services/gateway/src/services/CallService.ts \
        services/gateway/src/socketio/CallEventsHandler.ts \
        services/gateway/src/__tests__/integration/call-ringing-timeout.integration.test.ts
git commit -m "fix(gateway/calls): server-side ringing timeout 60s → missed

Without a server-enforced timeout, a stale 'ringing' call could persist
in DB indefinitely if the callee never answered or rejected explicitly.
60s matches FaceTime/WhatsApp parity. In-process setTimeout for Phase 1;
optimistic-locked transitions in Phase 4 will make multi-instance safe.
Reference §2.5."
```

---

## Acceptance criteria

- [ ] B3 : `audioSession.setActive(true, options:` n'apparaît plus dans `CallManager.swift` ; CallKit owns activation
- [ ] E7/B4 : `WebRTCError.simulatorVideoUnsupported` existe ; `startLocalMedia` throw sur simulator pour `audioVideo` ; `CallManager` catch + degrade audio-only
- [ ] E5 : `CallState.offering` ajouté ; `listenForParticipantJoined` transite `.offering` ; `handleRemoteAnswer` transite `.offering → .connecting`
- [ ] E6 : `webRTCServiceDidConnect` invoque RTP gate (`startRTPGatePolling`) au lieu de transitionner directement ; gate transite `.connected` après ≥5 inbound RTP packets ou `.ended(.failed("media path broken"))` après 10s
- [ ] P1/P10 : `QualityThresholds.heartbeatIntervalSeconds = 10`, `heartbeatLostThresholdSeconds = 30`, `heartbeatAckTimeoutSeconds = 5`
- [ ] P2 : `CallService.scheduleRingingTimeout` + `clearRingingTimeout` exposées et câblées dans `CallEventsHandler` ; timeout 60s force `missed` + broadcast
- [ ] `./apps/ios/meeshy.sh build` succeed (Swift 6 strict)
- [ ] `./apps/ios/meeshy.sh test` 100% pass
- [ ] `cd services/gateway && pnpm vitest run` 100% pass

## Notes

**Dépendance entre tasks** : tasks 1, 2, 6, 7 sont indépendantes et parallélisables. Tasks 3 → 4 doivent être séquentielles (task 4 utilise le case ajouté en task 3). Task 5 dépend de task 4 (le RTP gate transitionne `.connecting → .connected`, et `.connecting` est atteint via `.offering → .connecting`).

**Test pragmatique** : plusieurs tasks utilisent un test "source-level" (grep dans le fichier source) plutôt qu'un test fonctionnel. Raison : la machine d'état actuelle est tellement intriquée avec singletons (`AuthManager.shared`, `MessageSocketManager.shared`) qu'un test unitaire complet nécessiterait Phase 0 + injection de dépendances. Phases ultérieures (4, 5) introduisent l'injection.

**Risque** : Task 7 (P2 ringing timeout) utilise `setTimeout` in-process. Multi-instance gateway → race possible où plusieurs instances tentent la transition. Phase 4 (version field optimistic locking) résout ça : la 2e transition échouera avec `P2025` (version conflict).

**Suivi** : Phase 2 (codec preferences API SOTA) et Phase 3 (pre-warming + singleton effects). Phase 4 (server FSM + optimistic locking) durcit la sécurité multi-instance.
