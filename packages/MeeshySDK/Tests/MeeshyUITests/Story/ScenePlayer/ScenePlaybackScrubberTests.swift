import XCTest
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// #7878 — une scène se parcourt au doigt : la barre pointe une fraction, le
/// canvas se redessine à l'instant correspondant, puis reprend de là.
@MainActor
final class ScenePlaybackScrubberTests: XCTestCase {

    func test_scrub_beforeAnyCanvas_isHarmless() {
        let scrubber = ScenePlaybackScrubber()

        scrubber.begin()
        scrubber.scrub(toFraction: 0.5)
        scrubber.end(atFraction: 0.5)

        XCTAssertFalse(scrubber.isScrubbing)
    }
}
