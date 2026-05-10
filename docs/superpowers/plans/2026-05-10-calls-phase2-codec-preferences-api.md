# Calls SOTA Redesign — Phase 2 : Codec Preferences API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le SDP munging fragile pour Opus/DTX/RED par les APIs natives `RTCRtpTransceiver.setCodecPreferences` (libwebrtc 141) et `RTCRtpEncodingParameters.dtx`. Réactiver RED proprement (désactivé en commit `9e663039` à cause d'un bug PT/PT). Standardiser sur `addTransceiver(of:)` pour garantir la disponibilité des transceivers AVANT `createOffer`.

**Architecture:** Refactor surgical de `P2PWebRTCClient.swift`. Le pattern actuel `peerConnection.add(audioTrack, streamIds:)` ne garantit pas la présence du transceiver dans `pc.transceivers` avant `setLocalDescription`. Nouveau pattern : `addTransceiver(of: .audio, init: ...)` qui retourne le transceiver, sur lequel on applique immédiatement `setCodecPreferences`. Pas de comportement utilisateur changé, juste la mécanique interne (cleaner, plus robuste, plus forward-compatible avec les upgrades libwebrtc).

**Tech Stack:**
- Swift 6 strict concurrency
- WebRTC.xcframework 141.0 (libwebrtc Google)
- XCTest

**Spec reference:** `docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md` §3.8 (codec preferences) + §6.7 (cross-platform) + §7 amendements E9/E12 + ADR-4.

**Bugs résolus** :
- **B5** : SDP munging fragile pour Opus DTX/RED — remplacé par API native
- Réactivation RED : `addAudioRedundancy` SDP munging supprimé, RED géré par `setCodecPreferences`

---

## File Structure

### Modified files

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift` :
  - `startLocalMedia` : `add(track:)` → `addTransceiver(of:)` (audio + vidéo)
  - 2 nouvelles propriétés : `audioTransceiver`, `videoTransceiver`
  - 2 nouvelles méthodes : `applyAudioCodecPreferences()`, `applyVideoCodecPreferences()`
  - DTX via `RTCRtpEncodingParameters.dtx = true`
  - Suppression de `Self.addAudioRedundancy` (commenté + références)
  - Simplification de `mungeOpusSDP` (garder FEC seulement, retirer DTX qui passe par params)
- `apps/ios/MeeshyTests/Unit/Services/CodecPreferencesTests.swift` (new) — tests source-scan

### Files NOT touched

- `WebRTCService.swift` (intermédiaire, reste agnostique)
- `CallManager.swift` (n'expose pas le détail codec)

---

## Tasks

### Task 1 : Refactor `startLocalMedia` audio path → `addTransceiver`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift` (audio block ~line 138-160)
- Add property: `audioTransceiver`
- Test: `apps/ios/MeeshyTests/Unit/Services/CodecPreferencesTests.swift`

- [ ] **Step 1 : Lire l'audio block actuel**

```bash
grep -B 1 -A 20 "// MARK: - Local Media" apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift | head -30
```

Le code actuel utilise `peerConnection?.add(audioTrack, streamIds: ["meeshy-stream-0"])`.

- [ ] **Step 2 : Écrire le test (failing)**

Crée `apps/ios/MeeshyTests/Unit/Services/CodecPreferencesTests.swift` :

```swift
import XCTest
@testable import Meeshy

final class CodecPreferencesTests: XCTestCase {

    func test_p2pClient_uses_addTransceiver_audio() throws {
        // Source-level guard: P2PWebRTCClient.startLocalMedia must use
        // addTransceiver(of: .audio, init:) instead of add(track:streamIds:).
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.8 + §7 E9/E12
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertFalse(
            source.contains("peerConnection?.add(audioTrack, streamIds:"),
            "audio track must be added via addTransceiver(of: .audio), not add(track:streamIds:). " +
            "Reference §3.8 + §7 E9/E12"
        )
        XCTAssertTrue(
            source.contains("addTransceiver(of: .audio"),
            "P2PWebRTCClient must call addTransceiver(of: .audio, init:) for audio track"
        )
    }
}
```

Ajoute le fichier au projet pbxproj (4 entrées pattern habituel, prefix `CDPF`).

- [ ] **Step 3 : Run test pour fail**

```bash
xcodebuild test -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyTests/CodecPreferencesTests 2>&1 | tail -10
```
Expected: 2 FAILs.

- [ ] **Step 4 : Ajouter la propriété `audioTransceiver`**

Dans `P2PWebRTCClient.swift`, ajouter dans la section des `private var` (autour ligne 35-46) :

```swift
    private var audioTransceiver: RTCRtpTransceiver?
```

- [ ] **Step 5 : Refactor le bloc audio dans `startLocalMedia`**

Remplacer (approximativement lignes 150-158) :

```swift
        Logger.webrtc.info("[WEBRTC] audioSource begin")
        let audioSource = factory.audioSource(with: audioConstraints)
        Logger.webrtc.info("[WEBRTC] audioTrack begin")
        let audioTrack = factory.audioTrack(with: audioSource, trackId: "audio0")
        audioTrack.isEnabled = true
        localAudioTrack = audioTrack
        Logger.webrtc.info("[WEBRTC] add audio track to PC")
        peerConnection?.add(audioTrack, streamIds: ["meeshy-stream-0"])
```

Par :

```swift
        Logger.webrtc.info("[WEBRTC] audioSource begin")
        let audioSource = factory.audioSource(with: audioConstraints)
        Logger.webrtc.info("[WEBRTC] audioTrack begin")
        let audioTrack = factory.audioTrack(with: audioSource, trackId: "audio0")
        audioTrack.isEnabled = true
        localAudioTrack = audioTrack
        Logger.webrtc.info("[WEBRTC] addTransceiver audio")
        // Phase 2 : addTransceiver garantit la présence du transceiver dans
        // pc.transceivers AVANT setLocalDescription, ce qui permet d'appliquer
        // setCodecPreferences de manière fiable. add(track:streamIds:) crée
        // un transceiver implicite mais la liste pc.transceivers peut rester
        // vide jusqu'au premier setLocalDescription, rendant setCodecPreferences
        // inopérant. Reference §3.8 + §7 E9/E12.
        let audioInit = RTCRtpTransceiverInit()
        audioInit.direction = .sendRecv
        audioInit.streamIds = ["meeshy-stream-0"]
        guard let pc = peerConnection,
              let audioTransceiver = pc.addTransceiver(of: .audio, init: audioInit) else {
            throw WebRTCError.failedToCreatePeerConnection
        }
        audioTransceiver.sender.track = audioTrack
        self.audioTransceiver = audioTransceiver
```

- [ ] **Step 6 : Run test pour pass + build**

```bash
xcodebuild test -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyTests/CodecPreferencesTests 2>&1 | tail -10
xcodebuild build -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' 2>&1 | tail -5
```
Expected: 2 PASS + BUILD SUCCEEDED.

- [ ] **Step 7 : Run regression sur tous les tests calls**

```bash
xcodebuild test -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyTests/CallStateTests -only-testing:MeeshyTests/CallManagerOfferingTransitionTests -only-testing:MeeshyTests/CallManagerRTPGateTests -only-testing:MeeshyTests/CallManagerAudioSessionTests -only-testing:MeeshyTests/QualityThresholdsHeartbeatTests -only-testing:MeeshyTests/CallEventQueueTests -only-testing:MeeshyTests/CallMediaConfigTests -only-testing:MeeshyTests/MediaPipelineHookTests -only-testing:MeeshyTests/WebRTCErrorTests 2>&1 | tail -5
```
Expected: all pass.

- [ ] **Step 8 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift \
        apps/ios/MeeshyTests/Unit/Services/CodecPreferencesTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "refactor(ios/calls): audio track via addTransceiver (Phase 2 prep for setCodecPreferences)

addTransceiver(of: .audio, init:) guarantees the transceiver is in
pc.transceivers BEFORE setLocalDescription, enabling reliable
setCodecPreferences. Previous add(track:streamIds:) created the
transceiver implicitly but pc.transceivers could remain empty until
first setLocalDescription. Reference §3.8 + §7 E9/E12."
```

---

### Task 2 : Apply Opus + RED via setCodecPreferences (audio)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift`
- Test: `apps/ios/MeeshyTests/Unit/Services/CodecPreferencesTests.swift`

- [ ] **Step 1 : Ajouter le test (failing)**

Étendre `CodecPreferencesTests` :

```swift
    func test_p2pClient_appliesAudioCodecPreferences() throws {
        // Source-level guard: must call applyAudioCodecPreferences after
        // creating the audio transceiver, with Opus + RED codec order.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(
            source.contains("applyAudioCodecPreferences"),
            "P2PWebRTCClient must define applyAudioCodecPreferences method"
        )
        XCTAssertTrue(
            source.contains("setCodecPreferences"),
            "Must call setCodecPreferences (libwebrtc 141 API)"
        )
    }
```

- [ ] **Step 2 : Run pour fail**

```bash
xcodebuild test -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyTests/CodecPreferencesTests/test_p2pClient_appliesAudioCodecPreferences 2>&1 | tail -10
```
Expected: FAIL.

- [ ] **Step 3 : Ajouter la méthode `applyAudioCodecPreferences`**

Dans `P2PWebRTCClient.swift`, ajouter dans la section privée (avant `// MARK: - SDP Negotiation` ou similaire) :

```swift
    /// Phase 2 — Apply audio codec preferences via libwebrtc 141 API.
    /// Order: Opus first (primary), RED second (RFC 2198 redundancy).
    /// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.8 + ADR-4
    ///
    /// RED was previously enabled via SDP munging (`addAudioRedundancy`) which
    /// triggered an iOS libwebrtc bug with `a=fmtp:63 PT/PT` (silent audio after
    /// ICE connected, commit 9e663039). Using setCodecPreferences avoids the
    /// SDP regex path entirely — libwebrtc 141 negotiates RED via the standard
    /// API correctly.
    private func applyAudioCodecPreferences(audioTransceiver: RTCRtpTransceiver) {
        let factory = WebRTCSharedFactory.factory
        let capabilities = factory.rtpReceiverCapabilities(forKind: .audio)

        let opusCodecs = capabilities.codecs.filter { $0.name.lowercased() == "opus" }
        let redCodecs = capabilities.codecs.filter { $0.name.lowercased() == "red" }

        // Opus primary, RED secondary. Drop CN, telephone-event, G722, PCMU.
        let preferred = opusCodecs + redCodecs
        guard !preferred.isEmpty else {
            Logger.webrtc.warning("[WEBRTC] no Opus/RED codecs available — leaving default preferences")
            return
        }

        audioTransceiver.setCodecPreferences(preferred)
        Logger.webrtc.info(
            "[WEBRTC] audio codec preferences applied: " +
            "\(preferred.map { $0.name }.joined(separator: \", \"))"
        )
    }
```

- [ ] **Step 4 : Appeler `applyAudioCodecPreferences` dans `startLocalMedia`**

Juste après `self.audioTransceiver = audioTransceiver` (du Task 1 Step 5), ajouter :

```swift
        applyAudioCodecPreferences(audioTransceiver: audioTransceiver)
```

- [ ] **Step 5 : Run test + regression + build**

```bash
xcodebuild test -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyTests/CodecPreferencesTests 2>&1 | tail -10
xcodebuild build -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' 2>&1 | tail -5
```
Expected: all CodecPreferencesTests pass + BUILD SUCCEEDED.

- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift \
        apps/ios/MeeshyTests/Unit/Services/CodecPreferencesTests.swift
git commit -m "feat(ios/calls): apply Opus + RED codec preferences via libwebrtc API

Replaces fragile SDP munging (addAudioRedundancy was disabled in
9e663039 due to PT/PT bug). RTCRtpTransceiver.setCodecPreferences
is the libwebrtc 141 API path — RED negotiates correctly without
SDP regex. Reference §3.8 + ADR-4."
```

---

### Task 3 : Refactor video path → addTransceiver + apply video codec preferences (H264, VP8, VP9)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift`
- Add property: `videoTransceiver`
- Test: `apps/ios/MeeshyTests/Unit/Services/CodecPreferencesTests.swift`

- [ ] **Step 1 : Ajouter le test (failing)**

Étendre `CodecPreferencesTests` :

```swift
    func test_p2pClient_uses_addTransceiver_video() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertFalse(
            source.contains("peerConnection?.add(videoTrack, streamIds:"),
            "video track must be added via addTransceiver(of: .video)"
        )
        XCTAssertTrue(
            source.contains("addTransceiver(of: .video"),
            "P2PWebRTCClient must call addTransceiver(of: .video, init:) for video track"
        )
    }

    func test_p2pClient_appliesVideoCodecPreferences() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(
            source.contains("applyVideoCodecPreferences"),
            "P2PWebRTCClient must define applyVideoCodecPreferences method"
        )
        // Verify priority order: H264 > VP8 > VP9
        let priorityRange = source.range(of: "[\"H264\", \"VP8\", \"VP9\"]")
            ?? source.range(of: "[ \"H264\", \"VP8\", \"VP9\" ]")
        XCTAssertNotNil(priorityRange, "video codec priority must list H264, VP8, VP9 in that order")
    }
```

- [ ] **Step 2 : Run pour fail**

```bash
xcodebuild test -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyTests/CodecPreferencesTests 2>&1 | tail -10
```
Expected: 2 FAILs.

- [ ] **Step 3 : Ajouter la propriété `videoTransceiver`**

Dans `P2PWebRTCClient.swift`, à côté de `audioTransceiver` :

```swift
    private var videoTransceiver: RTCRtpTransceiver?
```

- [ ] **Step 4 : Refactor le bloc vidéo dans `startLocalMedia`**

Remplacer (approximativement lignes 169-172, sous le `#else` du simulator guard) :

```swift
        Logger.webrtc.info("[WEBRTC] add video track to PC")
        peerConnection?.add(videoTrack, streamIds: ["meeshy-stream-0"])
```

Par :

```swift
        Logger.webrtc.info("[WEBRTC] addTransceiver video")
        let videoInit = RTCRtpTransceiverInit()
        videoInit.direction = .sendRecv
        videoInit.streamIds = ["meeshy-stream-0"]
        guard let pc = peerConnection,
              let videoTransceiver = pc.addTransceiver(of: .video, init: videoInit) else {
            throw WebRTCError.failedToCreatePeerConnection
        }
        videoTransceiver.sender.track = videoTrack
        self.videoTransceiver = videoTransceiver
        applyVideoCodecPreferences(videoTransceiver: videoTransceiver)
```

- [ ] **Step 5 : Ajouter la méthode `applyVideoCodecPreferences`**

```swift
    /// Phase 2 — Apply video codec preferences via libwebrtc 141 API.
    /// Order H264 > VP8 > VP9 (cross-platform iOS↔Web compatibility — §6.7).
    /// AV1 excluded (uneven HW support across iOS/Chrome/Safari).
    /// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.8 + §6.7
    private func applyVideoCodecPreferences(videoTransceiver: RTCRtpTransceiver) {
        let factory = WebRTCSharedFactory.factory
        let capabilities = factory.rtpReceiverCapabilities(forKind: .video)

        // Priority order — preserves cross-platform compatibility:
        // - H264: hardware-accelerated on iOS (VideoToolbox), supported by Chrome 80+, Safari 13+
        // - VP8: software but ubiquitous, fallback for clients without H264 HW
        // - VP9: better compression, software-only on most iOS, optional fallback
        let priorityOrder = ["H264", "VP8", "VP9"]
        let preferred = priorityOrder.flatMap { name in
            capabilities.codecs.filter { $0.name == name }
        }
        guard !preferred.isEmpty else {
            Logger.webrtc.warning("[WEBRTC] no preferred video codecs available — leaving default")
            return
        }

        videoTransceiver.setCodecPreferences(preferred)
        Logger.webrtc.info(
            "[WEBRTC] video codec preferences applied: " +
            "\(preferred.map { $0.name }.joined(separator: \", \"))"
        )
    }
```

- [ ] **Step 6 : Run test + regression + build**

```bash
xcodebuild test -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyTests/CodecPreferencesTests 2>&1 | tail -10
xcodebuild build -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' 2>&1 | tail -5
```
Expected: all 4 CodecPreferencesTests PASS + BUILD SUCCEEDED.

- [ ] **Step 7 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift \
        apps/ios/MeeshyTests/Unit/Services/CodecPreferencesTests.swift
git commit -m "feat(ios/calls): video addTransceiver + H264/VP8/VP9 codec preferences

Cross-platform priority H264 > VP8 > VP9 ensures iOS↔Web negotiates
the best mutual codec. H264 is HW-accelerated on iOS via VideoToolbox,
supported by Chrome 80+/Safari 13+. AV1 excluded (uneven HW support).
Reference §3.8 + §6.7."
```

---

### Task 4 : DTX via RTCRtpEncodingParameters + cleanup SDP munging

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift`
- Test: `apps/ios/MeeshyTests/Unit/Services/CodecPreferencesTests.swift`

- [ ] **Step 1 : Test (failing)**

Étendre `CodecPreferencesTests` :

```swift
    func test_p2pClient_setsDtxViaEncodingParameters() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(
            source.contains("encoding.dtx") || source.contains(".dtx ="),
            "DTX must be set via RTCRtpEncodingParameters.dtx, not SDP munging"
        )
    }

    func test_p2pClient_removesAudioRedundancyMunging() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        // The static func addAudioRedundancy may exist or be removed — but it
        // MUST NOT be called (commented out in 9e663039 due to PT/PT bug;
        // RED is now negotiated via setCodecPreferences).
        let activeCalls = source.components(separatedBy: "\n").filter { line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            return trimmed.hasPrefix("mungedSDP = Self.addAudioRedundancy(")
        }
        XCTAssertEqual(
            activeCalls.count, 0,
            "addAudioRedundancy must NOT be called (replaced by setCodecPreferences). " +
            "Reference §3.8 + ADR-4."
        )
    }
```

- [ ] **Step 2 : Run pour fail**

```bash
xcodebuild test -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyTests/CodecPreferencesTests 2>&1 | tail -10
```
Expected: 2 FAILs.

- [ ] **Step 3 : Étendre `applyAudioCodecPreferences` pour set DTX via params**

Modifier la fin de `applyAudioCodecPreferences` (ajouter après `setCodecPreferences`) :

```swift
        audioTransceiver.setCodecPreferences(preferred)
        Logger.webrtc.info(
            "[WEBRTC] audio codec preferences applied: " +
            "\(preferred.map { $0.name }.joined(separator: \", \"))"
        )

        // Phase 2 — set DTX via RTCRtpEncodingParameters instead of SDP munging.
        // libwebrtc 141 honors `encoding.dtx = true` directly, no fmtp regex needed.
        let params = audioTransceiver.sender.parameters
        for encoding in params.encodings {
            encoding.dtx = true
            encoding.maxBitrateBps = NSNumber(value: 64_000)
            encoding.minBitrateBps = NSNumber(value: 16_000)
        }
        audioTransceiver.sender.parameters = params
        Logger.webrtc.info("[WEBRTC] audio DTX enabled via RtpEncodingParameters (max=64kbps, min=16kbps)")
```

(Note: `RTCRtpEncodingParameters` exposes `maxBitrateBps`/`minBitrateBps` as `NSNumber?`. Adapter la syntaxe selon l'API exacte de WebRTC.xcframework 141.)

- [ ] **Step 4 : Vérifier que `addAudioRedundancy` n'est pas appelé**

Dans `P2PWebRTCClient.swift`, dans `createOffer` et `createAnswer`, le code actuel a :

```swift
// DIAGNOSTIC: RED désactivé temporairement. Suspect du flux audio
// nul après ICE connected — `a=fmtp:63 PT/PT` (RFC 2198) peut être
// mal négocié par certains chemins du SDK iOS WebRTC, entraînant
// un drop silencieux des paquets audio à la décode. À ré-activer
// une fois la cause confirmée.
// mungedSDP = Self.addAudioRedundancy(mungedSDP)
```

Cette ligne commentée doit RESTER commentée (ou être supprimée). RED est maintenant géré par `setCodecPreferences` (Task 2), donc le SDP regex n'est plus nécessaire — et le bug PT/PT n'est plus déclenchable.

Mettre à jour le commentaire pour refléter le nouvel état :

```swift
// Phase 2 — RED is now negotiated via setCodecPreferences (libwebrtc 141 API).
// The previous SDP munging path (addAudioRedundancy) was disabled in 9e663039
// due to a PT/PT negotiation bug. The setCodecPreferences API avoids the
// regex entirely. addAudioRedundancy is kept as a static function for
// diagnostic comparison but MUST NOT be called.
// Reference §3.8 + ADR-4.
```

- [ ] **Step 5 : Vérifier que `mungeOpusSDP` ne fait plus de DTX munging**

Lire la fonction actuelle :
```bash
grep -B 2 -A 20 "static func mungeOpusSDP" apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift
```

Si la fonction force `usedtx=1` dans le fmtp Opus, le retirer (DTX maintenant géré par params). Garder `useinbandfec=1` (FEC, pas d'API native libwebrtc 141 pour ça). Mettre à jour le commentaire.

Si la fonction ne fait pas de DTX explicite, juste laisser et noter que `usedtx=1` viendra du params automatiquement.

- [ ] **Step 6 : Run tous les tests + build**

```bash
xcodebuild test -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyTests/CodecPreferencesTests -only-testing:MeeshyTests/CallStateTests -only-testing:MeeshyTests/CallManagerOfferingTransitionTests -only-testing:MeeshyTests/CallManagerRTPGateTests -only-testing:MeeshyTests/CallManagerAudioSessionTests 2>&1 | tail -10
xcodebuild build -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' 2>&1 | tail -5
```

- [ ] **Step 7 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift \
        apps/ios/MeeshyTests/Unit/Services/CodecPreferencesTests.swift
git commit -m "feat(ios/calls): DTX via RtpEncodingParameters + cleanup SDP munging

DTX (Opus discontinuous transmission, silence suppression) now set via
audioTransceiver.sender.parameters[i].dtx = true. libwebrtc 141 propagates
this to the Opus encoder without SDP regex. Bitrate range (16-64 kbps)
also moves from defaults to explicit params. addAudioRedundancy remains
as a static function but is documented as DEPRECATED (replaced by
setCodecPreferences). Reference §3.8 + ADR-4."
```

---

## Acceptance criteria

- [ ] Task 1 : audio uses `addTransceiver(of: .audio, init:)`, no `add(track:streamIds:)` for audio
- [ ] Task 2 : `applyAudioCodecPreferences` exists, calls `setCodecPreferences` with Opus + RED order
- [ ] Task 3 : video uses `addTransceiver(of: .video, init:)`, `applyVideoCodecPreferences` exists with H264/VP8/VP9 priority order
- [ ] Task 4 : DTX set via `RTCRtpEncodingParameters.dtx`, `addAudioRedundancy` not called
- [ ] All 6 `CodecPreferencesTests` pass
- [ ] All Phase 0+1 regression tests pass
- [ ] `xcodebuild build` succeeds for Meeshy scheme
- [ ] No `Co-Authored-By` trailer in any commit

## Test plan device

Après les 4 commits :
1. Build et installer sur 2 iPhones : `./apps/ios/meeshy.sh run`
2. Initier un call iOS↔iOS : vérifier qu'il s'établit avec audio bidirectionnel
3. Vérifier dans les logs `Logger.webrtc.info` :
   - `[WEBRTC] audio codec preferences applied: opus, red`
   - `[WEBRTC] audio DTX enabled via RtpEncodingParameters`
   - Si video call : `[WEBRTC] video codec preferences applied: H264, VP8, VP9`
4. Vérifier dans les logs RTC qu'il n'y a plus le pattern d'audio silencieux après ICE connected (le bug 9e663039 que la diag a chassé)
5. Optionnel : tester iOS↔Web (frontend Next.js) pour valider la négociation cross-platform H264/VP8

## Notes

**Risque principal** : `addTransceiver` est NOT the same code path comme `add(track:)`. L'API expose plus mais peut révéler des surprises (e.g., transceivers en `inactive` direction par défaut → notre code force `direction = .sendRecv`).

**Suivi Phase 3** : Pre-warming `RTCPeerConnection` + singleton `CallAudioEffectsService`.
**Suivi Phase 4** : Server FSM + version locking optimistic.
