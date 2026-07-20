import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

@MainActor
final class MediaLifecycleBridgeTests: XCTestCase {

    @discardableResult
    private func setupCoordinator(isPlaying: Bool) -> MockAudioPlaybackEngine {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        ConversationAudioCoordinator.testSetShared(coord)
        if isPlaying {
            engine.isPlaying = true
        }
        return engine
    }

    override func tearDown() async throws {
        ConversationAudioCoordinator.testResetShared()
        PlaybackCoordinator.shared.testStopAllProbe = nil
        MediaSessionCoordinator.shared.testProbe = nil
        try await super.tearDown()
    }

    func test_prepareForBackground_whileCoordinatorPlaying_doesNotCallStopAll() async {
        _ = setupCoordinator(isPlaying: true)
        // Wait for `assign(to: &$isPlaying)` Combine propagation from the engine
        // into the coordinator's `@Published var isPlaying`.
        try? await Task.sleep(nanoseconds: 50_000_000)
        let probe = PlaybackCoordinatorStopAllProbe()
        PlaybackCoordinator.shared.testStopAllProbe = probe

        await MediaLifecycleBridge.shared.prepareForBackground()
        XCTAssertEqual(probe.stopAllCount, 0)
    }

    func test_prepareForBackground_whileIdle_callsStopAll() async {
        _ = setupCoordinator(isPlaying: false)
        let probe = PlaybackCoordinatorStopAllProbe()
        PlaybackCoordinator.shared.testStopAllProbe = probe

        await MediaLifecycleBridge.shared.prepareForBackground()
        XCTAssertEqual(probe.stopAllCount, 1)
    }

    func test_prepareForBackground_whileCoordinatorPlaying_doesNotDeactivateSession() async {
        _ = setupCoordinator(isPlaying: true)
        try? await Task.sleep(nanoseconds: 50_000_000)
        let probe = MediaSessionCoordinatorTestProbe()
        MediaSessionCoordinator.shared.testProbe = probe

        await MediaLifecycleBridge.shared.prepareForBackground()
        XCTAssertEqual(probe.deactivateCount, 0)
    }

    func test_prepareForBackground_whileIdle_deactivatesSessionExactlyOnce() async {
        _ = setupCoordinator(isPlaying: false)
        let probe = MediaSessionCoordinatorTestProbe()
        MediaSessionCoordinator.shared.testProbe = probe

        await MediaLifecycleBridge.shared.prepareForBackground()
        // Exactly one deactivation: the bridge must NOT pre-count — only
        // `deactivateForBackground()`'s internal (post-guard) increment counts.
        XCTAssertEqual(probe.deactivateCount, 1)
    }
}
