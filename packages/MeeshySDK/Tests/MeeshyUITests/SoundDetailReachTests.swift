import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// #10483 — une publication montrée sur la page d'un son est un affichage de
/// la surface « son » : elle se signale à son apparition, et la page vide sa
/// file en se fermant.
@MainActor
final class SoundDetailReachTests: XCTestCase {

    @MainActor
    final class RecordingImpressions: ReachImpressionRecording {
        nonisolated deinit {}
        private(set) var recorded: [String] = []
        private(set) var flushes = 0
        func record(_ postId: String) { recorded.append(postId) }
        func flushNow() async { flushes += 1 }
    }

    func test_postAppeared_signalsTheDisplayedPost() {
        let impressions = RecordingImpressions()
        let model = SoundDetailModel(soundId: "s1", service: SoundDetailModelTests.FakeService(), impressions: impressions)

        model.postAppeared("p1")
        model.postAppeared("p2")

        XCTAssertEqual(impressions.recorded, ["p1", "p2"])
    }

    func test_flushImpressions_emptiesTheQueue() async {
        let impressions = RecordingImpressions()
        let model = SoundDetailModel(soundId: "s1", service: SoundDetailModelTests.FakeService(), impressions: impressions)

        await model.flushImpressions()

        XCTAssertEqual(impressions.flushes, 1)
    }
}
