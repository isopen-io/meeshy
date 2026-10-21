import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// L'aperçu d'un vocal (appui long sur le message) jouait SANS session audio — catégorie par défaut
/// `.soloAmbient` : rien ne sortait avec le commutateur de sonnerie sur silencieux — et sans écouter les
/// interruptions : après un appel ou Siri, `isPlaying` restait vrai sur un lecteur en pause, et le premier appui ne
/// faisait rien.
@MainActor
final class OverlayAudioPlayerSessionTests: XCTestCase {

    private let events = PassthroughSubject<MediaSessionCoordinator.Event, Never>()
    private var activations = 0
    private var releases = 0

    private func makePlayer() -> OverlayAudioPlayer {
        OverlayAudioPlayer(
            sessionEvents: events.eraseToAnyPublisher(),
            activateSession: { [weak self] in self?.activations += 1 },
            releaseSession: { [weak self] in self?.releases += 1 }
        )
    }

    private func waitUntil(_ condition: () -> Bool) async -> Bool {
        for _ in 0..<100 where !condition() { try? await Task.sleep(for: .milliseconds(20)) }
        return condition()
    }

    func test_startingAPreview_takesThePlaybackSession_andStoppingReleasesIt() async {
        let player = makePlayer()
        player.toggle(url: "https://example.invalid/voice-\(UUID().uuidString).m4a")
        let activated = await waitUntil { activations == 1 }
        XCTAssertTrue(activated, "la lecture prend la session `.playback` (le silencieux ne la coupe plus)")

        player.stop()
        XCTAssertEqual(releases, 1, "la session est rendue : la musique d'une autre app reprend")
        player.stop()
        XCTAssertEqual(releases, 1, "rendue une seule fois")
    }

    func test_anInterruption_pausesThePreview_soTheNextTapResumes() async {
        let player = makePlayer()
        player.isPlaying = true

        events.send(.interruptionBegan)
        let paused = await waitUntil { !player.isPlaying }

        XCTAssertTrue(paused, "après un appel ou Siri, l'aperçu se dit en pause — le premier appui le relance")
    }

    func test_theHeadphonesUnplugged_pausesThePreview() async {
        let player = makePlayer()
        player.isPlaying = true

        events.send(.routeChangedOldDeviceUnavailable)
        let paused = await waitUntil { !player.isPlaying }

        XCTAssertTrue(paused)
    }

    func test_stoppingWithoutPlaying_releasesNothing() {
        makePlayer().stop()
        XCTAssertEqual(releases, 0)
    }
}
