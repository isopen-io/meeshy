import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Smoke test: verifies that Plan 1 SDK types are reachable from MeeshyUI tests.
/// If this test fails to compile, Plan 1 is not merged correctly.
final class LogicModuleSmokeTests: XCTestCase {
    func test_plan1Types_areReachable() {
        let easing = StoryEasing.linear
        XCTAssertEqual(easing.apply(0.5), 0.5, accuracy: 0.0001)

        let kind = StoryTransitionKind.crossfade
        XCTAssertEqual(kind.rawValue, "crossfade")

        let kf = StoryKeyframe(time: 1.0, opacity: 0.5)
        XCTAssertEqual(kf.time, 1.0, accuracy: 0.0001)

        let clipKind = TimelineClipKind.video
        XCTAssertEqual(clipKind.rawValue, "video")
    }
}
