import XCTest
import Combine
import MediaPlayer
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// Suspension du pont Now Playing pendant un appel.
///
/// Contexte : `CallManager.callState.didSet` appelle `PlaybackCoordinator.stopAll()`
/// à l'entrée en appel, ce qui DÉTRUIT déjà le lecteur (`player = nil`). Ce qui
/// survivait, c'était `activeContext` et la publication vers
/// `MPNowPlayingInfoCenter` — d'où une carte figée à 00:00 dans le Control Center
/// pendant tout l'appel, avec des transports dont deux sur cinq n'étaient pas
/// gardés : un tap « suivant » détruisait la tête de file.
///
/// La suspension doit donc vider la carte et désarmer les commandes SANS toucher
/// à la file : c'est elle qui rend la reprise possible en fin d'appel.
@MainActor
final class ConversationAudioCallSuspensionTests: XCTestCase {

    override func tearDown() async throws {
        CallManager.shared.testOverrideCallActive = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        try await super.tearDown()
    }

    // MARK: - Factories

    private func makeQueuedAudio(_ attachmentId: String, url: String) -> QueuedAudio {
        QueuedAudio(
            attachmentId: attachmentId,
            messageId: "msg-\(attachmentId)",
            conversationId: "conv-1",
            fileUrl: url,
            durationMs: 5_000,
            senderName: "Alice",
            senderAvatarURL: nil,
            receivedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    /// Coordinateur avec une file de deux pistes, la première en cours de lecture.
    private func makePlayingSUT() -> (ConversationAudioCoordinator, MockAudioPlaybackEngine) {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        sut.play(
            current: makeQueuedAudio("a1", url: "https://cdn/a1.m4a"),
            tail: [makeQueuedAudio("a2", url: "https://cdn/a2.m4a")],
            conversationName: "Conv",
            conversationArtworkURL: nil
        )
        engine.isPlaying = true
        return (sut, engine)
    }

    /// Le pont Now Playing publie via des sinks différés (`.receive(on:)` sur
    /// `$activeContext`, `.throttle(250 ms)` sur `$currentTime`) : la carte
    /// n'existe pas au retour de `activateNowPlayingBridge()`.
    ///
    /// Attendre sa parution est indispensable, et pas seulement pour la
    /// commodité du test : sans cette attente, un test « la carte est nil après
    /// suspension » passe au vert alors qu'aucune carte n'a jamais été publiée —
    /// il ne prouve rien du gate qu'il prétend couvrir.
    @discardableResult
    private func waitForNowPlayingCard(timeout: TimeInterval = 2.0) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if MPNowPlayingInfoCenter.default().nowPlayingInfo != nil { return true }
            try? await Task.sleep(for: .milliseconds(20))
        }
        return false
    }

    // MARK: - Suspension

    func test_suspendForSystemCall_preservesQueueAndActiveContext() {
        let (sut, _) = makePlayingSUT()
        XCTAssertEqual(sut.activeContext?.attachmentId, "a1")

        sut.suspendForSystemCall()

        XCTAssertEqual(sut.activeContext?.attachmentId, "a1",
                       "Le contexte doit survivre à l'appel — c'est lui qui rend la reprise possible")
        XCTAssertEqual(sut.queueCount, 2, "La file ne doit pas être consommée par la suspension")
    }

    func test_suspendForSystemCall_clearsNowPlayingCard() async {
        let (sut, _) = makePlayingSUT()
        sut.activateNowPlayingBridge()
        let published = await waitForNowPlayingCard()
        XCTAssertTrue(published, "Précondition : la carte doit d'abord exister")

        sut.suspendForSystemCall()

        XCTAssertNil(MPNowPlayingInfoCenter.default().nowPlayingInfo)
    }

    func test_suspendForSystemCall_disarmsRemoteCommands() {
        let (sut, _) = makePlayingSUT()
        sut.activateNowPlayingBridge()

        sut.suspendForSystemCall()

        let center = MPRemoteCommandCenter.shared()
        XCTAssertFalse(center.playCommand.isEnabled)
        XCTAssertFalse(center.pauseCommand.isEnabled)
        XCTAssertFalse(center.nextTrackCommand.isEnabled)
        XCTAssertFalse(center.previousTrackCommand.isEnabled)
        XCTAssertFalse(center.changePlaybackPositionCommand.isEnabled)
    }

    /// Sans gate sur la publication, le prochain tick de progression republierait
    /// la carte que la suspension vient d'effacer.
    func test_progressTick_whileSuspended_doesNotRepublishCard() async {
        let (sut, engine) = makePlayingSUT()
        sut.activateNowPlayingBridge()
        // La carte doit avoir RÉELLEMENT été publiée avant qu'on la supprime,
        // sinon ce test passerait sur un pont inerte sans rien prouver.
        let published = await waitForNowPlayingCard()
        XCTAssertTrue(published, "Précondition : la carte doit d'abord exister")
        sut.suspendForSystemCall()

        // Au-delà de la fenêtre de throttle de 250 ms du sink `$currentTime`.
        engine.currentTime = 4.2
        try? await Task.sleep(for: .milliseconds(400))

        XCTAssertNil(MPNowPlayingInfoCenter.default().nowPlayingInfo,
                     "Le gate doit tenir : un tick ne republie pas la carte pendant l'appel")
    }

    // MARK: - Reprise

    func test_resumeAfterSystemCall_whenPlaybackWasActive_restartsCurrentHead() {
        let (sut, engine) = makePlayingSUT()
        let playsBeforeCall = engine.playCallCount
        sut.suspendForSystemCall()

        sut.resumeAfterSystemCall()

        XCTAssertEqual(engine.playCallCount, playsBeforeCall + 1,
                       "La reprise passe par un vrai play() — togglePlayPause est un no-op après stop()")
        XCTAssertEqual(engine.lastPlayedUrl, "https://cdn/a1.m4a")
    }

    /// Un vocal que l'utilisateur avait lui-même mis en pause ne doit pas se
    /// réveiller à la fin de l'appel.
    func test_resumeAfterSystemCall_whenPlaybackWasPaused_doesNotRestart() {
        let (sut, engine) = makePlayingSUT()
        engine.isPlaying = false
        let playsBeforeCall = engine.playCallCount
        sut.suspendForSystemCall()

        sut.resumeAfterSystemCall()

        XCTAssertEqual(engine.playCallCount, playsBeforeCall,
                       "Une lecture déjà en pause avant l'appel ne doit pas repartir seule")
    }

    func test_resumeAfterSystemCall_rearmsRemoteCommands() {
        let (sut, _) = makePlayingSUT()
        sut.activateNowPlayingBridge()
        sut.suspendForSystemCall()

        sut.resumeAfterSystemCall()

        let center = MPRemoteCommandCenter.shared()
        XCTAssertTrue(center.playCommand.isEnabled)
        XCTAssertTrue(center.nextTrackCommand.isEnabled)
    }

    func test_resumeAfterSystemCall_withoutPriorSuspension_isNoOp() {
        let (sut, engine) = makePlayingSUT()
        let playsBefore = engine.playCallCount

        sut.resumeAfterSystemCall()

        XCTAssertEqual(engine.playCallCount, playsBefore)
    }

    // MARK: - Commandes non gardées

    /// `playNext()` n'a jamais consulté l'état d'appel : il dépile la tête, la
    /// marque consommée et peut nil-er `activeContext`. Un tap « suivant » sur
    /// la carte périmée détruisait donc la file pendant l'appel.
    func test_playNext_duringActiveCall_doesNotConsumeQueueHead() {
        let (sut, _) = makePlayingSUT()
        CallManager.shared.testOverrideCallActive = true

        sut.playNext()

        XCTAssertEqual(sut.activeContext?.attachmentId, "a1",
                       "La tête de file ne doit pas être consommée pendant un appel")
        XCTAssertEqual(sut.queueCount, 2)
    }
}
