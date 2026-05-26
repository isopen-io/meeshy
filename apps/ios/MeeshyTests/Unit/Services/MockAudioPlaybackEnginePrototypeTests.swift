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
