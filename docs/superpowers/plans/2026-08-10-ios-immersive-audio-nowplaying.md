# Intégration audio immersive iOS — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'audio de conversation « Now Playing » (carte lock screen/Control Center, background, next/prev de file, AirPlay) en réparant l'éligibilité de session, en gérant les interruptions système et en fusionnant les moteurs de contenu dans le `ConversationAudioCoordinator`.

**Architecture:** Le pont `MPNowPlayingInfoCenter`/`MPRemoteCommandCenter` existe déjà (`ConversationAudioCoordinator+NowPlaying`) mais tourne dans le vide : la session `.playback` posée avec `[.duckOthers]` (mixable) rend l'app inéligible au statut « Now Playing app ». On introduit un profil de session (`.content` non-mixable / `.transient` duck), on branche les interruptions système sur le coordinator, et on route toutes les surfaces de **contenu** (plein écran, scroll-button, feed/commentaire/post) vers le moteur unique du coordinator. Les préviews (brouillon composer, statut) et les réels restent `.transient`.

**Tech Stack:** Swift 6, SwiftUI, AVFoundation/AVAudioPlayer, MediaPlayer (MPNowPlayingInfoCenter/MPRemoteCommandCenter), Combine, XCTest.

**Spec:** `docs/superpowers/specs/2026-08-10-ios-immersive-audio-nowplaying-design.md`

## Global Constraints

- iOS 16.0+ ; Swift 6 ; pas de nouvelle dépendance externe.
- Types/enums réutilisables côté SDK dans `packages/MeeshySDK/` ; décisions produit (qui est `.content`) côté `apps/ios/` (SDK purity).
- `UIBackgroundModes` contient déjà `audio` — ne PAS toucher à `Info.plist`.
- Nouveaux fichiers `.swift` sous `apps/ios/Meeshy/` : lancer `cd apps/ios && xcodegen generate` avant tout build local. **NE JAMAIS committer** le churn `project.pbxproj`/`Meeshy.xcscheme`/`Package.resolved` (`git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved` avant commit) — le worktree porte du WIP concurrent sur `project.yml`/`project.pbxproj` qui ne doit PAS partir dans un commit de ce chantier.
- Tests app : simulateur `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5` (iPhone 16 Pro). `-only-testing` sélectionne des CLASSES, pas des fichiers.
- Commits : convention `feat(ios):` / `fix(sdk):` en français, SANS trailer Co-Authored-By.
- Strings UI : `String(localized:defaultValue:bundle: .main)`.
- Commande de build/test complète : `./apps/ios/meeshy.sh test` (gate final uniquement — trop lent par tâche).

### Commandes de test réutilisées dans les tâches

```bash
# SDK (package MeeshySDK) — remplacer <Classe>
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/<Classe> -quiet

# App — une fois par session de travail :
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build -quiet
# Puis par classe de tests — remplacer <Classe>
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/<Classe> -derivedDataPath apps/ios/Build -quiet
```

---

### Task 1: SDK — `AudioSessionProfile` + plomberie moteur (`pause`, `resumeFromInterruption`)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Audio/AudioSessionProfile.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift` (méthode `request(role:)`, ~L171)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` (`AudioPlaybackManager` : propriété `sessionProfile`, `acquireSession()` ~L150, nouvelles méthodes `pause()` / `resumeFromInterruption()` près de `togglePlayPause()` ~L285)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Media/AudioSessionProfileTests.swift` (create)

**Interfaces:**
- Consumes: `MediaSessionCoordinator.activatePlaybackSync(mode:options:)` (existant), `PlaybackCoordinator.shared.willStartPlaying(audio:)` (existant).
- Produces: `AudioSessionProfile { case content; case transient; var categoryOptions: AVAudioSession.CategoryOptions }` ; `AudioPlaybackManager.sessionProfile: AudioSessionProfile` (défaut `.transient`) ; `AudioPlaybackManager.pause()` ; `AudioPlaybackManager.resumeFromInterruption()` ; `MediaSessionCoordinator.request(role:playbackOptions:)` (défaut `[.duckOthers]` = comportement legacy).

- [ ] **Step 1: Écrire les tests qui échouent**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Media/AudioSessionProfileTests.swift
import XCTest
import AVFoundation
@testable import MeeshySDK
@testable import MeeshyUI

@MainActor
final class AudioSessionProfileTests: XCTestCase {

    func test_contentProfile_hasNoMixableOption_nowPlayingEligible() {
        XCTAssertEqual(AudioSessionProfile.content.categoryOptions, [])
    }

    func test_transientProfile_ducksOthers() {
        XCTAssertEqual(AudioSessionProfile.transient.categoryOptions, [.duckOthers])
    }

    func test_freshEngine_defaultsToTransient_failSafe() {
        let engine = AudioPlaybackManager(registerWithCoordinator: false)
        XCTAssertEqual(engine.sessionProfile, .transient)
    }

    func test_pause_withoutPlayer_isSafeNoOp() {
        let engine = AudioPlaybackManager(registerWithCoordinator: false)
        engine.pause()
        XCTAssertFalse(engine.isPlaying)
    }

    func test_resumeFromInterruption_withoutPlayer_isSafeNoOp() {
        let engine = AudioPlaybackManager(registerWithCoordinator: false)
        engine.resumeFromInterruption()
        XCTAssertFalse(engine.isPlaying)
    }
}
```

- [ ] **Step 2: Lancer — vérifier l'échec de compile**

Run: commande SDK avec `<Classe>` = `AudioSessionProfileTests`
Expected: FAIL — `cannot find 'AudioSessionProfile' in scope`, `has no member 'sessionProfile'`.

- [ ] **Step 3: Implémenter**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Audio/AudioSessionProfile.swift
#if os(iOS)
import AVFoundation

/// Profil de session qu'un moteur de lecture transmet à
/// `MediaSessionCoordinator.request(role:playbackOptions:)`.
///
/// `.content` → session `.playback` NON-mixable : l'app devient la
/// « Now Playing app » système (carte lock screen, remote commands) et met en
/// pause l'audio des autres apps — comportement WhatsApp. `.transient` →
/// `[.duckOthers]` : préviews/réels atténuent les autres apps et ne prennent
/// jamais la carte. Le SDK expose le réglage ; QUEL moteur est `.content`
/// est une décision produit app-side (règle SDK purity).
public enum AudioSessionProfile: Sendable, Equatable {
    case content
    case transient

    public var categoryOptions: AVAudioSession.CategoryOptions {
        switch self {
        case .content: return []
        case .transient: return [.duckOthers]
        }
    }
}
#endif
```

Dans `MediaSessionCoordinator.request` (~L171), changer la signature et la branche `.playback` :

```swift
    public func request(
        role: AudioRole,
        playbackOptions: AVAudioSession.CategoryOptions = [.duckOthers]
    ) async throws {
        installSystemObserversIfNeeded()
        if Self.shouldManageSession(callActive: callActive) {
            let session = AVAudioSession.sharedInstance()
            switch role {
            case .playback:
                try session.setCategory(.playback, mode: .default, options: playbackOptions)
```

(le reste de la méthode inchangé — le défaut `[.duckOthers]` préserve tous les appelants existants).

Dans `AudioPlaybackManager` (`AudioPlayerView.swift`) :

```swift
    /// Profil de session transmis au MediaSessionCoordinator. Défaut
    /// `.transient` (fail-safe : un moteur oublié duck comme avant, sans
    /// jamais voler la carte Now Playing). Seul le moteur possédé par le
    /// ConversationAudioCoordinator (app) opte pour `.content`.
    public var sessionProfile: AudioSessionProfile = .transient

    private func acquireSession() async {
        guard !sessionRequested else { return }
        sessionRequested = true
        try? await MediaSessionCoordinator.shared.request(
            role: .playback, playbackOptions: sessionProfile.categoryOptions
        )
    }
```

Puis, sous `togglePlayPause()` :

```swift
    /// Pause explicite pour interruption système / changement de route.
    /// Contrairement à `togglePlayPause()`, sans effet si le player a déjà
    /// été mis en pause par le système (le toggle RELANCERAIT dans ce cas).
    public func pause() {
        guard player != nil, isPlaying else { return }
        player?.pause()
        isPlaying = false
        timer?.invalidate()
        stretchTracker.pause(positionMs)
        reportListenProgress(complete: false)
        persistPosition()
    }

    /// Reprise après interruption système : la session a pu être désactivée
    /// par l'OS — la réactiver de façon synchrone (call-aware, sans toucher
    /// le refcount) avant de relancer le player conservé.
    public func resumeFromInterruption() {
        guard let player, !isPlaying else { return }
        if let guardClosure = playbackPermissionGuard, !guardClosure() { return }
        MediaSessionCoordinator.shared.activatePlaybackSync(
            options: sessionProfile.categoryOptions
        )
        PlaybackCoordinator.shared.willStartPlaying(audio: self)
        player.rate = Float(speed.rawValue)
        player.play()
        isPlaying = true
        listenStartTime = listenStartTime ?? Date()
        stretchTracker.begin(positionMs)
        startProgressTimer()
    }
```

- [ ] **Step 4: Lancer — vérifier le vert**

Run: commande SDK avec `<Classe>` = `AudioSessionProfileTests`
Expected: PASS (5 tests).

- [ ] **Step 5: Non-régression SDK session**

Run: commande SDK avec `<Classe>` = `MediaSessionCoordinatorTests` puis `MediaSessionCoordinatorCallAwareTests` (target `MeeshySDKTests`, adapter le préfixe `-only-testing:MeeshySDKTests/<Classe>`)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Audio/AudioSessionProfile.swift \
        packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Media/AudioSessionProfileTests.swift
git commit -m "feat(sdk): profil de session audio content/transient + pause d'interruption"
```

---

### Task 2: App — protocole `pause`/`resumeFromInterruption` + moteur du coordinator en `.content`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/AudioPlaybackEngineDriving.swift` (protocole, L24-31)
- Modify: `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift` (init, ~L115-126)
- Modify: `apps/ios/MeeshyTests/Mocks/MockAudioPlaybackEngine.swift`
- Test: `apps/ios/MeeshyTests/Unit/Services/ConversationAudioCoordinatorTests.swift` (ajout)

**Interfaces:**
- Consumes: `AudioPlaybackManager.sessionProfile` / `.pause()` / `.resumeFromInterruption()` (Task 1).
- Produces: `AudioPlaybackEngineDriving.pause()` et `.resumeFromInterruption()` ; `MockAudioPlaybackEngine.pauseCallCount` / `.resumeFromInterruptionCallCount` ; moteur par défaut du coordinator avec `sessionProfile == .content`.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `ConversationAudioCoordinatorTests` (classe existante), ajouter :

```swift
    func test_init_defaultEngine_optsIntoContentSessionProfile() {
        let coordinator = ConversationAudioCoordinator()
        XCTAssertEqual(coordinator.engineForBubble?.sessionProfile, .content)
    }
```

- [ ] **Step 2: Lancer — vérifier l'échec**

Run: commande App avec `<Classe>` = `ConversationAudioCoordinatorTests`
Expected: FAIL (profil `.transient` par défaut, Task 1).

- [ ] **Step 3: Implémenter**

Protocole (`AudioPlaybackEngineDriving.swift`, après `func stop()`) :

```swift
    func pause()
    func resumeFromInterruption()
```

(`AudioPlaybackManager` les satisfait déjà via Task 1 — aucune extension à ajouter.)

Init du coordinator (`ConversationAudioCoordinator.swift`, dans le bloc `if let manager = engine as? AudioPlaybackManager` existant) :

```swift
        if let manager = engine as? AudioPlaybackManager {
            manager.sessionProfile = .content
            manager.playbackPermissionGuard = { !CallManager.shared.isCallActiveForAudioGuard }
        }
```

Mock (`MockAudioPlaybackEngine.swift`) :

```swift
    private(set) var pauseCallCount = 0
    private(set) var resumeFromInterruptionCallCount = 0

    func pause() {
        pauseCallCount += 1
        isPlaying = false
    }

    func resumeFromInterruption() {
        resumeFromInterruptionCallCount += 1
        isPlaying = true
    }
```

- [ ] **Step 4: Lancer — vérifier le vert + non-régression**

Run: commande App avec `<Classe>` = `ConversationAudioCoordinatorTests`, puis `ConversationAudioCallSuspensionTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/AudioPlaybackEngineDriving.swift \
        apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift \
        apps/ios/MeeshyTests/Mocks/MockAudioPlaybackEngine.swift \
        apps/ios/MeeshyTests/Unit/Services/ConversationAudioCoordinatorTests.swift
git commit -m "feat(ios): le moteur du coordinator audio devient Now Playing éligible (.content)"
```

---

### Task 3: App — interruptions système (Siri, appel cellulaire, AirPods retirés)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift` (init + nouvelle section « Interruptions système »)
- Test: `apps/ios/MeeshyTests/Unit/Services/ConversationAudioInterruptionTests.swift` (create)

**Interfaces:**
- Consumes: `MediaSessionCoordinator.Event` (enum SDK existant), `engine.pause()` / `engine.resumeFromInterruption()` (Task 2), `test_setActiveContext(attachmentId:)` (seam DEBUG existant), `MockAudioPlaybackEngine`.
- Produces: `ConversationAudioCoordinator.init(engine:sessionEvents:)` (2e param `AnyPublisher<MediaSessionCoordinator.Event, Never>?` défaut `nil` → `MediaSessionCoordinator.shared.events`) ; `handleSessionEvent(_:)` (internal, testable en synchrone).

- [ ] **Step 1: Écrire les tests qui échouent**

```swift
// apps/ios/MeeshyTests/Unit/Services/ConversationAudioInterruptionTests.swift
import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

@MainActor
final class ConversationAudioInterruptionTests: XCTestCase {

    private func makeSUT() -> (sut: ConversationAudioCoordinator, engine: MockAudioPlaybackEngine) {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        sut.test_setActiveContext(attachmentId: "att-1")
        return (sut, engine)
    }

    /// Laisse le pipeline `isPlayingPublisher → @Published isPlaying` se vider.
    private func drainMainQueue() async {
        for _ in 0..<3 { await Task.yield() }
    }

    func test_interruptionBegan_whilePlaying_pausesEngine() async {
        let (sut, engine) = makeSUT()
        engine.isPlaying = true
        await drainMainQueue()

        sut.handleSessionEvent(.interruptionBegan)

        XCTAssertEqual(engine.pauseCallCount, 1)
    }

    func test_interruptionEndedShouldResume_afterBegan_resumesEngine() async {
        let (sut, engine) = makeSUT()
        engine.isPlaying = true
        await drainMainQueue()
        sut.handleSessionEvent(.interruptionBegan)
        await drainMainQueue()

        sut.handleSessionEvent(.interruptionEndedShouldResume)

        XCTAssertEqual(engine.resumeFromInterruptionCallCount, 1)
    }

    func test_interruptionEndedShouldResume_withoutBegan_doesNotResume() async {
        let (sut, engine) = makeSUT()

        sut.handleSessionEvent(.interruptionEndedShouldResume)

        XCTAssertEqual(engine.resumeFromInterruptionCallCount, 0)
    }

    func test_routeChangedOldDeviceUnavailable_pausesWithoutArmedResume() async {
        let (sut, engine) = makeSUT()
        engine.isPlaying = true
        await drainMainQueue()

        sut.handleSessionEvent(.routeChangedOldDeviceUnavailable)
        await drainMainQueue()
        sut.handleSessionEvent(.interruptionEndedShouldResume)

        XCTAssertEqual(engine.pauseCallCount, 1)
        XCTAssertEqual(engine.resumeFromInterruptionCallCount, 0)
    }

    func test_eventsIgnored_whileSuspendedByMeeshyCall() async {
        let (sut, engine) = makeSUT()
        engine.isPlaying = true
        await drainMainQueue()
        sut.suspendForSystemCall()

        sut.handleSessionEvent(.interruptionBegan)

        XCTAssertEqual(engine.pauseCallCount, 0)
    }

    func test_callEndedShouldResume_isIgnored_noDoubleResume() async {
        let (sut, engine) = makeSUT()
        engine.isPlaying = true
        await drainMainQueue()

        sut.handleSessionEvent(.callEndedShouldResume)

        XCTAssertEqual(engine.resumeFromInterruptionCallCount, 0)
        XCTAssertEqual(engine.pauseCallCount, 0)
    }
}
```

- [ ] **Step 2: Lancer — vérifier l'échec de compile** (`handleSessionEvent` inexistant)

Run: commande App avec `<Classe>` = `ConversationAudioInterruptionTests`
Expected: FAIL — `has no member 'handleSessionEvent'`.

- [ ] **Step 3: Implémenter**

Init (signature + câblage) :

```swift
    public init(
        engine: AudioPlaybackEngineDriving = AudioPlaybackManager(),
        sessionEvents: AnyPublisher<MediaSessionCoordinator.Event, Never>? = nil
    ) {
        self.engine = engine
        if let manager = engine as? AudioPlaybackManager {
            manager.sessionProfile = .content
            manager.playbackPermissionGuard = { !CallManager.shared.isCallActiveForAudioGuard }
        }
        wireEngineForwarding()
        wireAuthLogoutHook()
        wireSocketLifecycleHooks()
        wireSessionInterruptionHooks(
            sessionEvents ?? MediaSessionCoordinator.shared.events.eraseToAnyPublisher()
        )
    }
```

Nouvelle section (près des méthodes de suspension d'appel) :

```swift
    // MARK: - Interruptions système (Siri, appel cellulaire, route perdue)

    /// Armé par `.interruptionBegan` UNIQUEMENT si la lecture était en cours ;
    /// consommé par la fin d'interruption. Une pause déclenchée par un retrait
    /// d'AirPods (`routeChangedOldDeviceUnavailable`) ne l'arme PAS —
    /// convention iOS : débrancher = pause, sans reprise automatique.
    private var wasPlayingBeforeInterruption = false

    private func wireSessionInterruptionHooks(
        _ events: AnyPublisher<MediaSessionCoordinator.Event, Never>
    ) {
        events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.handleSessionEvent(event) }
            .store(in: &cancellables)
    }

    /// `internal` : appelé en synchrone par les tests, par le sink en prod.
    /// Les appels Meeshy (CallKit) ont leur propre chemin
    /// `suspendForSystemCall`/`resumeAfterSystemCall` piloté par CallManager ;
    /// pendant cette suspension, RTCAudioSession peut générer des
    /// interruptions parasites — tout est ignoré ici.
    func handleSessionEvent(_ event: MediaSessionCoordinator.Event) {
        guard !_isSuspendedBySystemCall else { return }
        guard activeContext != nil else { return }
        switch event {
        case .interruptionBegan:
            guard isPlaying else { return }
            wasPlayingBeforeInterruption = true
            engine.pause()
        case .interruptionEndedShouldResume:
            guard wasPlayingBeforeInterruption else { return }
            wasPlayingBeforeInterruption = false
            guard !CallManager.shared.isCallActiveForAudioGuard else { return }
            engine.resumeFromInterruption()
        case .interruptionEndedShouldNotResume:
            wasPlayingBeforeInterruption = false
        case .routeChangedOldDeviceUnavailable:
            guard isPlaying else { return }
            engine.pause()
        case .routeChangedOther, .callEndedShouldResume:
            break
        }
    }
```

Note : la carte reste affichée à rate 0 sans code supplémentaire — `engine.pause()` fait basculer `isPlaying`, le sink `$isPlaying` du pont NowPlaying republie la carte, et `activeContext` reste non-nil (contrairement à la suspension d'appel Meeshy qui l'efface via `clearNowPlayingForSystemCall`).

- [ ] **Step 4: Lancer — vérifier le vert + non-régression**

Run: commande App avec `<Classe>` = `ConversationAudioInterruptionTests`, puis `ConversationAudioCallSuspensionTests`, puis `ConversationAudioCoordinatorTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift \
        apps/ios/MeeshyTests/Unit/Services/ConversationAudioInterruptionTests.swift
git commit -m "feat(ios): pause/reprise de l'audio de conversation sur interruption système"
```

---

### Task 4: App — carte Now Playing enrichie (titre « conversation — date », artiste, position de file)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/AudioPlaybackEngineDriving.swift` (`ActiveAudioContext`, L69-104)
- Modify: `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift` (exposer `queuePosition`)
- Modify: `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator+NowPlaying.swift` (`pushNowPlayingInfo`, L92-100)
- Test: `apps/ios/MeeshyTests/Unit/Services/ConversationAudioCoordinatorTests.swift` (ajout)

**Interfaces:**
- Consumes: `history` / `queueCount` du coordinator (privés — `queuePosition` calculé dans le fichier classe).
- Produces: `ActiveAudioContext.receivedAt: Date` (nouveau champ, dernier paramètre des deux inits, défaut `Date()` sur l'init membre-à-membre) ; `ConversationAudioCoordinator.queuePosition: (index: Int, count: Int)` (internal) ; `ConversationAudioCoordinator.nowPlayingTitle(conversationName:receivedAt:)` (static, nonisolated, internal).

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `ConversationAudioCoordinatorTests`, ajouter :

```swift
    func test_nowPlayingTitle_containsConversationAndDate() {
        let date = Date(timeIntervalSince1970: 1_754_000_000)
        let title = ConversationAudioCoordinator.nowPlayingTitle(
            conversationName: "Ashley", receivedAt: date
        )
        XCTAssertTrue(title.hasPrefix("Ashley — "))
        XCTAssertGreaterThan(title.count, "Ashley — ".count)
    }

    func test_queuePosition_advancesWithHistory() {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        let now = Date()
        let make = { (id: String) in
            QueuedAudio(attachmentId: id, messageId: "m-\(id)", conversationId: "c",
                        fileUrl: "https://x/\(id).m4a", durationMs: 1000,
                        senderName: "S", senderAvatarURL: nil, receivedAt: now)
        }
        sut.play(current: make("a"), tail: [make("b"), make("c")],
                 conversationName: "Conv", conversationArtworkURL: nil)
        XCTAssertEqual(sut.queuePosition.index, 0)
        XCTAssertEqual(sut.queuePosition.count, 3)

        sut.playNext()
        XCTAssertEqual(sut.queuePosition.index, 1)
        XCTAssertEqual(sut.queuePosition.count, 3)
    }
```

- [ ] **Step 2: Lancer — vérifier l'échec de compile**

Run: commande App avec `<Classe>` = `ConversationAudioCoordinatorTests`
Expected: FAIL — `nowPlayingTitle`/`queuePosition` inexistants.

- [ ] **Step 3: Implémenter**

`ActiveAudioContext` (`AudioPlaybackEngineDriving.swift`) — ajouter le champ et le renseigner dans les deux inits :

```swift
    public let receivedAt: Date
```

- `init(from queued:…)` : `self.receivedAt = queued.receivedAt`
- init membre-à-membre : dernier paramètre `receivedAt: Date = Date()` (défaut → aucun call-site existant ne casse), `self.receivedAt = receivedAt`.

`ConversationAudioCoordinator.swift` (dans le corps de classe, accès aux privés `history`/`queueCount`) :

```swift
    /// Position 0-based dans la file complète (déjà joués + courant + à venir),
    /// publiée à la carte système (`MPNowPlayingInfoPropertyPlaybackQueueIndex`).
    var queuePosition: (index: Int, count: Int) {
        (history.count, history.count + queueCount)
    }

    /// Titre de carte « {conversation} — {date} » (parité WhatsApp : la date
    /// du vocal est le repère principal quand on rattrape une file).
    nonisolated static func nowPlayingTitle(
        conversationName: String, receivedAt: Date
    ) -> String {
        "\(conversationName) — \(receivedAt.formatted(date: .numeric, time: .shortened))"
    }
```

`pushNowPlayingInfo()` (`+NowPlaying.swift`) — remplacer le dictionnaire `info` :

```swift
        let position = queuePosition
        let info: [String: Any] = [
            MPMediaItemPropertyTitle: Self.nowPlayingTitle(
                conversationName: context.conversationName,
                receivedAt: context.receivedAt
            ),
            MPMediaItemPropertyArtist: context.senderName,
            MPMediaItemPropertyAlbumTitle: context.conversationName,
            MPMediaItemPropertyPlaybackDuration: totalDuration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? Float(speed.rawValue) : 0.0,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
            MPNowPlayingInfoPropertyPlaybackQueueCount: position.count,
            MPNowPlayingInfoPropertyPlaybackQueueIndex: position.index
        ]
```

- [ ] **Step 4: Lancer — vérifier le vert + non-régression**

Run: commande App avec `<Classe>` = `ConversationAudioCoordinatorTests`, puis `ConversationAudioCallSuspensionTests`, puis `MiniAudioPlayerBarTests` (consomme `ActiveAudioContext`)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/AudioPlaybackEngineDriving.swift \
        apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift \
        apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator+NowPlaying.swift \
        apps/ios/MeeshyTests/Unit/Services/ConversationAudioCoordinatorTests.swift
git commit -m "feat(ios): carte Now Playing avec date du vocal et position de file"
```

---

### Task 5: App — la file en PAUSE survit au passage en background (carte conservée)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift` (`MediaLifecycleBridge.prepareForBackground`, ~L258-278)
- Test: `apps/ios/MeeshyTests/Unit/Services/MediaLifecycleBridgeTests.swift` (ajout)

**Interfaces:**
- Consumes: `ConversationAudioCoordinator.sharedForTesting`, `test_setActiveContext`, `testSetShared`/`testResetShared` (seams DEBUG existants), sondes `PlaybackCoordinatorStopAllProbe` / `MediaSessionCoordinatorTestProbe` (existantes — suivre le pattern des tests déjà présents dans cette classe).
- Produces: garde étendue `isPlaying || activeContext != nil || PlaybackCoordinator.shared.isAnyPlaying`.

- [ ] **Step 1: Écrire le test qui échoue** (mimer le setup des tests existants de la classe — sondes + coordinator injecté)

```swift
    func test_prepareForBackground_pausedQueueWithContext_keepsSessionAndPlayers() async {
        let engine = MockAudioPlaybackEngine()
        let coordinator = ConversationAudioCoordinator(engine: engine)
        coordinator.test_setActiveContext(attachmentId: "paused-att")
        ConversationAudioCoordinator.testSetShared(coordinator)
        defer { ConversationAudioCoordinator.testResetShared() }

        let stopProbe = PlaybackCoordinatorStopAllProbe()
        PlaybackCoordinator.shared.testStopAllProbe = stopProbe
        defer { PlaybackCoordinator.shared.testStopAllProbe = nil }
        let sessionProbe = MediaSessionCoordinatorTestProbe()
        MediaSessionCoordinator.shared.testProbe = sessionProbe
        defer { MediaSessionCoordinator.shared.testProbe = nil }

        await MediaLifecycleBridge.shared.prepareForBackground()

        XCTAssertEqual(stopProbe.stopAllCount, 0,
            "Une file en pause (activeContext non-nil) doit survivre au background — la carte permet la reprise depuis le lock screen")
        XCTAssertEqual(sessionProbe.deactivateCount, 0)
    }
```

- [ ] **Step 2: Lancer — vérifier l'échec**

Run: commande App avec `<Classe>` = `MediaLifecycleBridgeTests`
Expected: FAIL — `stopAllCount == 1` (garde actuelle limitée à `isPlaying`).

- [ ] **Step 3: Implémenter**

Dans `MediaLifecycleBridge.prepareForBackground()` :

```swift
        if ConversationAudioCoordinator.sharedForTesting.isPlaying
            || ConversationAudioCoordinator.sharedForTesting.activeContext != nil
            || PlaybackCoordinator.shared.isAnyPlaying {
            // Lecture OU file en pause -> on ne coupe rien. UIBackgroundModes
            // "audio" couvre la lecture ; une file en PAUSE garde sa session
            // active pour rester l'app Now Playing : la carte lock screen
            // survit et son bouton play réveille l'app (parité WhatsApp).
            return
        }
```

- [ ] **Step 4: Lancer — vérifier le vert + non-régression**

Run: commande App avec `<Classe>` = `MediaLifecycleBridgeTests`, puis `MeeshyAppScenePhaseTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift \
        apps/ios/MeeshyTests/Unit/Services/MediaLifecycleBridgeTests.swift
git commit -m "fix(ios): la file audio en pause garde sa carte Now Playing en background"
```

---

### Task 6: App — avance de file fiable en background (background task court)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift` (import UIKit, seams injectables, `advanceQueue`, `close`, `wireEngineForwarding`)
- Test: `apps/ios/MeeshyTests/Unit/Services/ConversationAudioCoordinatorTests.swift` (ajout)

**Interfaces:**
- Consumes: `UIApplication.beginBackgroundTask(withName:expirationHandler:)`.
- Produces: seams internes `beginBackgroundTaskProvider: (@escaping () -> Void) -> UIBackgroundTaskIdentifier` et `endBackgroundTaskProvider: (UIBackgroundTaskIdentifier) -> Void` (var internes, remplaçables en test).

- [ ] **Step 1: Écrire le test qui échoue**

Dans `ConversationAudioCoordinatorTests`, ajouter :

```swift
    func test_advanceQueue_wrapsNextTrackStartInBackgroundTask() {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        var beginCount = 0
        var endCount = 0
        sut.beginBackgroundTaskProvider = { _ in
            beginCount += 1
            return UIBackgroundTaskIdentifier(rawValue: 42)
        }
        sut.endBackgroundTaskProvider = { _ in endCount += 1 }

        let now = Date()
        let make = { (id: String) in
            QueuedAudio(attachmentId: id, messageId: "m-\(id)", conversationId: "c",
                        fileUrl: "https://x/\(id).m4a", durationMs: 1000,
                        senderName: "S", senderAvatarURL: nil, receivedAt: now)
        }
        sut.play(current: make("a"), tail: [make("b")],
                 conversationName: "Conv", conversationArtworkURL: nil)

        engine.simulateFinishPlayback()   // fin de « a » → advanceQueue → play(« b »)

        XCTAssertEqual(beginCount, 1, "La transition a→b doit être couverte par un background task")
        // Le mock repasse isPlaying=true dans play() → la fin de tâche est
        // déclenchée par le sink isPlayingPublisher (asynchrone MainActor).
        let exp = expectation(description: "end background task")
        DispatchQueue.main.async { exp.fulfill() }
        wait(for: [exp], timeout: 1.0)
        XCTAssertEqual(endCount, 1)
    }
```

Note : `simulateFinishPlayback()` du mock appelle `onPlaybackFinished` — vérifier sa définition (fin du fichier mock) ; si l'appel à `onPlaybackFinished?()` n'y figure pas, l'y ajouter. `advanceQueue` étant déclenché via `Task { @MainActor … }`, si l'assertion `beginCount` est évaluée trop tôt, drainer avec le même pattern `expectation` AVANT l'assertion.

- [ ] **Step 2: Lancer — vérifier l'échec de compile** (seams inexistants)

Run: commande App avec `<Classe>` = `ConversationAudioCoordinatorTests`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

En tête de fichier : `import UIKit`. Dans la classe :

```swift
    // MARK: - Background task d'avance de file
    //
    // Entre deux pistes, le moteur peut toucher le réseau (cache miss). App en
    // background, dès que l'audio se tait, l'OS peut suspendre le process AVANT
    // le démarrage de la piste suivante — la file mourrait sur place. La
    // transition est donc couverte par un beginBackgroundTask court, terminé au
    // premier front isPlaying==true (ou à la fermeture/expiration).

    var beginBackgroundTaskProvider: (@escaping () -> Void) -> UIBackgroundTaskIdentifier = { handler in
        UIApplication.shared.beginBackgroundTask(
            withName: "meeshy.audio.queue-advance", expirationHandler: handler
        )
    }
    var endBackgroundTaskProvider: (UIBackgroundTaskIdentifier) -> Void = { id in
        UIApplication.shared.endBackgroundTask(id)
    }
    private var advanceTaskId: UIBackgroundTaskIdentifier = .invalid

    private func beginAdvanceBackgroundTask() {
        endAdvanceBackgroundTask()
        advanceTaskId = beginBackgroundTaskProvider { [weak self] in
            Task { @MainActor in self?.endAdvanceBackgroundTask() }
        }
    }

    private func endAdvanceBackgroundTask() {
        guard advanceTaskId != .invalid else { return }
        endBackgroundTaskProvider(advanceTaskId)
        advanceTaskId = .invalid
    }
```

Dans `advanceQueue()`, remplacer la branche finale :

```swift
        if queue.isEmpty {
            engine.stop()
            activeContext = nil
            endAdvanceBackgroundTask()
        } else {
            beginAdvanceBackgroundTask()
            startCurrentHead()
        }
```

Dans `close()` : ajouter `endAdvanceBackgroundTask()` après `engine.stop()`.

Dans `wireEngineForwarding()`, après les `assign` :

```swift
        engine.isPlayingPublisher
            .filter { $0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.endAdvanceBackgroundTask() }
            .store(in: &cancellables)
```

- [ ] **Step 4: Lancer — vérifier le vert**

Run: commande App avec `<Classe>` = `ConversationAudioCoordinatorTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift \
        apps/ios/MeeshyTests/Unit/Services/ConversationAudioCoordinatorTests.swift
git commit -m "feat(ios): l'avance de file audio est couverte par un background task"
```

---

### Task 7: App — `playVariant` + fusion du plein écran audio dans le coordinator

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift` (nouvelle méthode `playVariant`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift` (`AudioFullscreenSource` L14-49, `AudioFullscreenPage` L185+ : moteur, `startPlayback` ~L460, `selectLanguage` ~L983, play button ~L691, `onDisappear`/`adaptiveOnChange` ~L373-382)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (extraire `audioQueueTail(after:)` de `playAudio` ~L2005)
- Test: `apps/ios/MeeshyTests/Unit/Services/ConversationAudioCoordinatorTests.swift` (playVariant) + `apps/ios/MeeshyTests/Unit/Views/AudioFullscreenSourceQueueTests.swift` (create)

**Interfaces:**
- Consumes: `coordinator.play(current:tail:conversationName:conversationArtworkURL:)`, `engineForBubble`, `isActive(attachmentId:)` (existants).
- Produces: `ConversationAudioCoordinator.playVariant(urlString:)` ; `AudioFullscreenSource.conversationId: String?`, `.nowPlayingContextName: String`, `.queueTailProvider: (() -> [QueuedAudio])?` (nouveaux, défauts `nil`/`authorName`/`nil`) ; `AudioFullscreenSource.queuedAudio(urlString:) -> QueuedAudio` ; `ConversationViewModel.audioQueueTail(after:) -> [QueuedAudio]`.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `ConversationAudioCoordinatorTests` :

```swift
    func test_playVariant_swapsUrl_keepsContextAndQueue() {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        let now = Date()
        let make = { (id: String) in
            QueuedAudio(attachmentId: id, messageId: "m-\(id)", conversationId: "c",
                        fileUrl: "https://x/\(id).m4a", durationMs: 1000,
                        senderName: "S", senderAvatarURL: nil, receivedAt: now)
        }
        sut.play(current: make("a"), tail: [make("b")],
                 conversationName: "Conv", conversationArtworkURL: nil)
        let contextBefore = sut.activeContext

        sut.playVariant(urlString: "https://x/a-es.m4a")

        XCTAssertEqual(engine.lastPlayedUrl, "https://x/a-es.m4a")
        XCTAssertEqual(sut.activeContext, contextBefore)
        XCTAssertEqual(sut.queueCount, 2)
    }

    func test_playVariant_withoutActiveContext_isNoOp() {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)

        sut.playVariant(urlString: "https://x/a-es.m4a")

        XCTAssertEqual(engine.playCallCount, 0)
    }
```

Nouveau fichier `AudioFullscreenSourceQueueTests.swift` :

```swift
import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class AudioFullscreenSourceQueueTests: XCTestCase {

    func test_queuedAudio_mapsSourceFields() {
        let att = MessageAttachment(
            id: "att-9", type: .audio, fileUrl: "https://x/original.m4a",
            fileName: "a.m4a", fileSize: 100, mimeType: "audio/m4a",
            thumbnailUrl: nil, width: nil, height: nil, duration: 4200
        )
        let created = Date(timeIntervalSince1970: 1_754_000_000)
        let source = AudioFullscreenSource(
            id: att.id, attachment: att, transcription: nil, translatedAudios: [],
            originalLanguage: "fr", caption: "", author: ProfileSheetUser(
                userId: "u1", username: "ashley", displayName: "Ashley",
                avatarURL: nil, accentColor: "#6366F1"
            ),
            createdAt: created, messageId: "msg-1", conversationId: "conv-1"
        )

        let queued = source.queuedAudio(urlString: "https://x/es.m4a")

        XCTAssertEqual(queued.attachmentId, "att-9")
        XCTAssertEqual(queued.messageId, "msg-1")
        XCTAssertEqual(queued.conversationId, "conv-1")
        XCTAssertEqual(queued.fileUrl, "https://x/es.m4a")
        XCTAssertEqual(queued.durationMs, 4200)
        XCTAssertEqual(queued.senderName, "Ashley")
        XCTAssertEqual(queued.receivedAt, created)
    }

    func test_queuedAudio_standaloneSource_fallsBackToAttachmentIds() {
        let att = MessageAttachment(
            id: "att-7", type: .audio, fileUrl: "https://x/feed.m4a",
            fileName: "f.m4a", fileSize: 100, mimeType: "audio/m4a",
            thumbnailUrl: nil, width: nil, height: nil, duration: nil
        )
        let source = AudioFullscreenSource(
            id: att.id, attachment: att, transcription: nil, translatedAudios: [],
            originalLanguage: "fr", caption: "", author: ProfileSheetUser(
                userId: "u1", username: "ashley", displayName: nil,
                avatarURL: nil, accentColor: "#6366F1"
            ),
            createdAt: Date()
        )

        let queued = source.queuedAudio(urlString: att.fileUrl)

        XCTAssertEqual(queued.messageId, "att-7")
        XCTAssertEqual(queued.conversationId, "")
        XCTAssertEqual(queued.durationMs, 0)
        XCTAssertEqual(queued.senderName, "ashley")
    }
}
```

⚠️ Adapter les inits `MessageAttachment`/`ProfileSheetUser` à leurs signatures réelles (vérifier dans `packages/MeeshySDK` et l'app — utiliser les vrais types, ne jamais les redéfinir).

- [ ] **Step 2: Lancer — vérifier l'échec de compile**

Run: commande App avec `<Classe>` = `ConversationAudioCoordinatorTests` puis `AudioFullscreenSourceQueueTests`
Expected: FAIL — `playVariant`/`queuedAudio`/`conversationId` inexistants.

- [ ] **Step 3: Implémenter le coordinator et la source**

`ConversationAudioCoordinator.swift` (section API publique) :

```swift
    /// Change la piste jouée pour l'attachment ACTIF (variante traduite Prisme
    /// ou retour à l'original) en CONSERVANT le contexte et la file — le
    /// sélecteur de langue du plein écran route ici pour que la carte système
    /// et l'enchaînement survivent au changement de langue.
    public func playVariant(urlString: String) {
        guard !CallManager.shared.isCallActiveForAudioGuard else { return }
        guard activeContext != nil, !urlString.isEmpty else { return }
        engine.play(urlString: urlString)
    }
```

`AudioFullscreenSource` — trois champs (défauts rétro-compatibles ; TOUS les inits existants continuent de compiler) + fabrique :

```swift
    /// Conversation d'origine — nil pour feed/commentaire/post.
    let conversationId: String?
    /// Nom affiché par la carte Now Playing (conversation, sinon auteur).
    let nowPlayingContextName: String
    /// File « à suivre » fournie par la conversation (vocaux non écoutés
    /// après celui-ci) ; nil pour les surfaces standalone.
    let queueTailProvider: (() -> [QueuedAudio])?

    func queuedAudio(urlString: String) -> QueuedAudio {
        QueuedAudio(
            attachmentId: attachment.id,
            messageId: messageId ?? attachment.id,
            conversationId: conversationId ?? "",
            fileUrl: urlString,
            durationMs: attachment.duration ?? 0,
            senderName: authorName,
            senderAvatarURL: authorAvatarURL,
            receivedAt: createdAt
        )
    }
```

Init désigné : ajouter `conversationId: String? = nil`, `nowPlayingContextName: String? = nil`, `queueTailProvider: (() -> [QueuedAudio])? = nil` en fin de paramètres ; `self.nowPlayingContextName = nowPlayingContextName ?? (author.displayName ?? author.username)`. Propager les trois sur `init(from item: ConversationViewModel.AudioItem)` (mêmes défauts) et sur `.fromFeed` si des paramètres nommés y sont requis.

`ConversationViewModel.swift` — extraire la construction de tail (DRY avec `playAudio`) :

```swift
    /// File des vocaux non écoutés strictement APRÈS `attachmentId` — partagée
    /// entre `playAudio` et le plein écran (queueTailProvider).
    func audioQueueTail(after attachmentId: String) -> [QueuedAudio] {
        guard let currentUserId = authManager.currentUser?.id else { return [] }
        return AudioQueueBuilder.build(
            from: messages,
            startingAfterAttachmentId: attachmentId,
            currentUserId: currentUserId,
            listenedAttachmentIds: listenedAttachmentIds
        )
    }
```

et dans `playAudio(attachmentId:)`, remplacer le bloc `let tail = AudioQueueBuilder.build(…)` par `let tail = audioQueueTail(after: attachment.id)`.

- [ ] **Step 4: Brancher `AudioFullscreenPage` sur le coordinator**

Dans `AudioFullscreenPage` :

1. Remplacer `@StateObject private var player = AudioPlaybackManager()` par :

```swift
    /// Moteur du coordinator — le plein écran n'a PLUS de moteur propre :
    /// la lecture continue à la fermeture (mini-player) et la carte système
    /// suit. Le repli ne sert qu'aux previews sans coordinator actif.
    @ObservedObject private var player: AudioPlaybackManager
```

et initialiser dans un `init` explicite de `AudioFullscreenPage` (conserver les autres `let` en paramètres) :

```swift
        self._player = ObservedObject(
            wrappedValue: ConversationAudioCoordinator.sharedForTesting.engineForBubble
                ?? AudioPlaybackManager(registerWithCoordinator: false)
        )
```

2. `startPlayback()` :

```swift
    private func startPlayback() {
        playThroughCoordinator(urlString: currentAudioUrl)
        loadWaveform()
    }

    private func playThroughCoordinator(urlString: String) {
        let coordinator = ConversationAudioCoordinator.sharedForTesting
        if coordinator.isActive(attachmentId: attachment.id) {
            if urlString != player.currentUrl {
                coordinator.playVariant(urlString: urlString)
            }
            return
        }
        coordinator.play(
            current: item.queuedAudio(urlString: urlString),
            tail: item.queueTailProvider?() ?? [],
            conversationName: item.nowPlayingContextName,
            conversationArtworkURL: item.authorAvatarURL
        )
    }
```

(`item` = la propriété `AudioFullscreenSource` existante de la page ; si elle porte un autre nom, s'aligner.)

3. `selectLanguage(_:)` : remplacer les deux `player.play(urlString: …)` par `playThroughCoordinator(urlString: attachment.fileUrl)` / `playThroughCoordinator(urlString: audio.url)`.

4. Bouton play (~L691) : remplacer `player.play(urlString: currentAudioUrl)` par `playThroughCoordinator(urlString: currentAudioUrl)`.

5. Fermeture : dans `.adaptiveOnChange(of: isActive)` supprimer le `player.stop()` de la branche `else` et le remplacer par rien (le changement de page appelle `startPlayback()` de la nouvelle page, qui re-file le coordinator). Dans `.onDisappear`, supprimer `player.stop()` ET `player.unregisterFromCoordinator()` — fermer le plein écran laisse la lecture continuer (mini-player + carte).

- [ ] **Step 5: Lancer — vérifier le vert**

Run: commande App avec `<Classe>` = `ConversationAudioCoordinatorTests`, `AudioFullscreenSourceQueueTests`
Expected: PASS.
Puis build complet : `cd apps/ios && xcodegen generate && cd - && ./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED (le plein écran compile avec le moteur partagé).

- [ ] **Step 6: Câbler la tail conversation**

Localiser le call-site conversation qui construit la source :

```bash
grep -rn "AudioFullscreenSource(from:\|\.init(from: " apps/ios/Meeshy --include="*.swift" | grep -i audio
grep -rn "audioFullscreenCover\|AudioFullscreenSource(" apps/ios/Meeshy/Features/Main/Views/ConversationView*.swift apps/ios/Meeshy/Features/Main/Views/AudioMediaView.swift 2>/dev/null
```

Au site conversation (celui qui a accès au `viewModel`), passer les nouveaux champs :

```swift
AudioFullscreenSource(
    from: item,
    conversationId: viewModel.conversationId,
    nowPlayingContextName: viewModel.currentConversationName,
    queueTailProvider: { [weak viewModel] in
        viewModel?.audioQueueTail(after: item.attachment.id) ?? []
    }
)
```

(adapter les noms exacts : `viewModel.conversationId` / `currentConversationName` existent dans `ConversationViewModel` — vérifier par grep ; si le site passe par `init(from:)` sans wrapper, étendre cet init avec les trois paramètres optionnels comme défini au Step 3.)

- [ ] **Step 7: Vérifier build + suites**

Run: `./apps/ios/meeshy.sh build` puis commande App `<Classe>` = `ConversationViewModelAudioTests`
Expected: BUILD SUCCEEDED, PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift \
        apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift \
        apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
        apps/ios/MeeshyTests/Unit/Services/ConversationAudioCoordinatorTests.swift \
        apps/ios/MeeshyTests/Unit/Views/AudioFullscreenSourceQueueTests.swift
git commit -m "feat(ios): le plein écran audio fusionne dans le coordinator (carte + file + variantes)"
```

---

### Task 8: App — le bouton scroll-to-audio route la file du coordinator

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (L262 : supprimer `scrollButtonAudioPlayer` ; L1031 : retirer son `.stop()` ; ajouter `@State var scrollButtonAudioIsPlaying = false`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift` (L41-58)

**Interfaces:**
- Consumes: `viewModel.playAudio(attachmentId:)`, `ConversationAudioCoordinator.sharedForTesting.isActive(attachmentId:)` / `.togglePlayPause()` / `$activeContext` / `$isPlaying`.
- Produces: rien de nouveau — suppression d'un moteur éparpillé.

- [ ] **Step 1: Implémenter** (pas de nouveau test unitaire : le chemin `playAudio` est déjà couvert par `ConversationViewModelAudioTests` ; le delta est du câblage View pur, vérifié par build + non-régression)

`ConversationView.swift` :
- supprimer la ligne `@StateObject var scrollButtonAudioPlayer = AudioPlaybackManager()` ;
- ajouter à la place `@State var scrollButtonAudioIsPlaying = false` ;
- L1031 : supprimer `scrollButtonAudioPlayer.stop()` (le coordinator DOIT survivre à la sortie de conversation — c'est le mini-player qui prend le relais) ; conserver `pendingAudioPlayer.stop()` (préversion composer, locale).

`ConversationView+ScrollIndicators.swift` — dans `scrollToBottomButton` :

```swift
            isAudioPlaying: scrollButtonAudioIsPlaying,
```

et le handler :

```swift
            onPlayAudio: {
                HapticFeedback.light()
                guard let att = unreadAttachment, att.type == .audio else { return }
                let coordinator = ConversationAudioCoordinator.sharedForTesting
                if coordinator.isActive(attachmentId: att.id) {
                    coordinator.togglePlayPause()
                } else {
                    viewModel.playAudio(attachmentId: att.id)
                }
            }
```

Sous `.accessibilityLabel(scrollToBottomAccessibilityLabel)`, ajouter l'observation dérivée (mêmes précautions anti-re-render que `AudioBubbleRouter` : bool dérivé + `removeDuplicates`) :

```swift
        .onReceive(
            ConversationAudioCoordinator.sharedForTesting.$activeContext
                .combineLatest(ConversationAudioCoordinator.sharedForTesting.$isPlaying)
                .map { [id = unreadAttachment?.id] context, playing in
                    playing && id != nil && context?.attachmentId == id
                }
                .removeDuplicates()
        ) { scrollButtonAudioIsPlaying = $0 }
```

- [ ] **Step 2: Build + non-régression**

Run: `cd apps/ios && xcodegen generate && cd - && ./apps/ios/meeshy.sh build`, puis commande App `<Classe>` = `ConversationViewModelAudioTests`
Expected: BUILD SUCCEEDED, PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift
git commit -m "feat(ios): le bouton scroll-to-audio démarre la file du coordinator"
```

---

### Task 9: App — routeur standalone : feed, commentaires, détail de post sur le coordinator

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Bubble/CoordinatedAudioPlayer.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift` (~L307), `apps/ios/Meeshy/Features/Main/Views/CommentMediaView.swift` (~L129 et ~L236), `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` (~L1480 et ~L1858)
- Test: `apps/ios/MeeshyTests/Unit/Views/Bubble/CoordinatedAudioPlayerTests.swift` (create)

**Interfaces:**
- Consumes: `AudioPlayerView(… externalPlayer: AudioPlaybackManager?, onPlayRequest: (() -> Void)?)` (paramètres existants — mêmes noms que dans `AudioBubbleRouter.swift` L200-260), `coordinator.play(current:tail:conversationName:conversationArtworkURL:)`, `engineForBubble`.
- Produces: `CoordinatedAudioPlayer<Player: View>` (init : `attachmentId:`, `nowPlayingName:`, `nowPlayingArtworkURL:`, `coordinatorForTesting:`, `makeQueuedAudio:`, `@ViewBuilder player:`) avec `isActiveForTesting: Bool` et `requestPlayForTesting()`.

**Hors périmètre explicite : `ReelsPlayerView`** — les réels restent `.transient` (parité avec les réels vidéo `.duckOthers`, pas de carte lock screen, décision de spec). Ne PAS toucher `ReelsPlayerView.swift`.

- [ ] **Step 1: Écrire les tests qui échouent**

```swift
// apps/ios/MeeshyTests/Unit/Views/Bubble/CoordinatedAudioPlayerTests.swift
import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

@MainActor
final class CoordinatedAudioPlayerTests: XCTestCase {

    private func makeQueued(_ id: String) -> QueuedAudio {
        QueuedAudio(attachmentId: id, messageId: "post-1", conversationId: "post-1",
                    fileUrl: "https://x/\(id).m4a", durationMs: 1000,
                    senderName: "Ashley", senderAvatarURL: nil, receivedAt: Date())
    }

    private func makeSUT(
        attachmentId: String, coordinator: ConversationAudioCoordinator
    ) -> CoordinatedAudioPlayer<EmptyView> {
        CoordinatedAudioPlayer(
            attachmentId: attachmentId,
            nowPlayingName: "Ashley",
            nowPlayingArtworkURL: nil,
            coordinatorForTesting: coordinator,
            makeQueuedAudio: { self.makeQueued(attachmentId) }
        ) { _, _ in EmptyView() }
    }

    func test_inactive_whenCoordinatorPlaysAnotherAttachment() {
        let coordinator = ConversationAudioCoordinator(engine: MockAudioPlaybackEngine())
        coordinator.test_setActiveContext(attachmentId: "other")
        let sut = makeSUT(attachmentId: "mine", coordinator: coordinator)
        XCTAssertFalse(sut.isActiveForTesting)
    }

    func test_active_whenCoordinatorPlaysThisAttachment() {
        let coordinator = ConversationAudioCoordinator(engine: MockAudioPlaybackEngine())
        coordinator.test_setActiveContext(attachmentId: "mine")
        let sut = makeSUT(attachmentId: "mine", coordinator: coordinator)
        XCTAssertTrue(sut.isActiveForTesting)
    }

    func test_playRequest_startsSingleItemQueueOnCoordinator() {
        let engine = MockAudioPlaybackEngine()
        let coordinator = ConversationAudioCoordinator(engine: engine)
        let sut = makeSUT(attachmentId: "mine", coordinator: coordinator)

        sut.requestPlayForTesting()

        XCTAssertEqual(coordinator.queueCount, 1)
        XCTAssertEqual(coordinator.activeContext?.attachmentId, "mine")
        XCTAssertEqual(coordinator.activeContext?.conversationName, "Ashley")
        XCTAssertEqual(engine.lastPlayedUrl, "https://x/mine.m4a")
    }
}
```

- [ ] **Step 2: Lancer — vérifier l'échec de compile**

Run: commande App avec `<Classe>` = `CoordinatedAudioPlayerTests`
Expected: FAIL — type inexistant.

- [ ] **Step 3: Implémenter le routeur**

```swift
// apps/ios/Meeshy/Features/Main/Views/Bubble/CoordinatedAudioPlayer.swift
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Routeur coordinator pour les surfaces audio HORS conversation (feed,
/// commentaire, détail de post). Miroir de `AudioBubbleRouter` : actif →
/// l'`AudioPlayerView` rendue par `player` reçoit le moteur du coordinator
/// (carte Now Playing, lecture background, mini-player) ; inactif → moteur
/// local possédé par la vue, et le tap play démarre une file d'UN élément
/// sur le coordinator. Décision produit Meeshy → app-side (SDK purity).
///
/// Les réels n'utilisent PAS ce routeur (profil `.transient`, parité avec
/// les réels vidéo — décision de spec 2026-08-10).
struct CoordinatedAudioPlayer<Player: View>: View {
    let attachmentId: String
    let nowPlayingName: String
    let nowPlayingArtworkURL: String?
    let makeQueuedAudio: () -> QueuedAudio
    /// Rend la vue player : reçoit (externalPlayer, onPlayRequest).
    let player: (AudioPlaybackManager?, @escaping () -> Void) -> Player

    @State private var externalEngine: AudioPlaybackManager?
    private let coordinator: ConversationAudioCoordinator
    private let activePublisher: AnyPublisher<Bool, Never>

    init(
        attachmentId: String,
        nowPlayingName: String,
        nowPlayingArtworkURL: String? = nil,
        coordinatorForTesting: ConversationAudioCoordinator? = nil,
        makeQueuedAudio: @escaping () -> QueuedAudio,
        @ViewBuilder player: @escaping (AudioPlaybackManager?, @escaping () -> Void) -> Player
    ) {
        self.attachmentId = attachmentId
        self.nowPlayingName = nowPlayingName
        self.nowPlayingArtworkURL = nowPlayingArtworkURL
        self.makeQueuedAudio = makeQueuedAudio
        self.player = player
        let coord = coordinatorForTesting ?? .shared
        self.coordinator = coord
        self.activePublisher = coord.$activeContext
            .map { $0?.attachmentId == attachmentId }
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    var isActiveForTesting: Bool {
        coordinator.activeContext?.attachmentId == attachmentId
    }

    func requestPlayForTesting() { startOnCoordinator() }

    private func startOnCoordinator() {
        coordinator.play(
            current: makeQueuedAudio(),
            tail: [],
            conversationName: nowPlayingName,
            conversationArtworkURL: nowPlayingArtworkURL
        )
    }

    var body: some View {
        player(externalEngine) { startOnCoordinator() }
            .onReceive(activePublisher) { active in
                externalEngine = active ? coordinator.engineForBubble : nil
            }
    }
}
```

- [ ] **Step 4: Lancer — vérifier le vert**

Run: commande App avec `<Classe>` = `CoordinatedAudioPlayerTests`
Expected: PASS.

- [ ] **Step 5: Brancher les cinq sites**

Sites (retrouver les lignes exactes par `grep -n "AudioPlayerView(" <fichier>`) :
- `FeedPostCard+Media.swift:~307`
- `CommentMediaView.swift:~129` et `~236`
- `PostDetailView.swift:~1480` et `~1858`

Transformation type (exemple FeedPostCard — adapter les identifiants de contexte réellement disponibles à chaque site : media/attachment, auteur, date de création, id du post ou commentaire) :

```swift
// AVANT
AudioPlayerView(attachment: att, context: .feed, accentColor: accent, …)

// APRÈS
CoordinatedAudioPlayer(
    attachmentId: att.id,
    nowPlayingName: authorDisplayName,
    nowPlayingArtworkURL: authorAvatarURL,
    makeQueuedAudio: {
        QueuedAudio(
            attachmentId: att.id,
            messageId: postId,
            conversationId: postId,
            fileUrl: att.fileUrl,
            durationMs: att.duration ?? 0,
            senderName: authorDisplayName,
            senderAvatarURL: authorAvatarURL,
            receivedAt: postCreatedAt
        )
    }
) { external, onPlay in
    AudioPlayerView(attachment: att, context: .feed, accentColor: accent, …,
                    externalPlayer: external,
                    onPlayRequest: onPlay)
}
```

Règles :
- garder TOUS les paramètres existants de l'`AudioPlayerView` (transcription, translatedAudios, onFullscreen, availability, onDownload…) — on n'ajoute que `externalPlayer:`/`onPlayRequest:` (ordre des paramètres : reprendre celui de `AudioBubbleRouter.swift` L200-260) ;
- si le site enveloppe déjà l'`AudioPlayerView` dans `AudioAvailabilityResolver`, insérer `CoordinatedAudioPlayer` ENTRE le resolver et l'`AudioPlayerView` (le resolver fournit availability/onDownload au closure `content`) ;
- `postId`/`commentId` : utiliser l'id de l'entité porteuse ; `receivedAt` : sa date de création.

- [ ] **Step 6: Build + non-régression**

Run: `cd apps/ios && xcodegen generate && cd - && ./apps/ios/meeshy.sh build`, puis commande App `<Classe>` = `AudioBubbleRouterTests`
Expected: BUILD SUCCEEDED, PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/CoordinatedAudioPlayer.swift \
        apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift \
        apps/ios/Meeshy/Features/Main/Views/CommentMediaView.swift \
        apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift \
        apps/ios/MeeshyTests/Unit/Views/Bubble/CoordinatedAudioPlayerTests.swift
git commit -m "feat(ios): feed, commentaires et posts audio passent par le coordinator Now Playing"
```

---

### Task 10: App — AirPlay dans le plein écran + gate final

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift` (rangée transport, près du bouton play ~L691)

**Interfaces:**
- Consumes: `AirPlayRoutePicker(tintColor:)` (SDK, usage de référence : `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoTransportControls.swift:162`).

- [ ] **Step 1: Ajouter le picker**

Dans la rangée des contrôles de transport du plein écran (le `HStack` contenant reculer-10s / play / avancer-10s), ajouter en fin de rangée :

```swift
            AirPlayRoutePicker(tintColor: .white)
                .frame(width: 44, height: 44)
                .accessibilityLabel(String(localized: "audio.fullscreen.airplay",
                    defaultValue: "Diffuser sur un appareil", bundle: .main))
```

- [ ] **Step 2: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Gate complet**

Run: `./apps/ios/meeshy.sh test`
Expected: phases 0/1/2/3 vertes (le script sort non-zéro si une phase est rouge). En cas de rouge : diagnostiquer — `** TEST FAILED ** + exit 65` = échec de COMPILE (lire la ligne `error:`), pas un test flaky.

- [ ] **Step 4: Vérification manuelle simulateur**

```bash
./apps/ios/meeshy.sh run
```
1. Ouvrir une conversation avec des vocaux, lancer une écoute.
2. Ouvrir le Control Center simulé (menu Device) → la carte Meeshy doit afficher « {conversation} — {date} » / expéditeur, avec next/prev actifs.
3. Home (Cmd+Shift+H) → l'audio continue ; next/prev depuis la carte avancent/reculent la file.
4. Mettre en pause puis Home → la carte reste, play depuis la carte reprend.
5. Ouvrir le plein écran audio → changer de langue → la carte reste, la lecture bascule ; fermer le plein écran → mini-player + audio continuent.
6. Vérifier device réel (utilisateur) : lock screen + AirPlay.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift
git commit -m "feat(ios): bouton AirPlay dans le plein écran audio"
```

---

## Self-review du plan (fait à l'écriture)

- **Couverture spec** : D1→Tasks 1-2 ; D2→Task 3 ; D3 (plein écran, scroll, standalone)→Tasks 7-9 ; D3bis→Task 5 ; D4→Task 6 ; D5→Task 4 ; D6→Task 10 ; « préviews/réels `.transient` »→défaut fail-safe Task 1 (aucun changement de code requis sur `pendingAudioPlayer`/`StatusBubbleOverlay`/`ReelsPlayerView`, exclusion documentée Task 9).
- **Types cohérents** : `pause()`/`resumeFromInterruption()` définis Task 1 (SDK), exposés au protocole Task 2, consommés Task 3 ; `receivedAt` défini Task 4, consommé Task 7 (`queuedAudio` via `QueuedAudio.receivedAt` existant — pas de dépendance d'ordre) ; `playVariant` défini et consommé Task 7.
- **Points d'attention implémenteur** : signatures réelles de `MessageAttachment`/`ProfileSheetUser` dans les fixtures (Task 7) ; ordre exact des paramètres d'`AudioPlayerView` (copier `AudioBubbleRouter`) ; ne JAMAIS committer le churn pbxproj (WIP concurrent dans le worktree).
