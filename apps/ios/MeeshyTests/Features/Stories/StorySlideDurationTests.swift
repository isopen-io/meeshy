import XCTest
@testable import Meeshy
import MeeshySDK

/// The duration of a story slide (#13135): one value for the progress bar and
/// the canvas, six seconds when there is nothing to time.
@MainActor
final class StorySlideDurationTests: XCTestCase {

    func test_of_noStory_isTheSixSecondFallback() {
        XCTAssertEqual(StorySlideDuration.of(nil), 6.0)
        XCTAssertEqual(StorySlideDuration.fallback, 6.0)
    }

    func test_of_aStory_isTheDurationTheCanvasDrives() {
        let story = StoryItem(id: "s1", content: "a", media: [], storyEffects: nil,
                              createdAt: Date(), expiresAt: nil, isViewed: false)
        XCTAssertEqual(StorySlideDuration.of(story),
                       story.toRenderableSlide(preferredLanguages: []).computedTotalDuration())
    }
}
