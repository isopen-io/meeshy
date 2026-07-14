import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

@MainActor
final class MeeshyAppScenePhaseTests: XCTestCase {

    override func tearDown() async throws {
        ConversationAudioCoordinator.testResetShared()
        MediaSessionCoordinator.shared.testProbe = nil
        try await super.tearDown()
    }

    func test_background_whileCoordinatorPlaying_doesNotDeactivateSession() async {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        ConversationAudioCoordinator.testSetShared(coord)
        engine.isPlaying = true
        // Allow the engine's Combine pipeline to propagate isPlaying upstream
        // into the coordinator's @Published var so the guard can read `true`.
        try? await Task.sleep(nanoseconds: 50_000_000)
        let probe = MediaSessionCoordinatorTestProbe()
        MediaSessionCoordinator.shared.testProbe = probe

        await MeeshyApp.handleScenePhaseForTesting(.background)
        XCTAssertEqual(probe.deactivateCount, 0)
    }

    func test_background_whileIdle_deactivatesSession() async {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        ConversationAudioCoordinator.testSetShared(coord)
        // isPlaying defaults to false on the mock.
        let probe = MediaSessionCoordinatorTestProbe()
        MediaSessionCoordinator.shared.testProbe = probe

        await MeeshyApp.handleScenePhaseForTesting(.background)
        XCTAssertEqual(probe.deactivateCount, 1)
    }
}
