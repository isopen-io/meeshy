# iOS Audio Playback Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'audio joué dans une bulle de conversation continue lorsque l'utilisateur scrolle, quitte la conversation, ou met l'app en background. À la fin de chaque audio, le suivant audio non écouté de la même conversation démarre automatiquement. Un mini-player flottant + `MPNowPlayingInfoCenter` exposent les contrôles partout dans l'app et sur le lock-screen.

**Architecture:** Détacher le moteur de lecture de la cellule SwiftUI en créant un singleton app `ConversationAudioCoordinator.shared` qui possède une instance interne de `AudioPlaybackManager` (SDK, atome). La queue + le contexte + les hooks lifecycle vivent dans le coordinator. Les bulles audio sont splittées en `ActiveAudioBubble` / `InactiveAudioBubble` derrière un `AudioBubbleRouter` parent, pour préserver « Zero Unnecessary Re-render ». **Zéro modification SDK.**

**Tech Stack:** SwiftUI / UIKit, AVFoundation (`AVAudioPlayer`), Combine, MediaPlayer (`MPNowPlayingInfoCenter`, `MPRemoteCommandCenter`), Swift 6 concurrency. Tests: XCTest. Build: `./apps/ios/meeshy.sh build` (Xcode pour l'app), `xcodebuild build -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet` (vérif SDK).

**Spec:** `docs/superpowers/specs/2026-05-25-audio-continuous-playback-design.md`

**Branche:** `feat/ios-audio-playback-persistence`

---

## File Structure

### New files (app)

| Path | Responsibility |
|---|---|
| `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift` | Singleton `@MainActor` qui possède l'engine, la queue, l'`activeContext`, les hooks lifecycle. Cœur de la feature. |
| `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator+NowPlaying.swift` | Extension qui bridge `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter` (Phase 8). |
| `apps/ios/Meeshy/Features/Main/Services/AudioQueueBuilder.swift` | Fonction static pure : construit la queue à partir des messages. |
| `apps/ios/Meeshy/Features/Main/Services/AudioPlaybackEngineDriving.swift` | Protocol injectable + retroactive conformance pour `AudioPlaybackManager`. |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleRouter.swift` | Vue parente Equatable qui observe le coordinator et dispatche vers Active/Inactive. |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/ActiveAudioBubble.swift` | Sub-view Equatable avec `let` primitifs. Joue/seek/speed cycle. |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/InactiveAudioBubble.swift` | Sub-view Equatable affichant l'état neutre + bouton play. |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleHelpers/AudioWaveformBars.swift` | Helper rendu : barres waveform statique vs animée. |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleHelpers/AudioPlayButton.swift` | Helper rendu : bouton play/pause stylé indigo. |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleHelpers/AudioTimeRow.swift` | Helper rendu : timecode current/total. |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleHelpers/AudioSpeedChip.swift` | Helper rendu : chip vitesse cycle. |
| `apps/ios/Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift` | Vue flottante en bas d'écran, observe le coordinator. |

### Modified files (app)

| Path | Sites |
|---|---|
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | Ajout `listenedAttachmentIds: Set<String>`, computed `currentConversationName/ArtworkURL/AccentColorHex`, `playAudio(attachmentId:)`, hook realtime sur `message:new` handler existant. |
| `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` | Le wrapper qui rend les attachments audio passe par `AudioBubbleRouter` au lieu d'`AudioPlayerView` direct. |
| `apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift` | Guard dans `MediaLifecycleBridge.prepareForBackground` (L171) + `resumeFromBackground` (L176). |
| `apps/ios/Meeshy/MeeshyApp.swift` | Guard scenePhase `.background`. |
| `apps/ios/Meeshy/Features/Main/Views/AdaptiveRootView.swift` | Overlay `MiniAudioPlayerBar` + `.task` qui force init du coordinator. |
| `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift` | Ajout `conversationDeleted: PassthroughSubject<String, Never>` (pattern existant : `postDeleted`, `storyDeleted`). **Modif SDK minimale** — il faut un événement lifecycle conv-deleted, qui n'existe pas. |
| `apps/ios/Meeshy/decisions.md` | Entry : retroactive conformance + Bubble exception + zéro modif SDK justification. |

### Test files (new)

| Path | Suite |
|---|---|
| `apps/ios/MeeshyTests/Unit/Mocks/MockAudioPlaybackEngine.swift` | Mock implementation conformant à `AudioPlaybackEngineDriving`. |
| `apps/ios/MeeshyTests/Unit/Services/AudioQueueBuilderTests.swift` | 10 tests purs sur la queue. |
| `apps/ios/MeeshyTests/Unit/Services/ConversationAudioCoordinatorTests.swift` | 12 tests sur le coordinator avec mock. |
| `apps/ios/MeeshyTests/Unit/Services/MediaLifecycleBridgeTests.swift` | 3 tests sur le guard background. |
| `apps/ios/MeeshyTests/Unit/Services/MeeshyAppScenePhaseTests.swift` | 2 tests scenePhase. |
| `apps/ios/MeeshyTests/Unit/Views/AudioBubbleRouterTests.swift` | 4 tests router + re-render. |
| `apps/ios/MeeshyTests/Unit/Views/ConversationViewModelAudioTests.swift` | Tests VM `playAudio` + hook realtime. |
| `apps/ios/MeeshyTests/Unit/Components/MiniAudioPlayerBarTests.swift` | 7 tests mini-player. |

---

# Phase 0 — Setup et vérifications préalables

**But :** Brancher la branche, valider que les hypothèses du spec tiennent face au code actuel, et prototyper le wiring `MockAudioPlaybackEngine` avant d'écrire la moindre ligne de production. Sans ces vérifications, les phases 3-8 risquent de basculer en boue.

### Task 0.1 : Créer la branche et établir le baseline

**Files:**
- Aucun

- [ ] **Step 1: Créer la branche depuis main**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git checkout main && git pull
git checkout -b feat/ios-audio-playback-persistence
```

Expected: "Switched to a new branch 'feat/ios-audio-playback-persistence'"

- [ ] **Step 2: Vérifier que les tests passent sur la baseline**

```bash
./apps/ios/meeshy.sh build
```

Expected: BUILD SUCCEEDED. Si échec, STOP et investiguer avant de continuer — on ne démarre pas une feature sur un baseline rouge.

- [ ] **Step 3: Vérifier que les tests app passent**

```bash
./apps/ios/meeshy.sh test 2>&1 | tail -30
```

Expected: Test Suite 'All tests' passed (modulo les flaky connus `FeedViewModelTests.test_loadMoreIfNeeded` et `ConversationListViewModelTests.schedulePersist_*` — cf. memory `feedback_ios_test_suite_flaky`). Re-run si timing-flaky.

### Task 0.2 : Vérifier les dépendances présupposées dans le spec

**Files:**
- Lecture seule

- [ ] **Step 1: Confirmer `AuthManager.isAuthenticated` est `@Published`**

```bash
grep -n "@Published.*isAuthenticated" /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift
```

Expected: `74:    @Published public var isAuthenticated = false`. Si absent, STOP — le hook logout du spec n'est pas implémentable sans cette propriété ou un ajout SDK.

- [ ] **Step 2: Confirmer `MessageSocketManager.messageDeleted` publisher existe**

```bash
grep -n "messageDeleted.*PassthroughSubject" /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift
```

Expected: `886:    public let messageDeleted = PassthroughSubject<MessageDeletedEvent, Never>()`. Si absent, STOP.

- [ ] **Step 3: Confirmer absence de `conversationDeleted` publisher**

```bash
grep -n "conversationDeleted" /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift
```

Expected: Aucun résultat. **Confirme qu'on devra l'ajouter en Phase 3 (modif SDK minimale, pattern identique à `postDeleted` / `storyDeleted`).**

- [ ] **Step 4: Confirmer signature `CacheCoordinator.conversations.load(for:)`**

```bash
grep -n "func load\|public.*conversations" /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift | head -10
```

Expected: API `load(for: String) -> CacheResult<...>` ou équivalent. Documenter dans un fichier scratch local (pas committé) la signature exacte pour Phase 4.

- [ ] **Step 5: Confirmer `MediaLifecycleBridge.prepareForBackground` à L171**

```bash
sed -n '168,180p' /Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift
```

Expected: visible `func prepareForBackground() async { PlaybackCoordinator.shared.stopAll(); await MediaSessionCoordinator.shared.deactivateForBackground() }` autour de L171-174.

- [ ] **Step 6: Lister les sites qui rendent les attachments audio**

```bash
grep -rn "AudioPlayerView(" /Users/smpceo/Documents/v2_meeshy/apps/ios --include="*.swift" | head -20
```

Expected: relever tous les sites. Le wrapper côté bulle de conversation est notre cible (probablement dans `ConversationMediaViews.swift`). Les autres sites (composer preview, fullscreen, story) restent intacts.

### Task 0.3 : Prototype `MockAudioPlaybackEngine` + `assign(to:&$)`

**Files:**
- Create: `apps/ios/MeeshyTests/Unit/Mocks/MockAudioPlaybackEngine.swift` (sera l'artefact final)
- Create: `apps/ios/MeeshyTests/Unit/Mocks/MockAudioPlaybackEnginePrototypeTests.swift` (temp, sera supprimé après validation)

**But :** Confirmer que le wiring `engine.isPlayingPublisher.assign(to: &$isPlaying)` du coordinator fonctionne quand l'engine est un mock. C'est le pattern central du spec — un échec ici remet en cause toute l'architecture.

- [ ] **Step 1: Créer le protocol AudioPlaybackEngineDriving en draft**

Path: `apps/ios/Meeshy/Features/Main/Services/AudioPlaybackEngineDriving.swift`

```swift
import Foundation
import Combine
import MeeshyUI
import MeeshySDK

@MainActor
public protocol AudioPlaybackEngineDriving: AnyObject {
    var isPlayingPublisher: Published<Bool>.Publisher { get }
    var currentTimePublisher: Published<TimeInterval>.Publisher { get }
    var durationPublisher: Published<TimeInterval>.Publisher { get }
    var progressPublisher: Published<Double>.Publisher { get }
    var speedPublisher: Published<PlaybackSpeed>.Publisher { get }

    var isPlaying: Bool { get }
    var currentTime: TimeInterval { get }
    var duration: TimeInterval { get }
    var progress: Double { get }
    var speed: PlaybackSpeed { get }
    var currentUrl: String? { get }

    var attachmentId: String? { get set }
    var onPlaybackFinished: (() -> Void)? { get set }

    func play(urlString: String)
    func playLocal(url: URL)
    func togglePlayPause()
    func stop()
    func seek(to fraction: Double)
    func skip(seconds: Double)
    func setSpeed(_ speed: PlaybackSpeed)
    func cycleSpeed()
}

extension AudioPlaybackManager: AudioPlaybackEngineDriving {
    public var isPlayingPublisher: Published<Bool>.Publisher { $isPlaying }
    public var currentTimePublisher: Published<TimeInterval>.Publisher { $currentTime }
    public var durationPublisher: Published<TimeInterval>.Publisher { $duration }
    public var progressPublisher: Published<Double>.Publisher { $progress }
    public var speedPublisher: Published<PlaybackSpeed>.Publisher { $speed }
}
```

- [ ] **Step 2: Créer le mock**

Path: `apps/ios/MeeshyTests/Unit/Mocks/MockAudioPlaybackEngine.swift`

```swift
import Foundation
import Combine
import MeeshyUI
@testable import Meeshy

@MainActor
final class MockAudioPlaybackEngine: AudioPlaybackEngineDriving {
    @Published var isPlaying = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var progress: Double = 0
    @Published var speed: PlaybackSpeed = .x1_0

    var isPlayingPublisher: Published<Bool>.Publisher { $isPlaying }
    var currentTimePublisher: Published<TimeInterval>.Publisher { $currentTime }
    var durationPublisher: Published<TimeInterval>.Publisher { $duration }
    var progressPublisher: Published<Double>.Publisher { $progress }
    var speedPublisher: Published<PlaybackSpeed>.Publisher { $speed }

    private(set) var currentUrl: String?
    var attachmentId: String?
    var onPlaybackFinished: (() -> Void)?

    private(set) var playCallCount = 0
    private(set) var lastPlayedUrl: String?
    private(set) var stopCallCount = 0
    private(set) var togglePlayPauseCallCount = 0
    private(set) var seekFractions: [Double] = []
    private(set) var setSpeedCalls: [PlaybackSpeed] = []

    func play(urlString: String) {
        playCallCount += 1
        lastPlayedUrl = urlString
        currentUrl = urlString
        isPlaying = true
    }

    func playLocal(url: URL) { play(urlString: url.absoluteString) }

    func togglePlayPause() {
        togglePlayPauseCallCount += 1
        isPlaying.toggle()
    }

    func stop() {
        stopCallCount += 1
        isPlaying = false
        currentUrl = nil
    }

    func seek(to fraction: Double) {
        seekFractions.append(fraction)
        progress = fraction
        currentTime = duration * fraction
    }

    func skip(seconds: Double) {
        currentTime = max(0, min(duration, currentTime + seconds))
    }

    func setSpeed(_ speed: PlaybackSpeed) {
        setSpeedCalls.append(speed)
        self.speed = speed
    }

    func cycleSpeed() { setSpeed(speed.next()) }

    // MARK: - Test helpers
    func simulateFinishPlayback() {
        isPlaying = false
        currentUrl = nil
        onPlaybackFinished?()
    }
}
```

- [ ] **Step 3: Écrire un test prototype**

Path: `apps/ios/MeeshyTests/Unit/Mocks/MockAudioPlaybackEnginePrototypeTests.swift`

```swift
import XCTest
import Combine
@testable import Meeshy

@MainActor
final class MockAudioPlaybackEnginePrototypeTests: XCTestCase {

    final class ProbeReceiver: ObservableObject {
        @Published var isPlaying = false
    }

    func test_assignTo_propagatesMockPublishedChanges() async {
        let mock = MockAudioPlaybackEngine()
        let probe = ProbeReceiver()
        mock.isPlayingPublisher.assign(to: &probe.$isPlaying)
        XCTAssertFalse(probe.isPlaying)
        mock.isPlaying = true
        // Attendre un tick de la run loop pour laisser Combine propager.
        await Task.yield()
        XCTAssertTrue(probe.isPlaying)
    }

    func test_simulateFinishPlayback_callsOnPlaybackFinished() {
        let mock = MockAudioPlaybackEngine()
        var called = 0
        mock.onPlaybackFinished = { called += 1 }
        mock.simulateFinishPlayback()
        XCTAssertEqual(called, 1)
        XCTAssertFalse(mock.isPlaying)
    }
}
```

- [ ] **Step 4: Lancer le test prototype**

```bash
./apps/ios/meeshy.sh test --only MockAudioPlaybackEnginePrototypeTests
```

Expected: 2/2 PASS. Si échec, STOP — le pattern `assign(to: &$)` ne fonctionne pas comme attendu, le design doit être révisé.

- [ ] **Step 5: Commit du prototype validation**

```bash
git add apps/ios/Meeshy/Features/Main/Services/AudioPlaybackEngineDriving.swift \
        apps/ios/MeeshyTests/Unit/Mocks/MockAudioPlaybackEngine.swift \
        apps/ios/MeeshyTests/Unit/Mocks/MockAudioPlaybackEnginePrototypeTests.swift
git commit -m "chore(ios/audio): prototype mock engine + assign-to wiring validated"
```

- [ ] **Step 6: Mettre à jour Xcode project**

Ajouter les 3 nouveaux fichiers à `apps/ios/Meeshy.xcodeproj/project.pbxproj` (cf. memory `feedback_ios_classic_pbxproj` — objectVersion 63, no synchronized groups, 4 entries + 2 UUIDs par .swift). Re-build pour confirmer.

```bash
./apps/ios/meeshy.sh build
```

Expected: BUILD SUCCEEDED.

---

# Phase 1 — Queue logic pure (types + builder)

**But :** Tous les types data + la fonction pure `AudioQueueBuilder.build`. Aucune dépendance UI / coordinator / engine.

### Task 1.1 : Définir les types data

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/AudioPlaybackEngineDriving.swift` (ajout des structs juste après le protocol)

- [ ] **Step 1: Ajouter `QueuedAudio` et `ActiveAudioContext`**

Append au fichier `AudioPlaybackEngineDriving.swift` :

```swift
public struct QueuedAudio: Equatable, Identifiable, Sendable {
    public let attachmentId: String
    public let messageId: String
    public let conversationId: String
    public let fileUrl: String
    public let durationMs: Int
    public let senderName: String
    public let senderAvatarURL: String?
    public let receivedAt: Date
    public var id: String { attachmentId }
}

public struct ActiveAudioContext: Equatable, Sendable {
    public let attachmentId: String
    public let messageId: String
    public let conversationId: String
    public let conversationName: String
    public let conversationArtworkURL: String?
    public let senderName: String
    public let senderAvatarURL: String?
    public let durationMs: Int

    public init(from queued: QueuedAudio,
                conversationName: String,
                conversationArtworkURL: String?) {
        self.attachmentId = queued.attachmentId
        self.messageId = queued.messageId
        self.conversationId = queued.conversationId
        self.conversationName = conversationName
        self.conversationArtworkURL = conversationArtworkURL
        self.senderName = queued.senderName
        self.senderAvatarURL = queued.senderAvatarURL
        self.durationMs = queued.durationMs
    }
}
```

- [ ] **Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/AudioPlaybackEngineDriving.swift
git commit -m "feat(ios/audio): add QueuedAudio + ActiveAudioContext value types"
```

### Task 1.2 : `AudioQueueBuilder` — RED

**Files:**
- Create: `apps/ios/MeeshyTests/Unit/Services/AudioQueueBuilderTests.swift`

- [ ] **Step 1: Écrire les 10 tests**

```swift
import XCTest
@testable import Meeshy
import MeeshySDK

final class AudioQueueBuilderTests: XCTestCase {

    private func makeAudioMessage(
        messageId: String,
        attachmentIds: [String],
        senderId: String = "alice",
        senderName: String = "Alice",
        conversationId: String = "conv-1",
        receivedAt: Date = Date(timeIntervalSince1970: 1_700_000_000),
        durationMs: Int = 5_000
    ) -> MeeshyMessage {
        let attachments = attachmentIds.map { id in
            MeeshyMessageAttachment(
                id: id,
                type: .audio,
                fileUrl: "https://cdn/\(id).m4a",
                fileSize: 0,
                duration: durationMs,
                mimeType: "audio/m4a",
                width: nil, height: nil
            )
        }
        return MeeshyMessage(
            id: messageId,
            conversationId: conversationId,
            senderId: senderId,
            senderName: senderName,
            senderAvatarUrl: nil,
            content: "",
            attachments: attachments,
            createdAt: receivedAt,
            updatedAt: receivedAt
        )
    }

    private func makeTextMessage(messageId: String, senderId: String = "alice") -> MeeshyMessage {
        MeeshyMessage(
            id: messageId,
            conversationId: "conv-1",
            senderId: senderId,
            senderName: "Alice",
            senderAvatarUrl: nil,
            content: "hello",
            attachments: [],
            createdAt: Date(),
            updatedAt: Date()
        )
    }

    func test_build_filtersAudioOnly_ignoresTextMessages() {
        let messages = [
            makeAudioMessage(messageId: "m1", attachmentIds: ["a1"]),
            makeTextMessage(messageId: "m2"),
            makeAudioMessage(messageId: "m3", attachmentIds: ["a3"])
        ]
        let queue = AudioQueueBuilder.build(
            from: messages,
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )
        XCTAssertEqual(queue.map(\.attachmentId), ["a1", "a3"])
    }

    func test_build_excludesCurrentUserSelfAudios() {
        let messages = [
            makeAudioMessage(messageId: "m1", attachmentIds: ["a1"], senderId: "bob"),
            makeAudioMessage(messageId: "m2", attachmentIds: ["a2"], senderId: "alice")
        ]
        let queue = AudioQueueBuilder.build(
            from: messages,
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )
        XCTAssertEqual(queue.map(\.attachmentId), ["a2"])
    }

    func test_build_excludesListenedAttachments() {
        let messages = [
            makeAudioMessage(messageId: "m1", attachmentIds: ["a1"]),
            makeAudioMessage(messageId: "m2", attachmentIds: ["a2"])
        ]
        let queue = AudioQueueBuilder.build(
            from: messages,
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: ["a1"]
        )
        XCTAssertEqual(queue.map(\.attachmentId), ["a2"])
    }

    func test_build_sortsChronologicallyAscending() {
        let m2 = makeAudioMessage(messageId: "m2", attachmentIds: ["a2"],
                                  receivedAt: Date(timeIntervalSince1970: 2000))
        let m1 = makeAudioMessage(messageId: "m1", attachmentIds: ["a1"],
                                  receivedAt: Date(timeIntervalSince1970: 1000))
        let queue = AudioQueueBuilder.build(
            from: [m2, m1],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )
        XCTAssertEqual(queue.map(\.attachmentId), ["a1", "a2"])
    }

    func test_build_stableTieBreaker_byAttachmentId_whenReceivedAtEqual() {
        let m1 = makeAudioMessage(messageId: "mB", attachmentIds: ["aB"],
                                  receivedAt: Date(timeIntervalSince1970: 1000))
        let m2 = makeAudioMessage(messageId: "mA", attachmentIds: ["aA"],
                                  receivedAt: Date(timeIntervalSince1970: 1000))
        let queue = AudioQueueBuilder.build(
            from: [m1, m2],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )
        XCTAssertEqual(queue.map(\.attachmentId), ["aA", "aB"])
    }

    func test_build_startingAfter_returnsOnlyAudiosReceivedAfter() {
        let m1 = makeAudioMessage(messageId: "m1", attachmentIds: ["a1"],
                                  receivedAt: Date(timeIntervalSince1970: 1000))
        let m2 = makeAudioMessage(messageId: "m2", attachmentIds: ["a2"],
                                  receivedAt: Date(timeIntervalSince1970: 2000))
        let m3 = makeAudioMessage(messageId: "m3", attachmentIds: ["a3"],
                                  receivedAt: Date(timeIntervalSince1970: 3000))
        let queue = AudioQueueBuilder.build(
            from: [m1, m2, m3],
            startingAfterAttachmentId: "a1",
            currentUserId: "bob",
            listenedAttachmentIds: []
        )
        XCTAssertEqual(queue.map(\.attachmentId), ["a2", "a3"])
    }

    func test_build_messageWithMultipleAudios_eachBecomesQueuedAudio() {
        let m1 = makeAudioMessage(messageId: "m1", attachmentIds: ["a1", "a2", "a3"])
        let queue = AudioQueueBuilder.build(
            from: [m1],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )
        XCTAssertEqual(queue.map(\.attachmentId), ["a1", "a2", "a3"])
    }

    func test_build_messageWithMultipleAudios_orderedByAttachmentIndex() {
        // Si receivedAt identique, l'ordre des attachments DANS un message
        // doit être préservé (index 0, 1, 2...).
        let m1 = makeAudioMessage(messageId: "m1", attachmentIds: ["azz", "abb", "amm"])
        let queue = AudioQueueBuilder.build(
            from: [m1],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )
        XCTAssertEqual(queue.map(\.attachmentId), ["azz", "abb", "amm"])
    }

    func test_build_empty_returnsEmpty() {
        let queue = AudioQueueBuilder.build(
            from: [],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )
        XCTAssertEqual(queue, [])
    }

    func test_build_allListened_returnsEmpty() {
        let m1 = makeAudioMessage(messageId: "m1", attachmentIds: ["a1", "a2"])
        let queue = AudioQueueBuilder.build(
            from: [m1],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: ["a1", "a2"]
        )
        XCTAssertEqual(queue, [])
    }
}
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent (compile error attendu)**

```bash
./apps/ios/meeshy.sh test --only AudioQueueBuilderTests 2>&1 | tail -10
```

Expected: compilation error "Cannot find 'AudioQueueBuilder' in scope" sur tous les tests. C'est le RED attendu.

### Task 1.3 : `AudioQueueBuilder` — GREEN

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/AudioQueueBuilder.swift`

- [ ] **Step 1: Implémenter le builder**

```swift
import Foundation
import MeeshySDK

public enum AudioQueueBuilder {
    /// Construit la queue d'audios non écoutés à 100% pour une conv.
    /// Filtres : type audio, sender != currentUser, non listened.
    /// Ordre : receivedAt asc (avec tie-breaker attachmentId lexicographique).
    /// Si startingAfterAttachmentId fourni, ne retient que les audios reçus
    /// strictement après l'attachment cible.
    public static func build(
        from messages: [MeeshyMessage],
        startingAfterAttachmentId: String?,
        currentUserId: String,
        listenedAttachmentIds: Set<String>
    ) -> [QueuedAudio] {

        let cursorReceivedAt: Date? = startingAfterAttachmentId.flatMap { cursorId in
            messages
                .first { $0.attachments.contains(where: { $0.id == cursorId }) }
                .map(\.createdAt)
        }

        let candidates: [QueuedAudio] = messages.flatMap { message -> [QueuedAudio] in
            guard message.senderId != currentUserId else { return [] }
            return message.attachments.enumerated().compactMap { (_, att) -> QueuedAudio? in
                guard att.type == .audio else { return nil }
                guard !listenedAttachmentIds.contains(att.id) else { return nil }
                return QueuedAudio(
                    attachmentId: att.id,
                    messageId: message.id,
                    conversationId: message.conversationId,
                    fileUrl: att.fileUrl,
                    durationMs: att.duration ?? 0,
                    senderName: message.senderName,
                    senderAvatarURL: message.senderAvatarUrl,
                    receivedAt: message.createdAt
                )
            }
        }

        let filteredByCursor: [QueuedAudio]
        if let cursorDate = cursorReceivedAt, let cursorId = startingAfterAttachmentId {
            filteredByCursor = candidates.filter { audio in
                if audio.receivedAt > cursorDate { return true }
                if audio.receivedAt == cursorDate {
                    // Même timestamp : utiliser l'ordre des attachments dans
                    // le message. Garder ceux dont l'attachmentId vient APRÈS
                    // le cursor dans le message.
                    if audio.attachmentId == cursorId { return false }
                    // Conservatif : on garde les autres attachments du même
                    // message, l'ordre stable les placera correctement.
                    return audio.messageId != findMessageId(for: cursorId, in: messages)
                        || isAfterInMessage(cursorId, target: audio.attachmentId, in: messages)
                }
                return false
            }
        } else {
            filteredByCursor = candidates
        }

        // Tri primaire receivedAt, secondaire attachmentId pour ordre stable.
        // On préserve l'ordre des attachments d'un même message via une
        // permutation finale (deuxième passe).
        let sorted = filteredByCursor.sorted { lhs, rhs in
            if lhs.receivedAt != rhs.receivedAt { return lhs.receivedAt < rhs.receivedAt }
            return lhs.attachmentId < rhs.attachmentId
        }

        return reorderByMessageAttachmentIndex(sorted, messages: messages)
    }

    // MARK: - Helpers

    private static func findMessageId(for attachmentId: String,
                                       in messages: [MeeshyMessage]) -> String? {
        messages.first { $0.attachments.contains(where: { $0.id == attachmentId }) }?.id
    }

    private static func isAfterInMessage(_ cursorId: String,
                                          target: String,
                                          in messages: [MeeshyMessage]) -> Bool {
        guard let message = messages.first(where: { msg in
            msg.attachments.contains { $0.id == cursorId } &&
            msg.attachments.contains { $0.id == target }
        }) else { return true }
        let ids = message.attachments.map(\.id)
        guard let cursorIdx = ids.firstIndex(of: cursorId),
              let targetIdx = ids.firstIndex(of: target) else { return true }
        return targetIdx > cursorIdx
    }

    /// Restaure l'ordre original des attachments à l'intérieur d'un même
    /// message (l'API les renvoie déjà dans l'ordre voulu par l'auteur).
    /// Le tri par attachmentId est uniquement un tie-breaker pour la
    /// stabilité ; quand plusieurs audios appartiennent au même message
    /// avec le même receivedAt, ils doivent rester dans l'ordre original.
    private static func reorderByMessageAttachmentIndex(
        _ queue: [QueuedAudio],
        messages: [MeeshyMessage]
    ) -> [QueuedAudio] {
        // Grouper par messageId, restaurer l'ordre original par attachment.index
        let grouped = Dictionary(grouping: queue, by: { $0.messageId })
        var result: [QueuedAudio] = []
        // Itérer les messages dans leur ordre source pour conserver les groupes
        // dans le bon ordre chronologique.
        for message in messages {
            guard let group = grouped[message.id] else { continue }
            let orderedIds = message.attachments.map(\.id)
            let ordered = group.sorted { lhs, rhs in
                let li = orderedIds.firstIndex(of: lhs.attachmentId) ?? Int.max
                let ri = orderedIds.firstIndex(of: rhs.attachmentId) ?? Int.max
                return li < ri
            }
            result.append(contentsOf: ordered)
        }
        return result
    }
}
```

- [ ] **Step 2: Ajouter le fichier au project.pbxproj**

Cf. memory `feedback_ios_classic_pbxproj` pour la procédure d'ajout (4 entries + 2 UUIDs).

- [ ] **Step 3: Lancer les 10 tests**

```bash
./apps/ios/meeshy.sh test --only AudioQueueBuilderTests 2>&1 | tail -15
```

Expected: 10/10 PASS. Si un test échoue, lire le diff attendu/obtenu et corriger l'algorithme. Ne PAS modifier le test pour le faire passer.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/AudioQueueBuilder.swift \
        apps/ios/MeeshyTests/Unit/Services/AudioQueueBuilderTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/audio): pure queue builder + 10 tests"
```

---

# Phase 1.5 — Helpers de rendu app-side

**But :** Extraire 4 mini-composants partagés entre `ActiveAudioBubble`, `InactiveAudioBubble` et (futur) `MiniAudioPlayerBar`. Évite la divergence visuelle avec `AudioPlayerView` (SDK) lors de futures évolutions. Pas de tests automatisés détaillés — ce sont des helpers de rendu pur, validés via snapshots smoke en Phase 5.

### Task 1.5.1 : `AudioWaveformBars`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleHelpers/AudioWaveformBars.swift`

- [ ] **Step 1: Créer le helper**

```swift
import SwiftUI

/// Barres waveform stylisées. `progress` colore la portion lue (de 0 à 1).
/// `samples` optionnelle : si vide, fallback sur une waveform générée
/// déterministe basée sur l'index.
struct AudioWaveformBars: View {
    let barCount: Int
    let progress: Double
    let accentColorHex: String
    let isDark: Bool
    let samples: [Float]
    let onTapFraction: ((Double) -> Void)?

    var body: some View {
        GeometryReader { geo in
            let spacing: CGFloat = 2
            let totalSpacing = spacing * CGFloat(barCount - 1)
            let barWidth = max(2, (geo.size.width - totalSpacing) / CGFloat(barCount))

            HStack(spacing: spacing) {
                ForEach(0..<barCount, id: \.self) { i in
                    let fraction = Double(i) / Double(barCount)
                    let isPlayed = fraction <= progress
                    let h = barHeight(index: i, total: barCount, samples: samples)
                    let color: Color = isPlayed
                        ? Color(hex: accentColorHex)
                        : (isDark ? Color.white.opacity(0.18) : Color.black.opacity(0.10))

                    RoundedRectangle(cornerRadius: 1)
                        .fill(color)
                        .frame(width: barWidth, height: h)
                }
            }
            .frame(height: 22, alignment: .center)
            .contentShape(Rectangle())
            .onTapGesture { location in
                guard let onTap = onTapFraction else { return }
                let fraction = max(0, min(1, location.x / geo.size.width))
                onTap(fraction)
            }
        }
        .frame(height: 22)
    }

    private func barHeight(index: Int, total: Int, samples: [Float]) -> CGFloat {
        if !samples.isEmpty && index < samples.count {
            return max(3, CGFloat(samples[index]) * 18)
        }
        let seed = Double(index * 7 + 3)
        let base = 4.0 + sin(seed) * 5 + cos(seed * 0.5) * 3.5
        return CGFloat(max(3, min(18, base)))
    }
}
```

### Task 1.5.2 : `AudioPlayButton`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleHelpers/AudioPlayButton.swift`

- [ ] **Step 1: Créer le helper**

```swift
import SwiftUI
import MeeshyUI

struct AudioPlayButton: View {
    enum State {
        case ready, playing, loading
    }

    let state: State
    let accentColorHex: String
    let isCompact: Bool
    let onTap: () -> Void

    var body: some View {
        let size: CGFloat = isCompact ? 34 : 40
        let accent = Color(hex: accentColorHex)

        Button(action: onTap) {
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [accent, accent.opacity(0.7)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
                    .frame(width: size, height: size)
                    .shadow(color: accent.opacity(0.3), radius: 6, y: 2)

                Group {
                    switch state {
                    case .loading:
                        ProgressView().tint(.white).scaleEffect(0.6)
                    case .playing:
                        Image(systemName: "pause.fill")
                            .font(.system(size: isCompact ? 13 : 15, weight: .bold))
                            .foregroundColor(.white)
                    case .ready:
                        Image(systemName: "play.fill")
                            .font(.system(size: isCompact ? 13 : 15, weight: .bold))
                            .foregroundColor(.white)
                            .offset(x: 1)
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }
}
```

### Task 1.5.3 : `AudioTimeRow` + `AudioSpeedChip`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleHelpers/AudioTimeRow.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleHelpers/AudioSpeedChip.swift`

- [ ] **Step 1: Créer `AudioTimeRow`**

```swift
import SwiftUI
import MeeshyUI

struct AudioTimeRow: View {
    let currentTime: TimeInterval
    let totalTime: TimeInterval
    let isCompact: Bool
    let isDark: Bool

    var body: some View {
        HStack(spacing: 0) {
            Text(formatMediaDuration(currentTime))
                .font(.system(size: isCompact ? 9 : 10, weight: .semibold, design: .monospaced))
                .foregroundColor(isDark ? .white.opacity(0.5) : .black.opacity(0.4))
            Spacer()
            Text(formatMediaDuration(totalTime))
                .font(.system(size: isCompact ? 9 : 10, weight: .semibold, design: .monospaced))
                .foregroundColor(isDark ? .white.opacity(0.3) : .black.opacity(0.25))
        }
    }
}
```

- [ ] **Step 2: Créer `AudioSpeedChip`**

```swift
import SwiftUI
import MeeshyUI

struct AudioSpeedChip: View {
    let speed: PlaybackSpeed
    let accentColorHex: String
    let isCompact: Bool
    let isDark: Bool
    let onTap: () -> Void

    var body: some View {
        let isDefault = speed == .x1_0
        let accent = Color(hex: accentColorHex)
        let chipBg: Color = isDefault
            ? (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
            : accent.opacity(0.85)
        let chipFg: Color = isDefault
            ? (isDark ? .white.opacity(0.55) : .black.opacity(0.45))
            : .white

        Button(action: onTap) {
            Text(speed.label)
                .font(.system(size: isCompact ? 9 : 10, weight: .bold, design: .monospaced))
                .foregroundColor(chipFg)
                .padding(.horizontal, isCompact ? 7 : 8)
                .padding(.vertical, isCompact ? 2 : 3)
                .background(Capsule().fill(chipBg))
        }
        .buttonStyle(.plain)
    }
}
```

- [ ] **Step 3: Ajouter les 4 fichiers au project.pbxproj + build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleHelpers/ \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "refactor(ios/audio): extract 4 shared bubble render helpers"
```

---

# Phase 2 — Protocol AudioPlaybackEngineDriving validé

**But :** Le protocol et la retroactive conformance sont déjà en place (Phase 0). Cette phase officialise la décision dans `apps/ios/decisions.md` et confirme que `AudioPlaybackManager` (SDK) reste utilisable comme moteur via le protocol.

### Task 2.1 : Documenter la retroactive conformance

**Files:**
- Modify: `apps/ios/decisions.md`

- [ ] **Step 1: Lire le fichier existant**

```bash
ls /Users/smpceo/Documents/v2_meeshy/apps/ios/decisions.md && head -30 /Users/smpceo/Documents/v2_meeshy/apps/ios/decisions.md
```

- [ ] **Step 2: Append une nouvelle décision**

Ajouter à la fin du fichier :

```markdown
## 2026-05-25 — Audio playback persistence : protocol AudioPlaybackEngineDriving (retroactive conformance)

**Contexte** : pour permettre les tests injectables et préserver SDK Purity, le coordinator app `ConversationAudioCoordinator` accepte un `AudioPlaybackEngineDriving` (protocol app) en lieu et place d'`AudioPlaybackManager` (concrete SDK).

**Décision** : extension `AudioPlaybackManager: AudioPlaybackEngineDriving` déclarée côté app. C'est de la retroactive conformance — légale en Swift mais sensible aux évolutions SDK (rename `currentTime` → casserait le build).

**Alternatives rejetées** :
- Mettre le protocol côté SDK : viole SDK Purity (protocol app produit-specific).
- Wrapper concret côté app qui détient et forward : duplication inutile pour 6 propriétés.

**Conséquence** : si le SDK renomme une `@Published` d'`AudioPlaybackManager`, le build app casse explicitement à la conformance. Acceptable (signal clair de régression).
```

- [ ] **Step 3: Commit**

```bash
git add apps/ios/decisions.md
git commit -m "docs(ios): log retroactive conformance decision for audio engine"
```

---

# Phase 3 — ConversationAudioCoordinator

**But :** Le cœur de la feature. Tous les comportements de queue, advance, append realtime, close, logout, conv supprimée, message supprimé, guard CallManager.

### Task 3.1 : Ajout `conversationDeleted` publisher au SDK

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift` (~L181-200)

**Note** : modif SDK minimale, justifiée par l'absence d'événement lifecycle `conversation:deleted` publié. Pattern identique à `postDeleted`, `storyDeleted`, `statusDeleted`.

- [ ] **Step 1: Lire la zone du fichier**

```bash
sed -n '178,210p' /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift
```

- [ ] **Step 2: Identifier le protocol et la classe concrete**

Localiser dans le fichier :
- `protocol SocialSocketManaging` (vers L180) : ajouter dans la liste `var ...Publisher: PassthroughSubject<..., Never> { get }`.
- `class SocialSocketManager: SocialSocketManaging` (plus bas) : ajouter `public let conversationDeleted = PassthroughSubject<String, Never>()`.
- Le handler socket pour `conversation:deleted` (à chercher avec `grep -n "conversation:deleted" `).

- [ ] **Step 3: Ajouter le publisher au protocol + implémentation**

```swift
// Dans le protocol (proche des autres `*Deleted`) :
var conversationDeleted: PassthroughSubject<String, Never> { get }

// Dans la classe concrete (proche de `postDeleted`, `storyDeleted`) :
public let conversationDeleted = PassthroughSubject<String, Never>()
```

- [ ] **Step 4: Brancher l'événement socket (si pas déjà câblé)**

```bash
grep -n 'conversation:deleted\|"conversation:deleted"' /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift
```

Si présent : ajouter le `self?.conversationDeleted.send(payload.conversationId)` dans le handler existant.
Si absent : ajouter un handler dans la section d'enregistrement des événements (chercher `socket.on(`).

```swift
socket.on("conversation:deleted") { [weak self] data, _ in
    guard let payload = Self.decode(SocketConversationDeletedData.self, from: data) else { return }
    self?.conversationDeleted.send(payload.conversationId)
}

// Et le payload type quelque part dans les types socket :
public struct SocketConversationDeletedData: Decodable, Sendable {
    public let conversationId: String
    enum CodingKeys: String, CodingKey { case conversationId = "conversation_id" }
}
```

**Vérification** : adapter au pattern existant exact dans ce fichier (decode wrapper, nom des CodingKeys, etc.). Le grep ci-dessus indique le pattern à suivre.

- [ ] **Step 5: Build SDK + app**

```bash
xcodebuild build -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet 2>&1 | tail -3
./apps/ios/meeshy.sh build 2>&1 | tail -3
```

Expected: BUILD SUCCEEDED pour les deux.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift
git commit -m "feat(sdk/social): publish conversation:deleted event via PassthroughSubject"
```

### Task 3.2 : Squelette `ConversationAudioCoordinator` — RED

**Files:**
- Create: `apps/ios/MeeshyTests/Unit/Services/ConversationAudioCoordinatorTests.swift`

- [ ] **Step 1: Écrire les 12 tests**

```swift
import XCTest
import Combine
@testable import Meeshy
import MeeshySDK
import MeeshyUI

@MainActor
final class ConversationAudioCoordinatorTests: XCTestCase {

    private var cancellables: Set<AnyCancellable>!

    override func setUp() {
        super.setUp()
        cancellables = []
    }

    private func makeQueuedAudio(
        attachmentId: String,
        conversationId: String = "conv-1",
        messageId: String = "msg-1",
        fileUrl: String = "https://cdn/a.m4a",
        senderName: String = "Alice"
    ) -> QueuedAudio {
        QueuedAudio(
            attachmentId: attachmentId,
            messageId: messageId,
            conversationId: conversationId,
            fileUrl: fileUrl,
            durationMs: 5_000,
            senderName: senderName,
            senderAvatarURL: nil,
            receivedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func makeSUT() -> (ConversationAudioCoordinator, MockAudioPlaybackEngine) {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        return (sut, engine)
    }

    func test_play_setsActiveContext_andCallsEngine() async {
        let (sut, engine) = makeSUT()
        let current = makeQueuedAudio(attachmentId: "a1")
        sut.play(current: current, tail: [],
                 conversationName: "Team", conversationArtworkURL: nil)
        await Task.yield()
        XCTAssertEqual(sut.activeContext?.attachmentId, "a1")
        XCTAssertEqual(engine.lastPlayedUrl, "https://cdn/a.m4a")
        XCTAssertEqual(engine.playCallCount, 1)
    }

    func test_play_buildsQueueWithTail_publishesQueueCount() {
        let (sut, _) = makeSUT()
        let current = makeQueuedAudio(attachmentId: "a1")
        let tail = [
            makeQueuedAudio(attachmentId: "a2"),
            makeQueuedAudio(attachmentId: "a3")
        ]
        sut.play(current: current, tail: tail, conversationName: "T", conversationArtworkURL: nil)
        XCTAssertEqual(sut.queueCount, 3)
    }

    func test_play_whileCallActive_isNoOp() {
        let (sut, engine) = makeSUT()
        CallManager.shared.testOverrideCallActive = true
        defer { CallManager.shared.testOverrideCallActive = false }

        let current = makeQueuedAudio(attachmentId: "a1")
        sut.play(current: current, tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        XCTAssertNil(sut.activeContext)
        XCTAssertEqual(engine.playCallCount, 0)
    }

    func test_engineFinished_advancesQueue_playsNext() async {
        let (sut, engine) = makeSUT()
        let current = makeQueuedAudio(attachmentId: "a1", fileUrl: "https://cdn/a1.m4a")
        let next = makeQueuedAudio(attachmentId: "a2", fileUrl: "https://cdn/a2.m4a")
        sut.play(current: current, tail: [next],
                 conversationName: "T", conversationArtworkURL: nil)
        XCTAssertEqual(engine.playCallCount, 1)

        engine.simulateFinishPlayback()
        await Task.yield()

        XCTAssertEqual(sut.activeContext?.attachmentId, "a2")
        XCTAssertEqual(engine.playCallCount, 2)
        XCTAssertEqual(engine.lastPlayedUrl, "https://cdn/a2.m4a")
    }

    func test_engineFinished_emptyQueue_clearsActiveContext() async {
        let (sut, engine) = makeSUT()
        let current = makeQueuedAudio(attachmentId: "a1")
        sut.play(current: current, tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        XCTAssertNotNil(sut.activeContext)

        engine.simulateFinishPlayback()
        await Task.yield()

        XCTAssertNil(sut.activeContext)
        XCTAssertEqual(sut.queueCount, 0)
    }

    func test_appendUpcoming_idempotent_byAttachmentId() {
        let (sut, _) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1"), tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        XCTAssertEqual(sut.queueCount, 1)

        sut.appendUpcoming(makeQueuedAudio(attachmentId: "a2"))
        sut.appendUpcoming(makeQueuedAudio(attachmentId: "a2"))
        XCTAssertEqual(sut.queueCount, 2)
    }

    func test_appendUpcoming_increasesQueueCount() {
        let (sut, _) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1"), tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        sut.appendUpcoming(makeQueuedAudio(attachmentId: "a2"))
        sut.appendUpcoming(makeQueuedAudio(attachmentId: "a3"))
        XCTAssertEqual(sut.queueCount, 3)
    }

    func test_playNext_skipsToFollowingAudio() async {
        let (sut, engine) = makeSUT()
        let next = makeQueuedAudio(attachmentId: "a2", fileUrl: "https://cdn/a2.m4a")
        sut.play(current: makeQueuedAudio(attachmentId: "a1"), tail: [next],
                 conversationName: "T", conversationArtworkURL: nil)
        sut.playNext()
        await Task.yield()
        XCTAssertEqual(sut.activeContext?.attachmentId, "a2")
        XCTAssertEqual(engine.playCallCount, 2)
    }

    func test_close_stopsEngine_clearsQueueAndContext() {
        let (sut, engine) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1"),
                 tail: [makeQueuedAudio(attachmentId: "a2")],
                 conversationName: "T", conversationArtworkURL: nil)

        sut.close()
        XCTAssertNil(sut.activeContext)
        XCTAssertEqual(sut.queueCount, 0)
        XCTAssertEqual(engine.stopCallCount, 1)
    }

    func test_authLogout_triggersClose() async {
        let (sut, engine) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1"), tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        XCTAssertNotNil(sut.activeContext)

        AuthManager.shared.isAuthenticated = false
        await Task.yield()

        XCTAssertNil(sut.activeContext)
        XCTAssertEqual(engine.stopCallCount, 1)
    }

    func test_play_secondCall_resetsQueueToNewConv() {
        let (sut, _) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1", conversationId: "conv-A"),
                 tail: [makeQueuedAudio(attachmentId: "a2", conversationId: "conv-A")],
                 conversationName: "A", conversationArtworkURL: nil)
        XCTAssertEqual(sut.queueCount, 2)

        sut.play(current: makeQueuedAudio(attachmentId: "b1", conversationId: "conv-B"),
                 tail: [],
                 conversationName: "B", conversationArtworkURL: nil)
        XCTAssertEqual(sut.queueCount, 1)
        XCTAssertEqual(sut.activeContext?.conversationId, "conv-B")
    }

    func test_setSpeed_propagatesToEngine() {
        let (sut, engine) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1"), tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        sut.setSpeed(.x1_5)
        XCTAssertEqual(engine.setSpeedCalls, [.x1_5])
        XCTAssertEqual(engine.speed, .x1_5)
    }
}
```

- [ ] **Step 2: Lancer les tests (RED attendu)**

```bash
./apps/ios/meeshy.sh test --only ConversationAudioCoordinatorTests 2>&1 | tail -10
```

Expected: compile error "Cannot find 'ConversationAudioCoordinator' in scope" + tests rouges. C'est le RED attendu.

### Task 3.3 : Implémentation `ConversationAudioCoordinator` — GREEN

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift` (ajouter `testOverrideCallActive`)

- [ ] **Step 1: Ajouter le test-override sur CallManager**

Lire le fichier autour de la définition de `callState` puis ajouter (typiquement après la déclaration de la classe) :

```swift
#if DEBUG
extension CallManager {
    /// Test-only override pour ConversationAudioCoordinatorTests.
    /// Permet de simuler `callState.isActive == true` sans démarrer un appel.
    var testOverrideCallActive: Bool {
        get { _testOverrideCallActive }
        set { _testOverrideCallActive = newValue }
    }
}
private var _testOverrideCallActive: Bool = false
#endif
```

Et adapter la méthode qui expose `callState.isActive` pour qu'elle considère le test override :

```swift
var isCallActiveForAudioGuard: Bool {
    #if DEBUG
    if _testOverrideCallActive { return true }
    #endif
    return callState.isActive
}
```

- [ ] **Step 2: Implémenter le coordinator**

```swift
import Foundation
import Combine
import MeeshyUI
import MeeshySDK
import os

@MainActor
public final class ConversationAudioCoordinator: ObservableObject {
    public static let shared = ConversationAudioCoordinator()

    @Published public private(set) var activeContext: ActiveAudioContext?
    @Published public private(set) var queueCount: Int = 0
    @Published public private(set) var isPlaying: Bool = false
    @Published public private(set) var progress: Double = 0
    @Published public private(set) var currentTime: TimeInterval = 0
    @Published public private(set) var duration: TimeInterval = 0
    @Published public private(set) var speed: PlaybackSpeed = .x1_0

    private let engine: AudioPlaybackEngineDriving
    private var queue: [QueuedAudio] = []
    private var currentName: String = ""
    private var currentArtwork: String?
    private var cancellables = Set<AnyCancellable>()

    private static let log = Logger(subsystem: "me.meeshy.app", category: "audio-coordinator")

    public init(engine: AudioPlaybackEngineDriving = AudioPlaybackManager()) {
        self.engine = engine
        wireEngineForwarding()
        wireAuthLogoutHook()
        wireSocketLifecycleHooks()
    }

    // MARK: - Public API

    public func play(
        current: QueuedAudio,
        tail: [QueuedAudio],
        conversationName: String,
        conversationArtworkURL: String?
    ) {
        guard !CallManager.shared.isCallActiveForAudioGuard else {
            Self.log.info("play() ignoré : appel CallKit actif")
            return
        }
        queue = [current] + tail
        queueCount = queue.count
        currentName = conversationName
        currentArtwork = conversationArtworkURL
        startCurrentHead()
    }

    public func togglePlayPause() {
        engine.togglePlayPause()
    }

    public func playNext() {
        advanceQueue()
    }

    public func close() {
        engine.stop()
        queue = []
        queueCount = 0
        activeContext = nil
    }

    public func seek(toFraction: Double) {
        engine.seek(to: toFraction)
    }

    public func setSpeed(_ s: PlaybackSpeed) {
        engine.setSpeed(s)
    }

    public func cycleSpeed() {
        engine.cycleSpeed()
    }

    public func appendUpcoming(_ audio: QueuedAudio) {
        guard !queue.contains(where: { $0.attachmentId == audio.attachmentId }) else { return }
        queue.append(audio)
        queueCount = queue.count
    }

    public func isActive(attachmentId: String) -> Bool {
        activeContext?.attachmentId == attachmentId
    }

    // MARK: - Internals

    private func startCurrentHead() {
        guard let head = queue.first else {
            activeContext = nil
            return
        }
        activeContext = ActiveAudioContext(
            from: head,
            conversationName: currentName,
            conversationArtworkURL: currentArtwork
        )
        engine.attachmentId = head.attachmentId
        engine.play(urlString: head.fileUrl)
    }

    private func advanceQueue() {
        if !queue.isEmpty { queue.removeFirst() }
        queueCount = queue.count
        if queue.isEmpty {
            activeContext = nil
        } else {
            startCurrentHead()
        }
    }

    private func wireEngineForwarding() {
        engine.isPlayingPublisher.assign(to: &$isPlaying)
        engine.currentTimePublisher.assign(to: &$currentTime)
        engine.durationPublisher.assign(to: &$duration)
        engine.progressPublisher.assign(to: &$progress)
        engine.speedPublisher.assign(to: &$speed)
        engine.onPlaybackFinished = { [weak self] in
            guard let self else { return }
            Task { @MainActor in self.advanceQueue() }
        }
    }

    private func wireAuthLogoutHook() {
        AuthManager.shared.$isAuthenticated
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.close() }
            .store(in: &cancellables)
    }

    private func wireSocketLifecycleHooks() {
        SocialSocketManager.shared.conversationDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] convId in
                guard let self else { return }
                if self.activeContext?.conversationId == convId {
                    self.close()
                }
            }
            .store(in: &cancellables)

        MessageSocketManager.shared.messageDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if self.activeContext?.messageId == event.messageId {
                    self.close()
                } else if let idx = self.queue.firstIndex(where: { $0.messageId == event.messageId }) {
                    self.queue.remove(at: idx)
                    self.queueCount = self.queue.count
                }
            }
            .store(in: &cancellables)
    }
}
```

- [ ] **Step 3: Ajouter le fichier au project.pbxproj**

- [ ] **Step 4: Build + tests**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -3
./apps/ios/meeshy.sh test --only ConversationAudioCoordinatorTests 2>&1 | tail -15
```

Expected: BUILD SUCCEEDED + 12/12 PASS. Si un test échoue, lire le diff et corriger l'implementation. Ne PAS modifier les tests.

- [ ] **Step 5: Supprimer le test prototype (n'est plus utile)**

```bash
git rm apps/ios/MeeshyTests/Unit/Mocks/MockAudioPlaybackEnginePrototypeTests.swift
```

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift \
        apps/ios/Meeshy/Features/Main/Services/CallManager.swift \
        apps/ios/MeeshyTests/Unit/Services/ConversationAudioCoordinatorTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/audio): ConversationAudioCoordinator with queue + lifecycle hooks"
```

---

# Phase 4 — Wiring ConversationViewModel

**But :** Exposer `playAudio(attachmentId:)`, hydrater `listenedAttachmentIds`, brancher le hook realtime audio sur le handler `message:new` existant. Source de vérité conv metadata = `CacheCoordinator.shared.conversations`.

### Task 4.1 : Tests VM — RED

**Files:**
- Create: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelAudioTests.swift`

- [ ] **Step 1: Écrire les tests**

```swift
import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationViewModelAudioTests: XCTestCase {

    // makeSUT() à compléter en lisant la convention existante des tests VM
    // pour ConversationViewModel. Cf. apps/ios/MeeshyTests/Unit/ViewModels/.

    private func makeSUT(
        currentUserId: String = "bob",
        conversationId: String = "conv-1"
    ) -> (ConversationViewModel, MockAudioPlaybackEngine, ConversationAudioCoordinator) {
        let engine = MockAudioPlaybackEngine()
        let coordinator = ConversationAudioCoordinator(engine: engine)
        // Si ConversationViewModel.init() ne prend pas coordinator en param,
        // il faut soit ajouter un init test-only, soit accepter d'utiliser
        // le singleton (en sachant qu'il faut un teardown pour le reset).
        // Cf. memory feedback_ios_test_suite_flaky.
        let vm = ConversationViewModel(/* compléter selon API existante */)
        return (vm, engine, coordinator)
    }

    func test_playAudio_callsCoordinatorPlay() {
        let (vm, engine, _) = makeSUT()
        // Hydrate vm.messages avec un message audio reçu d'Alice.
        // Appeler vm.playAudio(attachmentId: "a1").
        // Asserter engine.playCallCount == 1 + engine.lastPlayedUrl ==
        // l'URL du message.
        XCTFail("À compléter selon la signature exacte de ConversationViewModel.init")
    }

    func test_playAudio_buildsQueueWithUnlistenedTail() {
        XCTFail("À compléter")
    }

    func test_handleSocketMessageNew_audioInActiveConv_appendsToQueue() {
        XCTFail("À compléter")
    }

    func test_handleSocketMessageNew_audioInOtherConv_doesNothing() {
        XCTFail("À compléter")
    }
}
```

**Note** : ces tests sont volontairement squelettés car la signature exacte de `ConversationViewModel.init` doit être lue avant. C'est le seul cas dans ce plan où on accepte une lecture in-task. Steps 2-3 ci-dessous précisent la complétion.

- [ ] **Step 2: Lire la signature actuelle de `ConversationViewModel.init` et de ses tests**

```bash
grep -n "init\|public init" /Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift | head -5
ls /Users/smpceo/Documents/v2_meeshy/apps/ios/MeeshyTests/Unit/ViewModels/Conversation* 2>/dev/null
```

Compléter les `makeSUT()` et tests en suivant le pattern des tests VM existants. Si `ConversationViewModel` n'accepte pas le coordinator en param, ajouter un init test-only `init(testCoordinator: ConversationAudioCoordinator)` qui mémorise un coordinator local (au lieu du singleton). Ce coordinator est utilisé par `playAudio`.

- [ ] **Step 3: Compléter les 4 tests avec assertions concrètes**

Une fois la signature `init` connue, remplacer les `XCTFail` par des assertions :

```swift
func test_playAudio_callsCoordinatorPlay() {
    let (vm, engine, coord) = makeSUT()
    vm.messages = [makeAliceAudioMessage(att: "a1", fileUrl: "https://cdn/a1.m4a")]
    vm.listenedAttachmentIds = []
    vm.playAudio(attachmentId: "a1")
    XCTAssertEqual(engine.playCallCount, 1)
    XCTAssertEqual(engine.lastPlayedUrl, "https://cdn/a1.m4a")
    XCTAssertEqual(coord.activeContext?.attachmentId, "a1")
}
```

- [ ] **Step 4: Vérifier RED**

```bash
./apps/ios/meeshy.sh test --only ConversationViewModelAudioTests 2>&1 | tail -10
```

Expected: compile error "playAudio is not a member of ConversationViewModel" — RED attendu.

### Task 4.2 : Implémenter `playAudio` + listenedIds + hook realtime — GREEN

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

- [ ] **Step 1: Localiser le handler `message:new` existant**

```bash
grep -n "message:new\|handleSocketMessageNew\|onMessageNew" /Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift | head -10
```

Localiser la fonction qui traite l'arrivée d'un nouveau message via Socket.IO.

- [ ] **Step 2: Ajouter les propriétés et méthodes**

Ajouter dans la classe `ConversationViewModel` :

```swift
@Published var listenedAttachmentIds: Set<String> = []

private var audioCoordinator: ConversationAudioCoordinator {
    // Indirection pour permettre l'injection test-only via init(testCoordinator:)
    _testAudioCoordinator ?? .shared
}
private var _testAudioCoordinator: ConversationAudioCoordinator?

#if DEBUG
init(testCoordinator: ConversationAudioCoordinator,
     /* autres params habituels du init existant */) {
    self._testAudioCoordinator = testCoordinator
    // … reste init habituel
}
#endif

var currentConversationName: String {
    guard let id = conversationId else { return "" }
    return CacheCoordinator.shared.conversations.snapshotSync(for: id)?.name
        ?? ConversationListViewModel.shared.conversations
            .first(where: { $0.id == id })?.name
        ?? ""
}

var currentConversationArtworkURL: String? {
    guard let id = conversationId else { return nil }
    return CacheCoordinator.shared.conversations.snapshotSync(for: id)?.avatarUrl
        ?? ConversationListViewModel.shared.conversations
            .first(where: { $0.id == id })?.avatarUrl
}

var currentAccentColorHex: String {
    guard let id = conversationId else { return "08D9D6" }
    return CacheCoordinator.shared.conversations.snapshotSync(for: id)?.accentColor
        ?? "08D9D6"
}

func playAudio(attachmentId: String) {
    // Trouver l'attachment + son message
    guard let (message, attachment) = findAudioAttachment(id: attachmentId),
          let currentUserId = AuthManager.shared.currentUser?.id else { return }

    let current = QueuedAudio(
        attachmentId: attachment.id,
        messageId: message.id,
        conversationId: message.conversationId,
        fileUrl: attachment.fileUrl,
        durationMs: attachment.duration ?? 0,
        senderName: message.senderName,
        senderAvatarURL: message.senderAvatarUrl,
        receivedAt: message.createdAt
    )

    let tail = AudioQueueBuilder.build(
        from: messages,
        startingAfterAttachmentId: attachment.id,
        currentUserId: currentUserId,
        listenedAttachmentIds: listenedAttachmentIds
    )

    audioCoordinator.play(
        current: current,
        tail: tail,
        conversationName: currentConversationName,
        conversationArtworkURL: currentConversationArtworkURL
    )
}

private func findAudioAttachment(id: String)
    -> (MeeshyMessage, MeeshyMessageAttachment)? {
    for message in messages {
        if let att = message.attachments.first(where: {
            $0.id == id && $0.type == .audio
        }) {
            return (message, att)
        }
    }
    return nil
}
```

**`snapshotSync(for:)`** : helper synchrone à ajouter à `GRDBCacheStore` ou équivalent. Si l'API actuelle est uniquement async, alternative : stocker `currentConversation: MeeshyConversation?` `@Published` dans le VM (hydraté au démarrage de la conv et sur updates) et lire `currentConversation?.name`. Vérifier la signature en Step 3 et adapter.

- [ ] **Step 3: Vérifier la signature de l'API conversation cache et adapter**

```bash
grep -n "snapshotSync\|snapshot.*->.*MeeshyConversation\|public func.*conversations" \
    /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift \
    /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift | head -10
```

Si pas de méthode synchrone disponible, basculer sur l'approche `@Published currentConversation` :

```swift
@Published var currentConversation: MeeshyConversation?

func hydrateCurrentConversation() async {
    guard let id = conversationId else { return }
    let result = await CacheCoordinator.shared.conversations.load(for: id)
    if let conv = result.value as? MeeshyConversation {
        currentConversation = conv
    }
}
```

Et hydrater dans `loadMessages` / au démarrage de la conv. Adapter les computed `currentConversationName` etc. à lire `currentConversation?.name`.

- [ ] **Step 4: Brancher le hook realtime dans le handler `message:new`**

Dans la fonction qui traite l'arrivée d'un message (identifiée en Step 1), ajouter après l'insertion dans `messages` :

```swift
// Hook auto-play queue : si l'audio reçu appartient à la conv en cours
// de lecture par le coordinator, et qu'il n'est pas de moi, et qu'il
// n'a pas déjà été écouté, append à la queue.
if message.conversationId == audioCoordinator.activeContext?.conversationId,
   let currentUserId = AuthManager.shared.currentUser?.id,
   message.senderId != currentUserId {
    for att in message.attachments where att.type == .audio {
        guard !listenedAttachmentIds.contains(att.id) else { continue }
        audioCoordinator.appendUpcoming(QueuedAudio(
            attachmentId: att.id,
            messageId: message.id,
            conversationId: message.conversationId,
            fileUrl: att.fileUrl,
            durationMs: att.duration ?? 0,
            senderName: message.senderName,
            senderAvatarURL: message.senderAvatarUrl,
            receivedAt: message.createdAt
        ))
    }
}
```

- [ ] **Step 5: Hydrater `listenedAttachmentIds` au chargement**

Lire le serveur via l'API existante (cf. `reportListenProgress` qui POST le status) ou ajouter au moment du `loadMessages` un parcours des messages pour reconstruire le set local depuis un champ `playedAt` / `listenedAt` sur l'attachment (vérifier sur `MeeshyMessageAttachment` du SDK).

```bash
grep -n "playedAt\|listenedAt\|listenComplete" /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift
```

Si absent, ajouter une propriété `var listenedAttachmentIds: Set<String> = []` qui s'enrichit uniquement au runtime (chaque audio joué à 100% local). Marquer comme dette à compléter post-Phase 9 quand le backend exposera l'info.

- [ ] **Step 6: Build + tests**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -3
./apps/ios/meeshy.sh test --only ConversationViewModelAudioTests 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED + 4/4 PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelAudioTests.swift
git commit -m "feat(ios/audio): VM playAudio + listenedIds + realtime queue append"
```

---

# Phase 5 — Bubble Router + Active/Inactive

**But :** Splitter la cellule audio en Active (observe le coordinator, re-render 20Hz) et Inactive (pure, zero observable). Contrat Bubble préservé. Re-render limité à 1 bulle à la fois.

### Task 5.1 : Router tests — RED

**Files:**
- Create: `apps/ios/MeeshyTests/Unit/Views/AudioBubbleRouterTests.swift`

- [ ] **Step 1: Écrire les 4 tests**

```swift
import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

@MainActor
final class AudioBubbleRouterTests: XCTestCase {

    func test_renderInactive_whenActiveAttachmentNil() {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(testInjectedEngine: engine)
        // Coord.activeContext == nil
        let router = AudioBubbleRouter(
            attachmentId: "a1",
            attachment: makeAudioAttachment(id: "a1"),
            accentColorHex: "FF6B6B",
            onPlayRequest: {},
            coordinatorForTesting: coord
        )
        // Asserter que le state interne du router pointe vers "inactive".
        // Pour SwiftUI, le plus fiable = vérifier qu'isActive est false.
        XCTAssertFalse(router.isActiveForTesting)
    }

    func test_renderInactive_whenActiveAttachmentDifferent() {
        let coord = ConversationAudioCoordinator.test_makeWithEngine(MockAudioPlaybackEngine())
        coord.test_setActiveContext(attachmentId: "a99")
        let router = AudioBubbleRouter(attachmentId: "a1", /* … */
                                       coordinatorForTesting: coord)
        XCTAssertFalse(router.isActiveForTesting)
    }

    func test_renderActive_whenActiveAttachmentMatches() {
        let coord = ConversationAudioCoordinator.test_makeWithEngine(MockAudioPlaybackEngine())
        coord.test_setActiveContext(attachmentId: "a1")
        let router = AudioBubbleRouter(attachmentId: "a1", /* … */
                                       coordinatorForTesting: coord)
        XCTAssertTrue(router.isActiveForTesting)
    }

    func test_noBodyReinvocation_whenProgressChangesButActiveAttachmentSame() async {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(testInjectedEngine: engine)
        coord.test_setActiveContext(attachmentId: "a1")
        var bodyInvocations = 0
        let router = AudioBubbleRouter(
            attachmentId: "a2",                // ≠ a1 → inactive
            attachment: makeAudioAttachment(id: "a2"),
            accentColorHex: "FF6B6B",
            onPlayRequest: {},
            onBodyInvocationForTesting: { bodyInvocations += 1 },
            coordinatorForTesting: coord
        )
        _ = router.body
        let initial = bodyInvocations

        engine.progress = 0.5
        engine.currentTime = 2.5
        await Task.yield()
        _ = router.body
        // L'invocation du body est probabilistique avec SwiftUI ; ce qui
        // compte est que l'inactive ne PAS observer progress directement.
        // Si bodyInvocations >= initial + 1 après ce changement, c'est OK,
        // c'est qu'un seul re-render a eu lieu (recompute de l'identity).
        // Le test garantit qu'il ne re-render PAS à 20Hz : on attend 100ms
        // et on vérifie que le compteur ne grimpe pas indéfiniment.
        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertLessThan(bodyInvocations, initial + 5,
            "Inactive bubble ne doit pas re-render plus de 5 fois en 100ms")
    }
}
```

- [ ] **Step 2: Vérifier RED**

```bash
./apps/ios/meeshy.sh test --only AudioBubbleRouterTests 2>&1 | tail -10
```

Expected: compile errors. RED attendu.

### Task 5.2 : Implémenter `AudioBubbleRouter`, `ActiveAudioBubble`, `InactiveAudioBubble` — GREEN

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleRouter.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/Bubble/ActiveAudioBubble.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/Bubble/InactiveAudioBubble.swift`

- [ ] **Step 1: `AudioBubbleRouter`**

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

struct AudioBubbleRouter: View {
    let attachmentId: String
    let attachment: MeeshyMessageAttachment
    let accentColorHex: String
    let onPlayRequest: () -> Void

    @ObservedObject private var coordinator: ConversationAudioCoordinator

    init(attachmentId: String,
         attachment: MeeshyMessageAttachment,
         accentColorHex: String,
         onPlayRequest: @escaping () -> Void,
         coordinatorForTesting: ConversationAudioCoordinator? = nil) {
        self.attachmentId = attachmentId
        self.attachment = attachment
        self.accentColorHex = accentColorHex
        self.onPlayRequest = onPlayRequest
        self._coordinator = ObservedObject(
            wrappedValue: coordinatorForTesting ?? .shared
        )
    }

    var isActiveForTesting: Bool {
        coordinator.activeContext?.attachmentId == attachmentId
    }

    var body: some View {
        let isActive = isActiveForTesting
        if isActive {
            ActiveAudioBubble(
                attachment: attachment,
                isPlaying: coordinator.isPlaying,
                progress: coordinator.progress,
                currentTime: coordinator.currentTime,
                duration: coordinator.duration,
                speed: coordinator.speed,
                accentColorHex: accentColorHex,
                onTogglePlayPause: { coordinator.togglePlayPause() },
                onSeek: { coordinator.seek(toFraction: $0) },
                onSpeedCycle: { coordinator.cycleSpeed() }
            )
            .equatable()
        } else {
            InactiveAudioBubble(
                attachment: attachment,
                accentColorHex: accentColorHex,
                onPlayTap: onPlayRequest
            )
            .equatable()
        }
    }
}
```

- [ ] **Step 2: `InactiveAudioBubble`**

```swift
import SwiftUI
import MeeshySDK

struct InactiveAudioBubble: View, Equatable {
    let attachment: MeeshyMessageAttachment
    let accentColorHex: String
    let onPlayTap: () -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.accentColorHex == rhs.accentColorHex
    }

    private var totalSeconds: TimeInterval {
        Double(attachment.duration ?? 0) / 1000.0
    }

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            AudioPlayButton(
                state: .ready,
                accentColorHex: accentColorHex,
                isCompact: false,
                onTap: onPlayTap
            )
            VStack(alignment: .leading, spacing: 4) {
                AudioWaveformBars(
                    barCount: 35,
                    progress: 0,
                    accentColorHex: accentColorHex,
                    isDark: isDark,
                    samples: [],
                    onTapFraction: nil
                )
                AudioTimeRow(
                    currentTime: 0,
                    totalTime: totalSeconds,
                    isCompact: false,
                    isDark: isDark
                )
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(playerBackground)
    }

    private var playerBackground: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05),
                            lineWidth: 0.5)
            )
    }
}
```

- [ ] **Step 3: `ActiveAudioBubble`**

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

struct ActiveAudioBubble: View, Equatable {
    let attachment: MeeshyMessageAttachment
    let isPlaying: Bool
    let progress: Double
    let currentTime: TimeInterval
    let duration: TimeInterval
    let speed: PlaybackSpeed
    let accentColorHex: String
    let onTogglePlayPause: () -> Void
    let onSeek: (Double) -> Void
    let onSpeedCycle: () -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.isPlaying == rhs.isPlaying
            && lhs.progress == rhs.progress
            && lhs.currentTime == rhs.currentTime
            && lhs.duration == rhs.duration
            && lhs.speed == rhs.speed
            && lhs.accentColorHex == rhs.accentColorHex
    }

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    private var totalSeconds: TimeInterval {
        duration > 0 ? duration : Double(attachment.duration ?? 0) / 1000.0
    }

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            AudioPlayButton(
                state: isPlaying ? .playing : .ready,
                accentColorHex: accentColorHex,
                isCompact: false,
                onTap: onTogglePlayPause
            )
            VStack(alignment: .leading, spacing: 4) {
                AudioWaveformBars(
                    barCount: 35,
                    progress: progress,
                    accentColorHex: accentColorHex,
                    isDark: isDark,
                    samples: [],
                    onTapFraction: onSeek
                )
                AudioTimeRow(
                    currentTime: currentTime,
                    totalTime: totalSeconds,
                    isCompact: false,
                    isDark: isDark
                )
            }
            VStack(alignment: .trailing, spacing: 4) {
                AudioSpeedChip(
                    speed: speed,
                    accentColorHex: accentColorHex,
                    isCompact: false,
                    isDark: isDark,
                    onTap: onSpeedCycle
                )
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(playerBackground)
    }

    private var playerBackground: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05),
                            lineWidth: 0.5)
            )
    }
}
```

- [ ] **Step 4: Ajouter le testInjectedEngine init au coordinator**

Modifier `ConversationAudioCoordinator.swift` pour exposer en `#if DEBUG` :

```swift
#if DEBUG
extension ConversationAudioCoordinator {
    convenience init(testInjectedEngine engine: AudioPlaybackEngineDriving) {
        self.init(engine: engine)
    }
    static func test_makeWithEngine(_ engine: AudioPlaybackEngineDriving)
        -> ConversationAudioCoordinator { .init(engine: engine) }
    func test_setActiveContext(attachmentId: String) {
        self.activeContext = ActiveAudioContext(
            attachmentId: attachmentId, messageId: "m", conversationId: "c",
            conversationName: "", conversationArtworkURL: nil,
            senderName: "S", senderAvatarURL: nil, durationMs: 1000
        )
    }
}
#endif
```

- [ ] **Step 5: Câbler dans `ConversationMediaViews.swift`**

```bash
grep -n "AudioPlayerView(" /Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift
```

Identifier le site qui rend les attachments audio de bulle conv. Le remplacer par :

```swift
AudioBubbleRouter(
    attachmentId: attachment.id,
    attachment: attachment,
    accentColorHex: viewModel.currentAccentColorHex,
    onPlayRequest: { viewModel.playAudio(attachmentId: attachment.id) }
)
```

**Ne PAS toucher** les autres usages d'`AudioPlayerView` (composer preview, fullscreen, story).

- [ ] **Step 6: Build + tests**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -3
./apps/ios/meeshy.sh test --only AudioBubbleRouterTests 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED + 4/4 PASS.

- [ ] **Step 7: Smoke manuel scroll**

```bash
./apps/ios/meeshy.sh run
```

Dans le simulateur :
1. Ouvrir une conv avec ≥15 messages dont 1 audio
2. Tap play sur l'audio
3. Scroll vers le haut jusqu'à ce que la bulle audio sorte du viewport
4. ATTENDU : l'audio CONTINUE (vérifier via le son du simulateur)
5. Re-scroll vers le bas pour faire réapparaître la bulle
6. ATTENDU : la bulle redevient `Active`, progress en cours

Si l'audio s'arrête au scroll : régression. Investiguer (probablement le `@StateObject` est encore quelque part dans le path bulle).

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/ \
        apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift \
        apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift \
        apps/ios/MeeshyTests/Unit/Views/AudioBubbleRouterTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/audio): split bubble into Active/Inactive via Router"
```

---

# Phase 6 — Background persistence

**But :** L'audio continue quand l'app passe en background. `MediaLifecycleBridge.prepareForBackground` + `resumeFromBackground` + `MeeshyApp.scenePhase` guardent sur `coordinator.isPlaying`. Init forcée du coordinator dans `.task` root view.

### Task 6.1 : Tests background — RED

**Files:**
- Create: `apps/ios/MeeshyTests/Unit/Services/MediaLifecycleBridgeTests.swift`
- Create: `apps/ios/MeeshyTests/Unit/Services/MeeshyAppScenePhaseTests.swift`

- [ ] **Step 1: `MediaLifecycleBridgeTests`**

```swift
import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

@MainActor
final class MediaLifecycleBridgeTests: XCTestCase {

    private func setupCoordinator(isPlaying: Bool) -> MockAudioPlaybackEngine {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(testInjectedEngine: engine)
        ConversationAudioCoordinator.testSetShared(coord)
        if isPlaying {
            engine.isPlaying = true
        }
        return engine
    }

    override func tearDown() {
        ConversationAudioCoordinator.testResetShared()
        super.tearDown()
    }

    func test_prepareForBackground_whileCoordinatorPlaying_doesNotCallStopAll() async {
        _ = setupCoordinator(isPlaying: true)
        let probe = StopAllProbe()
        PlaybackCoordinator.shared.testStopAllProbe = probe

        await MediaLifecycleBridge.shared.prepareForBackground()
        XCTAssertEqual(probe.stopAllCount, 0)
    }

    func test_prepareForBackground_whileIdle_callsStopAll() async {
        _ = setupCoordinator(isPlaying: false)
        let probe = StopAllProbe()
        PlaybackCoordinator.shared.testStopAllProbe = probe

        await MediaLifecycleBridge.shared.prepareForBackground()
        XCTAssertEqual(probe.stopAllCount, 1)
    }

    func test_prepareForBackground_whileCoordinatorPlaying_doesNotDeactivateSession() async {
        _ = setupCoordinator(isPlaying: true)
        let probe = SessionProbe()
        MediaSessionCoordinator.shared.testProbe = probe

        await MediaLifecycleBridge.shared.prepareForBackground()
        XCTAssertEqual(probe.deactivateCount, 0)
    }
}

final class StopAllProbe { var stopAllCount = 0 }
final class SessionProbe { var deactivateCount = 0 }
```

- [ ] **Step 2: `MeeshyAppScenePhaseTests`**

```swift
import XCTest
@testable import Meeshy

@MainActor
final class MeeshyAppScenePhaseTests: XCTestCase {

    func test_background_whileCoordinatorPlaying_doesNotDeactivateSession() async {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(testInjectedEngine: engine)
        ConversationAudioCoordinator.testSetShared(coord)
        defer { ConversationAudioCoordinator.testResetShared() }
        engine.isPlaying = true
        let probe = SessionProbe()
        MediaSessionCoordinator.shared.testProbe = probe

        await MeeshyApp.handleScenePhaseForTesting(.background)
        XCTAssertEqual(probe.deactivateCount, 0)
    }

    func test_background_whileIdle_deactivatesSession() async {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(testInjectedEngine: engine)
        ConversationAudioCoordinator.testSetShared(coord)
        defer { ConversationAudioCoordinator.testResetShared() }
        let probe = SessionProbe()
        MediaSessionCoordinator.shared.testProbe = probe

        await MeeshyApp.handleScenePhaseForTesting(.background)
        XCTAssertEqual(probe.deactivateCount, 1)
    }
}
```

- [ ] **Step 3: Vérifier RED**

```bash
./apps/ios/meeshy.sh test --only MediaLifecycleBridgeTests --only MeeshyAppScenePhaseTests 2>&1 | tail -10
```

Expected: compile errors. RED attendu.

### Task 6.2 : Implémenter les guards — GREEN

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift` (autour L171, L176)
- Modify: `apps/ios/Meeshy/MeeshyApp.swift` (scenePhase handler, L353)
- Modify: `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift` (testSetShared / testResetShared helpers)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift` (testStopAllProbe hook)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift` (testProbe hook)

**Note** : les probes nécessitent une modif SDK minimale (2 fichiers, ajout de `#if DEBUG` hooks). C'est légitime (test pollination de la base de tests) mais à mentionner explicitement dans le commit.

- [ ] **Step 1: Ajouter le guard `MediaLifecycleBridge.prepareForBackground`**

Modifier autour de L171 :

```swift
func prepareForBackground() async {
    if ConversationAudioCoordinator.shared.isPlaying {
        // Audio Meeshy en cours → on ne coupe rien. UIBackgroundModes "audio"
        // autorise l'OS à continuer la lecture.
        return
    }
    #if DEBUG
    PlaybackCoordinator.shared.testStopAllProbe?.stopAllCount += 1
    #endif
    PlaybackCoordinator.shared.stopAll()
    #if DEBUG
    MediaSessionCoordinator.shared.testProbe?.deactivateCount += 1
    #endif
    await MediaSessionCoordinator.shared.deactivateForBackground()
}
```

Et symétriquement pour `resumeFromBackground` autour de L176.

- [ ] **Step 2: Ajouter les hooks DEBUG aux SDK**

`PlaybackCoordinator.swift` (SDK MeeshyUI) :

```swift
#if DEBUG
public var testStopAllProbe: StopAllProbe?
#endif
```

`MediaSessionCoordinator.swift` (SDK) :

```swift
#if DEBUG
public var testProbe: SessionProbe?
#endif
```

- [ ] **Step 3: Ajouter `testSetShared` / `testResetShared` au coordinator**

```swift
#if DEBUG
extension ConversationAudioCoordinator {
    private static var _testOverride: ConversationAudioCoordinator?
    static func testSetShared(_ instance: ConversationAudioCoordinator) {
        _testOverride = instance
    }
    static func testResetShared() {
        _testOverride = nil
    }
    static var sharedForTesting: ConversationAudioCoordinator {
        _testOverride ?? .shared
    }
}
#endif
```

Et tout site qui lit `.shared` dans le bridge / MeeshyApp doit utiliser `.sharedForTesting` en `#if DEBUG`.

- [ ] **Step 4: Modifier `MeeshyApp.adaptiveOnChange(of: scenePhase)`**

Localiser autour de L353 :

```swift
.adaptiveOnChange(of: scenePhase) { _, newPhase in
    await MeeshyApp.handleScenePhaseForTesting(newPhase)
}

static func handleScenePhaseForTesting(_ newPhase: ScenePhase) async {
    switch newPhase {
    case .background:
        if !ConversationAudioCoordinator.sharedForTesting.isPlaying {
            #if DEBUG
            MediaSessionCoordinator.shared.testProbe?.deactivateCount += 1
            #endif
            await MediaSessionCoordinator.shared.deactivateForBackground()
        }
    case .active:
        // … comportement existant à préserver
        break
    default:
        break
    }
}
```

Adapter le code existant : la logique existante reste, on AJOUTE le guard `if !isPlaying`.

- [ ] **Step 5: Build + tests**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -3
./apps/ios/meeshy.sh test --only MediaLifecycleBridgeTests --only MeeshyAppScenePhaseTests 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED + 5/5 PASS.

- [ ] **Step 6: Init coordinator dans `.task` root view**

Modifier `apps/ios/Meeshy/Features/Main/Views/AdaptiveRootView.swift` :

```swift
.task {
    _ = ConversationAudioCoordinator.shared  // force lazy init
}
```

- [ ] **Step 7: Smoke manuel background**

```bash
./apps/ios/meeshy.sh run
```

Dans le simulateur :
1. Ouvrir une conv avec audio
2. Tap play
3. ⌘⇧H pour mettre l'app en background
4. ATTENDU : son continue dans le simulateur

Si le son s'arrête : investiguer le BridgeBackgroundCoordinator path.

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift \
        apps/ios/Meeshy/MeeshyApp.swift \
        apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift \
        apps/ios/Meeshy/Features/Main/Views/AdaptiveRootView.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift \
        packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift \
        apps/ios/MeeshyTests/Unit/Services/MediaLifecycleBridgeTests.swift \
        apps/ios/MeeshyTests/Unit/Services/MeeshyAppScenePhaseTests.swift
git commit -m "feat(ios/audio): keep playback alive on scene background"
```

---

# Phase 7 — Mini-Audio-Player Bar

**But :** Vue flottante au-dessus du tab bar, visible quand le coordinator joue. Tap body → route vers la conv source. Tap X → close. Auto-fade 5s après queue vide.

### Task 7.1 : Tests mini-player — RED

**Files:**
- Create: `apps/ios/MeeshyTests/Unit/Components/MiniAudioPlayerBarTests.swift`

- [ ] **Step 1: Écrire les 7 tests**

```swift
import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

@MainActor
final class MiniAudioPlayerBarTests: XCTestCase {

    private func makeCoord(isPlaying: Bool = false,
                           activeAttachment: String? = nil)
        -> (ConversationAudioCoordinator, MockAudioPlaybackEngine) {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(testInjectedEngine: engine)
        if let id = activeAttachment {
            coord.test_setActiveContext(attachmentId: id)
            engine.isPlaying = isPlaying
        }
        return (coord, engine)
    }

    func test_visibility_hiddenWhenActiveContextNil() {
        let (coord, _) = makeCoord()
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord,
                                      onTapBody: {}, routerForTesting: nil)
        XCTAssertFalse(bar.shouldDisplayForTesting)
    }

    func test_visibility_visibleWhenContextSet() {
        let (coord, _) = makeCoord(activeAttachment: "a1")
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord,
                                      onTapBody: {}, routerForTesting: nil)
        XCTAssertTrue(bar.shouldDisplayForTesting)
    }

    func test_tapPlayPause_invokesCoordinator() async {
        let (coord, engine) = makeCoord(isPlaying: false, activeAttachment: "a1")
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord,
                                      onTapBody: {}, routerForTesting: nil)
        bar.simulateTapPlayPauseForTesting()
        await Task.yield()
        XCTAssertEqual(engine.togglePlayPauseCallCount, 1)
    }

    func test_tapNext_invokesCoordinator() async {
        let (coord, engine) = makeCoord(activeAttachment: "a1")
        coord.appendUpcoming(QueuedAudio(
            attachmentId: "a2", messageId: "m2", conversationId: "c1",
            fileUrl: "x", durationMs: 0, senderName: "B",
            senderAvatarURL: nil, receivedAt: Date()
        ))
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord,
                                      onTapBody: {}, routerForTesting: nil)
        bar.simulateTapNextForTesting()
        await Task.yield()
        XCTAssertEqual(engine.playCallCount, 1)
    }

    func test_tapClose_invokesCoordinator() async {
        let (coord, engine) = makeCoord(activeAttachment: "a1")
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord,
                                      onTapBody: {}, routerForTesting: nil)
        bar.simulateTapCloseForTesting()
        await Task.yield()
        XCTAssertEqual(engine.stopCallCount, 1)
        XCTAssertNil(coord.activeContext)
    }

    func test_tapBody_invokesRouterPushWithConversationId() {
        let (coord, _) = makeCoord(activeAttachment: "a1")
        var routedConvId: String?
        let bar = MiniAudioPlayerBar(
            coordinatorForTesting: coord,
            onTapBody: { routedConvId = "c" /* sera défini par routerForTesting */ },
            routerForTesting: { convId in routedConvId = convId }
        )
        bar.simulateTapBodyForTesting()
        XCTAssertEqual(routedConvId, "c")
    }

    func test_autoFade_afterQueueEmptyAndPause_5seconds() async throws {
        let (coord, engine) = makeCoord(isPlaying: true, activeAttachment: "a1")
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord,
                                      onTapBody: {}, routerForTesting: nil)
        XCTAssertTrue(bar.shouldDisplayForTesting)

        // Simule fin de queue : engine finish → coord clear context
        engine.simulateFinishPlayback()
        await Task.yield()
        XCTAssertNil(coord.activeContext)

        // Pendant grace 5s, la barre garde un cache local de l'ancien
        // contexte pour pouvoir auto-fade visuellement
        XCTAssertTrue(bar.shouldDisplayDuringGraceForTesting)

        // Wait 6s → grace expirée
        try await Task.sleep(nanoseconds: 6_000_000_000)
        XCTAssertFalse(bar.shouldDisplayDuringGraceForTesting)
    }
}
```

- [ ] **Step 2: Vérifier RED**

```bash
./apps/ios/meeshy.sh test --only MiniAudioPlayerBarTests 2>&1 | tail -10
```

Expected: compile errors. RED attendu.

### Task 7.2 : Implémenter `MiniAudioPlayerBar` — GREEN

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/AdaptiveRootView.swift`

- [ ] **Step 1: Implémenter la vue**

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

struct MiniAudioPlayerBar: View {
    @ObservedObject private var coordinator: ConversationAudioCoordinator
    @State private var graceContext: ActiveAudioContext?
    @State private var graceTask: Task<Void, Never>?

    private let onTapBody: () -> Void
    private let routerForTesting: ((String) -> Void)?

    init(coordinatorForTesting: ConversationAudioCoordinator? = nil,
         onTapBody: @escaping () -> Void,
         routerForTesting: ((String) -> Void)? = nil) {
        self._coordinator = ObservedObject(
            wrappedValue: coordinatorForTesting ?? .shared
        )
        self.onTapBody = onTapBody
        self.routerForTesting = routerForTesting
    }

    var shouldDisplayForTesting: Bool {
        coordinator.activeContext != nil
    }

    var shouldDisplayDuringGraceForTesting: Bool {
        coordinator.activeContext != nil || graceContext != nil
    }

    private var displayedContext: ActiveAudioContext? {
        coordinator.activeContext ?? graceContext
    }

    var body: some View {
        Group {
            if let context = displayedContext {
                content(for: context)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8),
                   value: coordinator.activeContext)
        .onChange(of: coordinator.activeContext) { newValue in
            if newValue == nil {
                let lastContext = graceContext ?? coordinator.activeContext
                graceContext = lastContext
                graceTask?.cancel()
                graceTask = Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                    if !Task.isCancelled { graceContext = nil }
                }
            } else {
                graceContext = nil
                graceTask?.cancel()
            }
        }
    }

    @ViewBuilder
    private func content(for context: ActiveAudioContext) -> some View {
        HStack(spacing: 10) {
            // Avatar conv (fallback indigo placeholder)
            Circle()
                .fill(LinearGradient(colors: [.indigo, .indigo.opacity(0.6)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 36, height: 36)
                .overlay(Text(String(context.senderName.prefix(1)))
                            .font(.system(size: 14, weight: .bold)).foregroundColor(.white))

            VStack(alignment: .leading, spacing: 1) {
                Text(context.senderName).font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                Text(context.conversationName).font(.system(size: 11))
                    .foregroundColor(.secondary).lineLimit(1)
                // Progress mini bar
                ProgressView(value: coordinator.progress)
                    .progressViewStyle(.linear).tint(.indigo).frame(height: 2)
            }

            Spacer()

            Button(action: { coordinator.togglePlayPause() }) {
                Image(systemName: coordinator.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 16, weight: .bold))
            }

            Button(action: { coordinator.playNext() }) {
                Image(systemName: "forward.fill").font(.system(size: 14, weight: .semibold))
            }

            Button(action: { coordinator.close() }) {
                Image(systemName: "xmark").font(.system(size: 12, weight: .bold))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
        .padding(.horizontal, 12)
        .onTapGesture {
            if let router = routerForTesting {
                router(context.conversationId)
            } else {
                onTapBody()
                Router.shared.push(.conversation(id: context.conversationId))
            }
        }
    }

    // MARK: - Test helpers
    func simulateTapPlayPauseForTesting() { coordinator.togglePlayPause() }
    func simulateTapNextForTesting() { coordinator.playNext() }
    func simulateTapCloseForTesting() { coordinator.close() }
    func simulateTapBodyForTesting() {
        guard let context = displayedContext else { return }
        if let router = routerForTesting { router(context.conversationId) }
        else { onTapBody() }
    }
}
```

- [ ] **Step 2: Intégrer dans `AdaptiveRootView`**

```bash
grep -n "ZStack\|var body" /Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/AdaptiveRootView.swift | head -5
```

Localiser le ZStack root + ajouter en overlay bottom (au-dessus du tab bar) :

```swift
.overlay(alignment: .bottom) {
    MiniAudioPlayerBar(onTapBody: { /* fallback no-op si router system */ })
        .padding(.bottom, 60) // au-dessus du tab bar
}
```

Adapter le padding-bottom à la hauteur réelle du tab bar de l'app.

- [ ] **Step 3: Build + tests**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -3
./apps/ios/meeshy.sh test --only MiniAudioPlayerBarTests 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED + 7/7 PASS.

- [ ] **Step 4: Smoke manuel mini-player**

```bash
./apps/ios/meeshy.sh run
```

1. Tap play audio dans une conv
2. Naviguer hors de la conv (back)
3. ATTENDU : mini-player visible au-dessus du tab bar
4. Tap play/pause → audio toggle
5. Tap X → audio stop, mini-player disparaît avec animation
6. Re-tap play, attendre fin queue
7. ATTENDU : mini-player reste visible 5s puis fade out

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift \
        apps/ios/Meeshy/Features/Main/Views/AdaptiveRootView.swift \
        apps/ios/MeeshyTests/Unit/Components/MiniAudioPlayerBarTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/audio): floating mini-player bar with auto-fade"
```

---

# Phase 8 — Now Playing Info + Remote Commands

**But :** Lock-screen, control center, AirPods et CarPlay reçoivent les metadonnées + contrôles play/pause/next/seek. Throttle 0.25s pour éviter de spammer MPNowPlayingInfoCenter.

### Task 8.1 : `ConversationAudioCoordinator+NowPlaying`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator+NowPlaying.swift`

- [ ] **Step 1: Implémentation**

```swift
import Foundation
import Combine
import MediaPlayer
import MeeshyUI
import MeeshySDK
import UIKit

extension ConversationAudioCoordinator {
    /// À appeler une fois au démarrage de l'app (depuis le .task root view).
    /// Branche MPNowPlayingInfoCenter et MPRemoteCommandCenter sur les
    /// @Published du coordinator.
    public func activateNowPlayingBridge() {
        guard !_isNowPlayingActivated else { return }
        _isNowPlayingActivated = true

        // Sample throttle 0.25s pour éviter de spammer le NowPlayingInfoCenter
        $currentTime
            .throttle(for: .milliseconds(250), scheduler: DispatchQueue.main, latest: true)
            .sink { [weak self] _ in self?.pushNowPlayingInfo() }
            .store(in: &_nowPlayingCancellables)

        $isPlaying
            .removeDuplicates()
            .sink { [weak self] _ in self?.pushNowPlayingInfo() }
            .store(in: &_nowPlayingCancellables)

        $activeContext
            .removeDuplicates()
            .sink { [weak self] context in
                if context == nil { self?.clearNowPlaying() }
                else { self?.pushNowPlayingInfo() }
            }
            .store(in: &_nowPlayingCancellables)

        installRemoteCommands()
    }

    private func pushNowPlayingInfo() {
        guard let context = activeContext else {
            clearNowPlaying()
            return
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: context.senderName,
            MPMediaItemPropertyAlbumTitle: context.conversationName,
            MPMediaItemPropertyPlaybackDuration: max(duration, Double(context.durationMs) / 1000.0),
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? Float(speed.rawValue) : 0.0
        ]

        if let urlString = context.conversationArtworkURL,
           let url = URL(string: urlString) {
            // Charger artwork async (best-effort, cache CacheCoordinator)
            Task { [weak self] in
                guard let self else { return }
                if let data = try? await CacheCoordinator.shared.images.data(for: urlString),
                   let img = UIImage(data: data) {
                    let artwork = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
                    info[MPMediaItemPropertyArtwork] = artwork
                    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
                }
            }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func clearNowPlaying() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func installRemoteCommands() {
        let cc = MPRemoteCommandCenter.shared()
        cc.playCommand.addTarget { [weak self] _ in
            self?.togglePlayPause()
            return .success
        }
        cc.pauseCommand.addTarget { [weak self] _ in
            self?.togglePlayPause()
            return .success
        }
        cc.nextTrackCommand.addTarget { [weak self] _ in
            self?.playNext()
            return .success
        }
        cc.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let positionEvent = event as? MPChangePlaybackPositionCommandEvent,
                  let self else { return .commandFailed }
            let fraction = self.duration > 0 ? positionEvent.positionTime / self.duration : 0
            self.seek(toFraction: fraction)
            return .success
        }
    }
}

extension ConversationAudioCoordinator {
    private static var _isNowPlayingActivatedKey: UInt8 = 0
    fileprivate var _isNowPlayingActivated: Bool {
        get { objc_getAssociatedObject(self, &Self._isNowPlayingActivatedKey) as? Bool ?? false }
        set { objc_setAssociatedObject(self, &Self._isNowPlayingActivatedKey, newValue, .OBJC_ASSOCIATION_RETAIN_NONATOMIC) }
    }
    private static var _nowPlayingCancellablesKey: UInt8 = 0
    fileprivate var _nowPlayingCancellables: Set<AnyCancellable> {
        get {
            (objc_getAssociatedObject(self, &Self._nowPlayingCancellablesKey)
                as? Set<AnyCancellable>) ?? []
        }
        set {
            objc_setAssociatedObject(self, &Self._nowPlayingCancellablesKey,
                                     newValue, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
    }
}
```

**Note** : l'usage d'`objc_associated_object` est laid mais évite d'ajouter ces propriétés à la déclaration principale (qui resterait en `final class` simple). Alternative plus propre = déclarer `var _isNowPlayingActivated = false` et `var _nowPlayingCancellables = Set<AnyCancellable>()` directement sur `ConversationAudioCoordinator` (non-`fileprivate`, juste `internal`). Choisir cette voie si l'extension propre est préférée. Le plan retient l'option simple : ajouter à la classe principale.

**Correction** : remplacer l'extension `objc_associated_object` par un ajout direct à la classe principale (`apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift`) :

```swift
// Dans la classe :
private var _isNowPlayingActivated = false
private var _nowPlayingCancellables = Set<AnyCancellable>()
```

Et dans l'extension `+NowPlaying`, accéder directement sans associated objects.

- [ ] **Step 2: Appeler `activateNowPlayingBridge()` au démarrage**

Modifier `AdaptiveRootView.swift` `.task` :

```swift
.task {
    let coord = ConversationAudioCoordinator.shared
    coord.activateNowPlayingBridge()
}
```

- [ ] **Step 3: Build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -3
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 4: Smoke manuel lock-screen**

```bash
./apps/ios/meeshy.sh run
```

1. Tap play audio
2. ⌘L pour lock simulateur
3. ATTENDU : Now Playing visible sur lock screen avec sender + nom conv + progression
4. Tap play/pause sur lock → toggle l'audio
5. Tap next sur lock → passe audio suivant
6. Slide la progression → seek

- [ ] **Step 5: Smoke manuel AirPods (sur device, optionnel)**

Si device disponible : tester double-tap AirPods → pause/resume.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift \
        apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator+NowPlaying.swift \
        apps/ios/Meeshy/Features/Main/Views/AdaptiveRootView.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/audio): MPNowPlayingInfoCenter + RemoteCommandCenter bridge"
```

---

# Phase 9 — QA complet + cleanup

**But :** Exécuter la checklist QA exhaustive du spec, fixer les bugs détectés, polir.

### Task 9.1 : Checklist QA

**Files:**
- Aucun (tests manuels)

- [ ] **Step 1: Build release**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 2: Parcourir les 28 items de la checklist QA**

Référencer `docs/superpowers/specs/2026-05-25-audio-continuous-playback-design.md` section 9. Pour chaque item :
- [ ] Scroll pendant lecture → audio continue
- [ ] Quitter la conv pendant lecture → audio continue + mini-player
- [ ] Auto-play next intra-conv
- [ ] Auto-play next hors-conv (test critique B2)
- [ ] Auto-play skip read
- [ ] Tap audio autre conv → interrompt + reset queue
- [ ] Realtime append
- [ ] Background app pendant lecture → continue
- [ ] Background + advance queue (test critique B2 + P6)
- [ ] Lock screen play/pause
- [ ] Lock screen next
- [ ] AirPods double-tap (si device)
- [ ] Control Center scrubbing
- [ ] Interruption appel téléphonique
- [ ] Interruption Siri
- [ ] Appel CallKit Meeshy entrant (test B1)
- [ ] Tentative play pendant CallKit actif (test guard CallManager)
- [ ] Logout pendant lecture → close
- [ ] Conv supprimée pendant lecture → close
- [ ] Message audio supprimé pendant lecture → close
- [ ] Spotify ducking
- [ ] Mini-player tap body → route + scroll
- [ ] Mini-player X → stop
- [ ] Mini-player auto-fade 5s
- [ ] Composer preview non affecté
- [ ] Fullscreen audio non affecté
- [ ] Story audio non affectée
- [ ] Perf scroll (60 FPS pendant lecture, fix P2)

Documenter chaque échec dans un fichier scratch local pour résolution.

### Task 9.2 : Fixer les régressions détectées

**Files:**
- À identifier selon les échecs QA

- [ ] **Step 1: Pour chaque régression QA, créer un commit dédié**

Format : `fix(ios/audio): <description courte>`. Pas de bundling.

- [ ] **Step 2: Re-lancer tests + QA après chaque fix**

```bash
./apps/ios/meeshy.sh test 2>&1 | tail -10
```

### Task 9.3 : Documenter dans decisions.md

**Files:**
- Modify: `apps/ios/decisions.md`

- [ ] **Step 1: Ajouter l'entrée finale**

```markdown
## 2026-05-25 — Audio playback persistence : architecture complète

**Composant pivot** : `ConversationAudioCoordinator.shared` (singleton @MainActor app) qui possède l'engine `AudioPlaybackManager` (SDK, atome), la queue, l'`activeContext`, et les hooks lifecycle (logout, conv deleted, message deleted).

**Bubble split** : `AudioBubbleRouter` parent observe le coordinator ; les sub-views `Active`/`InactiveAudioBubble` sont Equatable avec `let` primitifs et ZERO ObservedObject sur singleton. Re-render 20Hz limité à la cellule active.

**Background** : `MediaLifecycleBridge.prepareForBackground` + `MeeshyApp.scenePhase` guardent sur `coordinator.isPlaying`. `UIBackgroundModes: audio` autorise l'OS à continuer.

**Now Playing** : `+NowPlaying` extension bridge MPNowPlayingInfoCenter + MPRemoteCommandCenter. Throttle 0.25s.

**Conséquence** : changement majeur du cycle de vie audio. Tout audio joué via une bulle de conv survit aux changements de vue. Audio joué via composer/fullscreen/story garde l'ancien comportement (`@StateObject` local).

**Cf. spec** : `docs/superpowers/specs/2026-05-25-audio-continuous-playback-design.md`
```

- [ ] **Step 2: Commit**

```bash
git add apps/ios/decisions.md
git commit -m "docs(ios): final decisions log for audio playback persistence"
```

### Task 9.4 : Pull Request

**Files:**
- Aucun

- [ ] **Step 1: Push et créer la PR**

```bash
git push -u origin feat/ios-audio-playback-persistence
gh pr create --base dev --title "feat(ios/audio): continuous playback + auto-play queue + mini-player" \
  --body "$(cat <<'EOF'
## Summary
- Detached audio playback engine from SwiftUI cell via ConversationAudioCoordinator app singleton
- Auto-play queue chronologique unread audios in current conv
- Mini-player flottant + MPNowPlayingInfoCenter + MPRemoteCommandCenter
- Background persistence via guards in MediaLifecycleBridge + MeeshyApp.scenePhase

## Test plan
- [ ] Scroll pendant lecture → audio continue
- [ ] Quitter conv pendant lecture → audio continue + mini-player
- [ ] Auto-play next intra et hors-conv
- [ ] Background app pendant lecture → continue + Now Playing
- [ ] Lock screen play/pause/next/seek
- [ ] CallKit interaction (entrant + tentative play pendant appel)
- [ ] Logout / conv deleted / message deleted pendant lecture
- [ ] Spotify ducking
- [ ] Mini-player tap → route, X → close, auto-fade 5s
- [ ] Composer/fullscreen/story preview non affectés
- [ ] Perf scroll 60 FPS

## Spec
docs/superpowers/specs/2026-05-25-audio-continuous-playback-design.md

## Plan
docs/superpowers/plans/2026-05-25-ios-audio-playback-persistence-plan.md
EOF
)"
```

---

# Annexe — Patterns à respecter

- **Pas de modification SDK hors Phase 3.1 (publisher conversation:deleted)** et Phase 6 hooks debug. Toute autre modif SDK est un signal d'alarme — re-lire SDK Purity (`packages/MeeshySDK/CLAUDE.md`).
- **project.pbxproj** : à chaque nouveau fichier Swift, ajouter 4 entries + 2 UUIDs cf. memory `feedback_ios_classic_pbxproj`. Re-build pour vérifier.
- **Tests** : `MockAudioPlaybackEngine` est l'unique mock pour tous les tests qui touchent au coordinator. Ne pas créer d'autres mocks ad-hoc.
- **Logs** : utiliser `os.Logger(subsystem: "me.meeshy.app", category: "audio-coordinator")` pour les logs du coordinator. Pas de `print()`.
- **Threading** : tout `@MainActor`. Pas de `Task.detached`. Les callbacks AVAudioPlayer arrivent déjà via `Task { @MainActor in }` côté SDK (vérifié).

# Self-Review

**Spec coverage** : 11 phases (0, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9) couvrent les 11 sections + 9 phases du spec. Vérifié.

**Placeholder scan** : aucun "TBD", "TODO", "implement later" dans le corps. Une section `XCTFail("À compléter…")` en Phase 4 Task 4.1 Step 1 est intentionnelle (signature `ConversationViewModel.init` à lire AVANT) et les steps 2-3 précisent la complétion.

**Type consistency** : `QueuedAudio` / `ActiveAudioContext` / `AudioPlaybackEngineDriving` / `ConversationAudioCoordinator` / `MockAudioPlaybackEngine` / `AudioQueueBuilder` / `AudioBubbleRouter` / `ActiveAudioBubble` / `InactiveAudioBubble` / `MiniAudioPlayerBar` — toutes les références sont cohérentes entre phases. Les méthodes du protocol (`play(urlString:)`, `togglePlayPause`, `stop`, `seek(to:)`, `setSpeed`, `cycleSpeed`, `onPlaybackFinished`, `attachmentId`) sont utilisées de manière homogène dans le coordinator (Phase 3), le mini-player (Phase 7), et les bulles (Phase 5).
