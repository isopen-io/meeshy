# Calls SOTA Redesign — Phase 0 : Migration Prep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pose les fondations (Prisma migration `version` field, types Swift `CallMediaConfig` + `MediaPipelineHook` + `CallEventQueue` actor scaffold) sans changement de comportement, prérequis pour les Phases 1-9.

**Architecture:** Modifications additive only — pas de touche aux flows existants. Le `CallEventQueue` est wire dans `CallManager` comme propriété privée non utilisée. Le `version` field est ajouté à `CallSession` Prisma + migration mongo, mais aucun handler ne l'incrémente encore (les transitions actuelles continuent à fonctionner sans).

**Tech Stack:**
- Prisma 6 + MongoDB 8 (schema migration)
- Swift 6 strict concurrency (actor + protocol + struct)
- XCTest (apps/ios) + MeeshySDKTests
- pnpm + turbo

**Spec reference:** `docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md` §2.7 + §1.bis.1 + §1.bis.3 + Phase 0 du §8.

---

## File Structure

### Created files

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallMediaConfig.swift` — struct extensible config call (audio/video/datachannels/codecPreferences)
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/MediaPipelineHook.swift` — protocol + `CallContext` + `CallRole` + default impl extension
- `apps/ios/Meeshy/Features/Main/Services/CallEventQueue.swift` — actor Swift 6 scaffold (state, version, hooks)
- `apps/ios/MeeshyTests/Unit/Services/CallEventQueueTests.swift` — tests register/unregister hook, initial state
- `apps/ios/MeeshyTests/Unit/Services/CallMediaConfigTests.swift` — tests default values + Sendable
- `apps/ios/MeeshyTests/Unit/Services/MediaPipelineHookTests.swift` — tests default implementations no-op

### Modified files

- `packages/shared/prisma/schema.prisma` — ajouter `version Int @default(1)` sur `CallSession`
- `packages/shared/prisma/migrations/*` (auto-généré par `prisma migrate dev`)
- `apps/ios/Meeshy/Features/Main/Services/CallManager.swift` — ajouter `private let eventQueue = CallEventQueue()` (non utilisé Phase 0)
- `apps/ios/Meeshy.xcodeproj/project.pbxproj` — auto-modifié à l'ajout des 3 nouveaux fichiers Swift

---

## Tasks

### Task 1 : Prisma migration — ajouter `version` field sur `CallSession`

**Files:**
- Modify: `packages/shared/prisma/schema.prisma`
- Auto-generated: `packages/shared/prisma/migrations/<timestamp>_add_call_session_version/`

- [ ] **Step 1 : Lire le bloc `CallSession` actuel pour repérer où insérer le champ**

```bash
grep -n "^model CallSession" packages/shared/prisma/schema.prisma
```
Expected: une ligne avec le numéro de la ligne du `model CallSession {`.

- [ ] **Step 2 : Ajouter `version Int @default(1)` au schema**

Dans `packages/shared/prisma/schema.prisma`, à l'intérieur du `model CallSession {`, ajouter le champ JUSTE avant les `@@index` :

```prisma
  /// Optimistic locking version. Incremented on every status transition.
  /// Pattern: where: { id, version: known }, data: { ..., version: { increment: 1 } }.
  /// See docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.7.
  version Int @default(1)

  /// Indexes
  @@index([conversationId])
```

- [ ] **Step 3 : Générer la migration Prisma**

Run:
```bash
cd packages/shared && pnpm prisma migrate dev --name add_call_session_version
```
Expected: nouveau dossier `prisma/migrations/<timestamp>_add_call_session_version/migration.sql` (Mongo-style operation log) + Prisma client régénéré.

- [ ] **Step 4 : Vérifier que le client Prisma régénéré expose `version`**

Run:
```bash
cd packages/shared && pnpm tsx -e "import { Prisma } from './prisma/client'; type T = Prisma.CallSessionUpdateInput; const x: T = { version: 2 }; console.log('OK', x);"
```
Expected: `OK { version: 2 }` sans erreur TypeScript.

- [ ] **Step 5 : Vérifier qu'aucun code existant ne casse (compile gateway)**

Run:
```bash
cd services/gateway && pnpm tsc --noEmit
```
Expected: `0 errors` (les codes existants n'utilisent pas `version`, le champ est additif).

- [ ] **Step 6 : Commit**

```bash
git add packages/shared/prisma/schema.prisma packages/shared/prisma/migrations/
git commit -m "feat(prisma): add CallSession.version for optimistic locking"
```

---

### Task 2 : Créer `CallMediaConfig.swift`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallMediaConfig.swift`
- Test: `apps/ios/MeeshyTests/Unit/Services/CallMediaConfigTests.swift`

- [ ] **Step 1 : Écrire le test (qui doit échouer car le type n'existe pas)**

Crée `apps/ios/MeeshyTests/Unit/Services/CallMediaConfigTests.swift` :

```swift
import XCTest
@testable import Meeshy

final class CallMediaConfigTests: XCTestCase {

    func test_default_audioConfig_hasOpusBitrateRange() {
        let config = CallMediaConfig()
        XCTAssertEqual(config.audio.maxBitrateBps, 64_000)
        XCTAssertEqual(config.audio.minBitrateBps, 16_000)
        XCTAssertTrue(config.audio.dtx)
    }

    func test_default_video_isNil() {
        let config = CallMediaConfig()
        XCTAssertNil(config.video)
    }

    func test_videoConfig_hd720p30_hasExpectedValues() {
        let video = VideoConfig.hd720p30
        XCTAssertEqual(video.maxResolution.width, 1280)
        XCTAssertEqual(video.maxResolution.height, 720)
        XCTAssertEqual(video.maxFrameRate, 30)
        XCTAssertTrue(video.preferHardwareCodec)
    }

    func test_codecPreferences_default_orderH264VP8VP9() {
        let codecs = CodecPreferences.default
        XCTAssertEqual(codecs.audioCodecs, ["opus", "red"])
        XCTAssertEqual(codecs.videoCodecs, ["H264", "VP8", "VP9"])
    }
}
```

- [ ] **Step 2 : Run le test pour vérifier qu'il échoue**

Run:
```bash
./apps/ios/meeshy.sh test
```
Expected: FAIL avec `cannot find type 'CallMediaConfig' in scope`.

- [ ] **Step 3 : Créer le fichier `CallMediaConfig.swift`**

Crée `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallMediaConfig.swift` :

```swift
import Foundation
import CoreGraphics

/// Extensible call media configuration consumed by `WebRTCEngine.configure(...)`
/// and mutated by `MediaPipelineHook.willConfigure(...)`.
///
/// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §1.bis.3
public struct CallMediaConfig: Sendable {
    public var audio: AudioConfig
    public var video: VideoConfig?
    public var dataChannels: [DataChannelConfig]
    public var preferredCodecs: CodecPreferences

    public init(
        audio: AudioConfig = .default,
        video: VideoConfig? = nil,
        dataChannels: [DataChannelConfig] = [],
        preferredCodecs: CodecPreferences = .default
    ) {
        self.audio = audio
        self.video = video
        self.dataChannels = dataChannels
        self.preferredCodecs = preferredCodecs
    }
}

public struct AudioConfig: Sendable {
    public var dtx: Bool
    public var maxBitrateBps: Int
    public var minBitrateBps: Int

    public init(dtx: Bool, maxBitrateBps: Int, minBitrateBps: Int) {
        self.dtx = dtx
        self.maxBitrateBps = maxBitrateBps
        self.minBitrateBps = minBitrateBps
    }

    public static let `default` = AudioConfig(
        dtx: true,
        maxBitrateBps: 64_000,
        minBitrateBps: 16_000
    )
}

public struct VideoConfig: Sendable {
    public var maxResolution: CGSize
    public var maxFrameRate: Int
    public var preferHardwareCodec: Bool

    public init(maxResolution: CGSize, maxFrameRate: Int, preferHardwareCodec: Bool) {
        self.maxResolution = maxResolution
        self.maxFrameRate = maxFrameRate
        self.preferHardwareCodec = preferHardwareCodec
    }

    public static let hd720p30 = VideoConfig(
        maxResolution: CGSize(width: 1280, height: 720),
        maxFrameRate: 30,
        preferHardwareCodec: true
    )
}

public struct DataChannelConfig: Sendable {
    public let label: String
    public let isOrdered: Bool
    public let maxRetransmits: Int?
    public let maxPacketLifeTime: TimeInterval?

    public init(
        label: String,
        isOrdered: Bool,
        maxRetransmits: Int? = nil,
        maxPacketLifeTime: TimeInterval? = nil
    ) {
        self.label = label
        self.isOrdered = isOrdered
        self.maxRetransmits = maxRetransmits
        self.maxPacketLifeTime = maxPacketLifeTime
    }
}

public struct CodecPreferences: Sendable {
    public let audioCodecs: [String]
    public let videoCodecs: [String]

    public init(audioCodecs: [String], videoCodecs: [String]) {
        self.audioCodecs = audioCodecs
        self.videoCodecs = videoCodecs
    }

    public static let `default` = CodecPreferences(
        audioCodecs: ["opus", "red"],
        videoCodecs: ["H264", "VP8", "VP9"]
    )
}
```

- [ ] **Step 4 : Ajouter le fichier au target Meeshy dans Xcode project**

Le fichier doit apparaître dans `apps/ios/Meeshy.xcodeproj/project.pbxproj`. Pour ce faire (pour les agents avec accès limité à Xcode), ouvrir Xcode et faire `File > Add Files to "Meeshy"`. Sinon, modifier `project.pbxproj` manuellement (chercher un fichier voisin dans `WebRTC/` et dupliquer son entrée avec le nouveau chemin/UUID).

Verification:
```bash
grep -c "CallMediaConfig.swift" apps/ios/Meeshy.xcodeproj/project.pbxproj
```
Expected: `≥ 4` (PBXFileReference + PBXBuildFile + 2 references in groups).

- [ ] **Step 5 : Run les tests pour vérifier qu'ils passent**

Run:
```bash
./apps/ios/meeshy.sh test
```
Expected: `CallMediaConfigTests` 4/4 PASS.

- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/WebRTC/CallMediaConfig.swift \
        apps/ios/MeeshyTests/Unit/Services/CallMediaConfigTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/calls): add CallMediaConfig + AudioConfig + VideoConfig + CodecPreferences"
```

---

### Task 3 : Créer `MediaPipelineHook.swift`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/WebRTC/MediaPipelineHook.swift`
- Test: `apps/ios/MeeshyTests/Unit/Services/MediaPipelineHookTests.swift`

- [ ] **Step 1 : Écrire le test (failing)**

Crée `apps/ios/MeeshyTests/Unit/Services/MediaPipelineHookTests.swift` :

```swift
import XCTest
import CoreMedia
@testable import Meeshy

private struct EmptyHook: MediaPipelineHook {
    let identifier = "test.empty"
}

final class MediaPipelineHookTests: XCTestCase {

    func test_callContext_initStoresAllFields() {
        let context = CallContext(callId: "abc123", isVideo: true, role: .caller, peerId: "peer1")
        XCTAssertEqual(context.callId, "abc123")
        XCTAssertTrue(context.isVideo)
        XCTAssertEqual(context.role, .caller)
        XCTAssertEqual(context.peerId, "peer1")
    }

    func test_callRole_callerNotEqualCallee() {
        XCTAssertNotEqual(CallRole.caller, CallRole.callee)
    }

    func test_emptyHook_defaultImplementations_areNoop() async {
        let hook = EmptyHook()
        let context = CallContext(callId: "x", isVideo: false, role: .caller, peerId: nil)
        var config = CallMediaConfig()
        try? await hook.willConfigure(call: context, config: &config)
        // No assertion: default impl is a no-op; we verify it doesn't throw or mutate.
        XCTAssertEqual(config.audio.maxBitrateBps, 64_000)
    }
}
```

- [ ] **Step 2 : Run pour vérifier le fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL avec `cannot find type 'MediaPipelineHook' in scope` ou `cannot find type 'CallContext'`.

- [ ] **Step 3 : Créer le fichier**

Crée `apps/ios/Meeshy/Features/Main/Services/WebRTC/MediaPipelineHook.swift` :

```swift
import Foundation
import CoreMedia
import CoreVideo

/// Identifies the role of the local user in a call.
public enum CallRole: Sendable, Equatable {
    case caller
    case callee
}

public typealias PeerID = String

/// Read-only snapshot of the current call context, passed to every hook invocation.
/// Hooks can read it to decide their behaviour but cannot mutate it.
public struct CallContext: Sendable {
    public let callId: String
    public let isVideo: Bool
    public let role: CallRole
    public let peerId: String?

    public init(callId: String, isVideo: Bool, role: CallRole, peerId: String?) {
        self.callId = callId
        self.isVideo = isVideo
        self.role = role
        self.peerId = peerId
    }
}

/// Single bus for all in-call cross-cutting features:
/// transcription, translation, recording, AI insights, AR effects, E2EE, etc.
/// Each hook is invoked at well-defined seams in the media flow.
///
/// All methods have default no-op implementations so adopters only override the
/// seams they need.
///
/// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §1.bis.1
public protocol MediaPipelineHook: Sendable {
    /// Stable identifier used for deregistration / diagnostics.
    var identifier: String { get }

    /// Called once per call setup, before peer connection is created.
    /// Hook can request additional codecs, data channels, encryption layer, etc.
    func willConfigure(call: CallContext, config: inout CallMediaConfig) async throws

    /// Called for each local audio frame after AEC/NS/AGC (post-VPIO),
    /// before encoding to Opus. Hook sees clean voice samples.
    /// Buffers are CMSampleBuffer (PCM Int16) at 48 kHz mono.
    func processLocalAudio(_ buffer: CMSampleBuffer, context: CallContext) async

    /// Called for each remote audio frame after Opus decode + jitter buffer,
    /// before audio mixer / playback.
    func processRemoteAudio(_ buffer: CMSampleBuffer, from peer: PeerID, context: CallContext) async

    /// Called for each local video frame BEFORE filters apply.
    func processLocalVideoPreFilter(_ pixelBuffer: CVPixelBuffer, context: CallContext) async

    /// Called for each local video frame AFTER filters, before encoding.
    func processLocalVideoPostFilter(_ pixelBuffer: CVPixelBuffer, context: CallContext) async

    /// Called when the call enters or leaves a state. Hooks can react
    /// (start/stop services, attach/detach listeners, persist state).
    func callDidTransition(_ state: CallState, in context: CallContext) async
}

public extension MediaPipelineHook {
    func willConfigure(call: CallContext, config: inout CallMediaConfig) async throws {}
    func processLocalAudio(_ buffer: CMSampleBuffer, context: CallContext) async {}
    func processRemoteAudio(_ buffer: CMSampleBuffer, from peer: PeerID, context: CallContext) async {}
    func processLocalVideoPreFilter(_ pixelBuffer: CVPixelBuffer, context: CallContext) async {}
    func processLocalVideoPostFilter(_ pixelBuffer: CVPixelBuffer, context: CallContext) async {}
    func callDidTransition(_ state: CallState, in context: CallContext) async {}
}
```

- [ ] **Step 4 : Ajouter le fichier au project.pbxproj** (cf. Task 2 Step 4 pour la procédure)

Verification:
```bash
grep -c "MediaPipelineHook.swift" apps/ios/Meeshy.xcodeproj/project.pbxproj
```
Expected: `≥ 4`.

- [ ] **Step 5 : Run les tests**

Run: `./apps/ios/meeshy.sh test`
Expected: `MediaPipelineHookTests` 3/3 PASS.

- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/WebRTC/MediaPipelineHook.swift \
        apps/ios/MeeshyTests/Unit/Services/MediaPipelineHookTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/calls): add MediaPipelineHook protocol + CallContext + CallRole"
```

---

### Task 4 : Créer `CallEventQueue` actor scaffold

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/CallEventQueue.swift`
- Test: `apps/ios/MeeshyTests/Unit/Services/CallEventQueueTests.swift`

- [ ] **Step 1 : Écrire le test (failing)**

Crée `apps/ios/MeeshyTests/Unit/Services/CallEventQueueTests.swift` :

```swift
import XCTest
@testable import Meeshy

private struct StubHook: MediaPipelineHook {
    let identifier: String
}

final class CallEventQueueTests: XCTestCase {

    func test_initialState_isIdle() async {
        let queue = CallEventQueue()
        let state = await queue.state
        let version = await queue.version
        let callId = await queue.currentCallId
        XCTAssertEqual(state, .idle)
        XCTAssertEqual(version, 0)
        XCTAssertNil(callId)
    }

    func test_register_addsHookToList() async {
        let queue = CallEventQueue()
        await queue.register(hook: StubHook(identifier: "h1"))
        await queue.register(hook: StubHook(identifier: "h2"))
        let hooks = await queue.currentHooks()
        XCTAssertEqual(hooks.map(\.identifier), ["h1", "h2"])
    }

    func test_unregister_removesByIdentifier() async {
        let queue = CallEventQueue()
        await queue.register(hook: StubHook(identifier: "h1"))
        await queue.register(hook: StubHook(identifier: "h2"))
        await queue.unregister(hookIdentifier: "h1")
        let hooks = await queue.currentHooks()
        XCTAssertEqual(hooks.map(\.identifier), ["h2"])
    }

    func test_unregister_unknownIdentifier_isNoop() async {
        let queue = CallEventQueue()
        await queue.register(hook: StubHook(identifier: "h1"))
        await queue.unregister(hookIdentifier: "nope")
        let hooks = await queue.currentHooks()
        XCTAssertEqual(hooks.map(\.identifier), ["h1"])
    }
}
```

- [ ] **Step 2 : Run pour fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL avec `cannot find type 'CallEventQueue' in scope`.

- [ ] **Step 3 : Créer le fichier `CallEventQueue.swift`**

Crée `apps/ios/Meeshy/Features/Main/Services/CallEventQueue.swift` :

```swift
import Foundation
import os

/// Serial event queue for the call FSM. Owns the canonical client-side state
/// and processes transitions from any event source (socket, CallKit, WebRTC,
/// network) in order. This is the single source of truth for call state
/// client-side; `CallManager` (`@MainActor`) is a thin façade observing this
/// actor and publishing mirror state for SwiftUI binding.
///
/// Phase 0: scaffold only — no transition logic wired yet. Subsequent phases
/// progressively migrate logic from `CallManager` into this actor.
///
/// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.2
public actor CallEventQueue {
    public private(set) var state: CallState = .idle
    public private(set) var version: Int = 0
    public private(set) var currentCallId: String?

    private var hooks: [any MediaPipelineHook] = []
    private let logger = Logger(subsystem: "me.meeshy.app", category: "call-event-queue")

    public init() {}

    public func register(hook: any MediaPipelineHook) {
        hooks.append(hook)
        logger.info("Hook registered: \(hook.identifier, privacy: .public)")
    }

    public func unregister(hookIdentifier: String) {
        hooks.removeAll { $0.identifier == hookIdentifier }
    }

    public func currentHooks() -> [any MediaPipelineHook] {
        hooks
    }
}
```

- [ ] **Step 4 : Ajouter le fichier au project.pbxproj**

Verification:
```bash
grep -c "CallEventQueue.swift" apps/ios/Meeshy.xcodeproj/project.pbxproj
```
Expected: `≥ 4`.

- [ ] **Step 5 : Run les tests**

Run: `./apps/ios/meeshy.sh test`
Expected: `CallEventQueueTests` 4/4 PASS.

- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/CallEventQueue.swift \
        apps/ios/MeeshyTests/Unit/Services/CallEventQueueTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/calls): add CallEventQueue actor scaffold (state, version, hooks)"
```

---

### Task 5 : Wire `CallEventQueue` dans `CallManager` (private property non utilisée)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`

- [ ] **Step 1 : Lire la zone des propriétés privées de CallManager**

Run:
```bash
grep -n "// MARK: - Internal" apps/ios/Meeshy/Features/Main/Services/CallManager.swift
```
Expected: une ligne avec le numéro (autour de la ligne 58 actuellement).

- [ ] **Step 2 : Écrire un test minimal qui vérifie la présence de la propriété**

Phase 0 = no behavior change. Le test vérifie juste que CallManager continue à compiler et fonctionner après ajout. Pas besoin d'un test dédié — les tests existants `CallManagerTests` doivent continuer à passer.

Run d'abord les tests existants AVANT modification :
```bash
./apps/ios/meeshy.sh test
```
Expected: tous PASS (baseline).

- [ ] **Step 3 : Ajouter la propriété `private let eventQueue = CallEventQueue()` dans `CallManager`**

Dans `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`, ajouter après le bloc `// MARK: - Internal` (autour de la ligne 60), AVANT la ligne `private let webRTCService: WebRTCService` :

```swift
    // MARK: - Internal

    /// Phase 0 scaffold — owned but not yet wired into transitions.
    /// Subsequent phases migrate transition logic from CallManager into this actor.
    /// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.2
    private let eventQueue = CallEventQueue()

    private let webRTCService: WebRTCService
```

- [ ] **Step 4 : Run les tests pour vérifier que rien n'est cassé**

Run: `./apps/ios/meeshy.sh test`
Expected: tous PASS, **aucun test n'échoue à cause de l'ajout** (la propriété n'est pas utilisée).

- [ ] **Step 5 : Run le build pour vérifier qu'il n'y a pas de warning Swift 6 concurrency**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED, sans warning sur `CallEventQueue` (c'est un `actor`, donc Sendable par défaut, et la propriété est `private let`).

- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/CallManager.swift
git commit -m "feat(ios/calls): wire CallEventQueue into CallManager (Phase 0 scaffold)"
```

---

## Acceptance criteria

- [ ] Migration Prisma `version Int @default(1)` créée et committed
- [ ] Le client Prisma régénéré expose `CallSession.version`
- [ ] Compilation gateway sans erreur après migration
- [ ] 3 nouveaux fichiers Swift créés (`CallMediaConfig.swift`, `MediaPipelineHook.swift`, `CallEventQueue.swift`)
- [ ] 3 fichiers de tests créés, tous PASS
- [ ] `CallManager` contient `private let eventQueue = CallEventQueue()` non utilisé
- [ ] `./apps/ios/meeshy.sh build` succeed
- [ ] `./apps/ios/meeshy.sh test` 100% pass (aucune régression)
- [ ] **Aucun changement de comportement** côté call flow

## Notes

**Pourquoi Phase 0 ne touche pas aux flows existants :** la stratégie est de poser les fondations atomiquement. Phase 1 (bug fixes) consomme parfois ces fondations, parfois pas — chaque correction reste atomique. Phase 2+ (codec preferences, FSM autoritative serveur, etc.) consomment réellement ces fondations.

**Risque technique principal :** la migration Prisma sur MongoDB ne crée pas de SQL à exécuter ; Prisma régénère juste le schema-SDL et le client. Vérifie après `migrate dev` que `pnpm tsc --noEmit` dans `services/gateway` reste à 0 erreur.

**Suivi :** la phase suivante (Phase 1) corrige les bugs de production confirmés (B3 force setActive, E7 simulator guard, E5 outgoing.offering, E6 RTP gate, P1 heartbeat 10s/30s/60s, P2 ringing 60s).
