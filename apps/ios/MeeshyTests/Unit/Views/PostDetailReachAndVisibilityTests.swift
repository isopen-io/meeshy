import XCTest
import CoreGraphics
@testable import Meeshy

@MainActor
final class PostDetailReachAndVisibilityTests: XCTestCase {

    // MARK: PostReachFormatter.compact
    func test_compact_formatsThousandsAndMillions() {
        XCTAssertEqual(PostReachFormatter.compact(0), "0")
        XCTAssertEqual(PostReachFormatter.compact(999), "999")
        XCTAssertEqual(PostReachFormatter.compact(1_200), "1.2k")
        XCTAssertEqual(PostReachFormatter.compact(3_400_000), "3.4M")
    }

    // MARK: PostReachFormatter.components
    func test_components_author_hasPseudoAndStats() {
        let c = PostReachFormatter.components(username: "marie", isAuthor: true, openCount: 1_200, impressionCount: 3_400)
        XCTAssertEqual(c.pseudo, "@marie")
        XCTAssertEqual(c.views, "1.2k")
        XCTAssertEqual(c.impressions, "3.4k")
    }

    func test_components_nonAuthor_hasPseudoNoStats() {
        let c = PostReachFormatter.components(username: "marie", isAuthor: false, openCount: 1_200, impressionCount: 3_400)
        XCTAssertEqual(c.pseudo, "@marie")
        XCTAssertNil(c.views)
        XCTAssertNil(c.impressions)
    }

    func test_components_noUsername_pseudoNil() {
        let empty = PostReachFormatter.components(username: "", isAuthor: false, openCount: 0, impressionCount: 0)
        XCTAssertNil(empty.pseudo)
        let nilName = PostReachFormatter.components(username: nil, isAuthor: false, openCount: 0, impressionCount: 0)
        XCTAssertNil(nilName.pseudo)
    }

    // MARK: StoryCanvasVisibility.isVisible — named-space frame, 0 = top of viewport
    func test_isVisible_fullyAbove_isFalse() {
        XCTAssertFalse(StoryCanvasVisibility.isVisible(canvasFrame: CGRect(x: 0, y: -300, width: 300, height: 200), viewportHeight: 800))
    }

    func test_isVisible_fullyBelow_isFalse() {
        XCTAssertFalse(StoryCanvasVisibility.isVisible(canvasFrame: CGRect(x: 0, y: 900, width: 300, height: 200), viewportHeight: 800))
    }

    func test_isVisible_partiallyOnScreen_isTrue() {
        XCTAssertTrue(StoryCanvasVisibility.isVisible(canvasFrame: CGRect(x: 0, y: -50, width: 300, height: 200), viewportHeight: 800))
        XCTAssertTrue(StoryCanvasVisibility.isVisible(canvasFrame: CGRect(x: 0, y: 400, width: 300, height: 200), viewportHeight: 800))
    }

    // MARK: StoryDetailPlaybackPolicy.isPaused — truth table (RF3)
    // Shared by the native story canvas AND the STORY-repost canvas so the off-screen
    // + call-aware pause policy can't drift between the two paths.
    func test_storyDetailPlaybackPolicy_playsWhenVisibleAndNoCall() {
        XCTAssertFalse(StoryDetailPlaybackPolicy.isPaused(visible: true, callActive: false))
    }

    func test_storyDetailPlaybackPolicy_pausesWhenOffScreen() {
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: false, callActive: false))
    }

    func test_storyDetailPlaybackPolicy_pausesDuringCall_evenWhenVisible() {
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: true, callActive: true))
    }

    func test_storyDetailPlaybackPolicy_pausesWhenOffScreenAndCall() {
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: false, callActive: true))
    }
}
