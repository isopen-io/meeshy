import XCTest
import Combine
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// L'aperçu d'appui long contournait `PlaybackCoordinator` : un vocal A qui jouait dans la conversation
/// continuait sous l'aperçu de B (deux voix superposées, `isPlaying` de A resté vrai), et l'arrêt de l'aperçu
/// rendait la session `.playback` — non refcomptée, puisque le coordinateur est censé garantir l'exclusion —
/// sous A. Dans l'autre sens, un vocal lancé pendant l'aperçu ne l'arrêtait pas.
@MainActor
final class OverlayAudioPlayerCoordinationTests: XCTestCase {

    private final class SpyPlayer: StoppablePlayer {
        var stops = 0
        func stop() { stops += 1 }
    }

    private let other = SpyPlayer()

    override func setUp() {
        super.setUp()
        PlaybackCoordinator.shared.registerExternal(other)
    }

    override func tearDown() {
        PlaybackCoordinator.shared.unregisterExternal(other)
        super.tearDown()
    }

    private func makePlayer() -> OverlayAudioPlayer {
        OverlayAudioPlayer(
            sessionEvents: Empty().eraseToAnyPublisher(),
            activateSession: {},
            releaseSession: {}
        )
    }

    func test_startingAPreview_stopsTheOtherPlayers() {
        let player = makePlayer()
        player.toggle(url: "https://example.invalid/voice-\(UUID().uuidString).m4a")
        XCTAssertEqual(other.stops, 1, "l'aperçu doit arrêter le vocal qui jouait déjà")
        player.stop()
    }

    func test_anotherPlayerStarting_stopsThePreview() {
        let player = makePlayer()
        player.toggle(url: "https://example.invalid/voice-\(UUID().uuidString).m4a")
        XCTAssertTrue(player.isLoading, "précondition : l'aperçu a démarré")

        PlaybackCoordinator.shared.willStartPlaying(external: other)

        XCTAssertFalse(player.isLoading, "un vocal lancé pendant l'aperçu doit l'arrêter")
        XCTAssertFalse(player.isPlaying)
    }
}
