import XCTest
import Combine
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #11040, décisions porteur i et j (2026-10-20) — l'aperçu d'un vocal
/// (appui long) reprend après une interruption comme tous les lecteurs, et
/// rend la session à la musique qu'il a coupée : à la fin de la piste, après
/// une pause (≈ 3 s, par le coordinateur), et — par le coordinateur — après
/// une interruption sans reprise.
@MainActor
final class OverlayAudioPlayerInterruptionResumeTests: XCTestCase {

    private let events = PassthroughSubject<MediaSessionCoordinator.Event, Never>()
    private var activations = 0
    private var releases = 0
    private var pauseReleases = 0

    private func makePlayingPlayer() async -> OverlayAudioPlayer {
        let player = OverlayAudioPlayer(
            sessionEvents: events.eraseToAnyPublisher(),
            activateSession: { [weak self] in self?.activations += 1 },
            releaseSession: { [weak self] in self?.releases += 1 },
            releaseSessionAfterPause: { [weak self] in self?.pauseReleases += 1 }
        )
        addTeardownBlock { @MainActor in player.stop() }
        player.toggle(url: "https://example.invalid/voice-\(UUID().uuidString).m4a")
        _ = await waitUntil { self.activations == 1 }
        player.isPlaying = true
        return player
    }

    private func waitUntil(_ condition: () -> Bool) async -> Bool {
        for _ in 0..<100 where !condition() { try? await Task.sleep(for: .milliseconds(20)) }
        return condition()
    }

    func test_theEndOfAnInterruption_resumesThePreview() async {
        let player = await makePlayingPlayer()
        events.send(.interruptionBegan)
        _ = await waitUntil { !player.isPlaying }

        events.send(.interruptionEndedShouldResume)
        let resumed = await waitUntil { player.isPlaying }

        XCTAssertTrue(resumed, "l'aperçu reprend là où il s'était arrêté")
        XCTAssertEqual(activations, 2, "la reprise reprend la session")
    }

    func test_anInterruptionEndingWithoutResume_leavesThePreviewPaused() async {
        let player = await makePlayingPlayer()
        events.send(.interruptionBegan)
        _ = await waitUntil { !player.isPlaying }

        events.send(.interruptionEndedShouldNotResume)
        try? await Task.sleep(for: .milliseconds(100))

        XCTAssertFalse(player.isPlaying)
    }

    func test_aUserPauseDuringTheInterruption_wins() async {
        let player = await makePlayingPlayer()
        events.send(.interruptionBegan)
        _ = await waitUntil { !player.isPlaying }
        player.isPlaying = true
        player.toggle(url: "ignored")

        events.send(.interruptionEndedShouldResume)
        try? await Task.sleep(for: .milliseconds(100))

        XCTAssertFalse(player.isPlaying, "la pause de l'utilisateur l'emporte sur la reprise")
    }

    func test_aUserPause_handsTheSessionBackAfterTheDelay() async {
        let player = await makePlayingPlayer()

        player.toggle(url: "ignored")

        XCTAssertEqual(pauseReleases, 1, "la libération différée (≈ 3 s) est demandée au coordinateur")
        XCTAssertFalse(player.isPlayingAudibly)
    }

    func test_theEndOfThePreview_releasesTheSession_once() async {
        let player = await makePlayingPlayer()

        player.handlePlaybackEnded()
        player.handlePlaybackEnded()

        XCTAssertEqual(releases, 1, "la musique coupée repart dès la fin de l'aperçu")
        XCTAssertFalse(player.isPlaying)
    }

    func test_aPlayingPreview_blocksAnyRelease() async {
        let player = await makePlayingPlayer()

        XCTAssertTrue(player.isPlayingAudibly)
    }
}
