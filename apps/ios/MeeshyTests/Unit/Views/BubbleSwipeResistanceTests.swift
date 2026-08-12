import XCTest
import CoreGraphics
@testable import Meeshy

@MainActor
final class BubbleSwipeResistanceTests: XCTestCase {
    func test_minimumDistance_normalIs22_resistantIs48() {
        XCTAssertEqual(BubbleSwipeResistance.minimumDistance(.normal), 22)
        XCTAssertEqual(BubbleSwipeResistance.minimumDistance(.resistant), 48)
    }

    func test_dominanceRatio_normalIs3_resistantIs4() {
        XCTAssertEqual(BubbleSwipeResistance.horizontalDominanceRatio(.normal), 3)
        XCTAssertEqual(BubbleSwipeResistance.horizontalDominanceRatio(.resistant), 4)
    }

    func test_shouldEngage_whileScrubbing_alwaysFalse() {
        XCTAssertFalse(BubbleSwipeResistance.shouldEngage(
            translationWidth: 200, translationHeight: 0, isScrubbing: true, resistance: .resistant))
    }

    func test_shouldEngage_normalSmallHorizontal_engagesPast22() {
        XCTAssertTrue(BubbleSwipeResistance.shouldEngage(
            translationWidth: 30, translationHeight: 5, isScrubbing: false, resistance: .normal))
    }

    func test_shouldEngage_resistantSmallHorizontal_belowThreshold_false() {
        XCTAssertFalse(BubbleSwipeResistance.shouldEngage(
            translationWidth: 30, translationHeight: 5, isScrubbing: false, resistance: .resistant))
    }

    func test_shouldEngage_resistantLongForcedHorizontal_true() {
        XCTAssertTrue(BubbleSwipeResistance.shouldEngage(
            translationWidth: 90, translationHeight: 10, isScrubbing: false, resistance: .resistant))
    }

    func test_shouldEngage_diagonalDrag_resistantRejectsMoreAggressively() {
        XCTAssertTrue(BubbleSwipeResistance.shouldEngage(
            translationWidth: 60, translationHeight: 18, isScrubbing: false, resistance: .normal))
        XCTAssertFalse(BubbleSwipeResistance.shouldEngage(
            translationWidth: 60, translationHeight: 18, isScrubbing: false, resistance: .resistant))
    }

    // MARK: - isGestureOwnershipClaimed
    //
    // `BubbleSwipeContainer` mirrors two independent PreferenceKeys (media
    // scrubbing, inline carousel paging) into this OR combination to decide
    // whether reply/forward swipe stays disengaged. Neither preference-key
    // propagation itself, nor the `@GestureState` reset-on-interruption fix
    // in `AudioPlayerView`/`MeeshyVideoPlayer+Controls` that feeds
    // `mediaScrubbing`, is unit-testable without a full SwiftUI/UIKit host —
    // this covers the composition contract those two signals are combined
    // through.

    func test_isGestureOwnershipClaimed_neitherActive_false() {
        XCTAssertFalse(BubbleSwipeResistance.isGestureOwnershipClaimed(
            mediaScrubbing: false, inlinePaging: false))
    }

    func test_isGestureOwnershipClaimed_onlyMediaScrubbing_true() {
        XCTAssertTrue(BubbleSwipeResistance.isGestureOwnershipClaimed(
            mediaScrubbing: true, inlinePaging: false))
    }

    func test_isGestureOwnershipClaimed_onlyInlinePaging_true() {
        XCTAssertTrue(BubbleSwipeResistance.isGestureOwnershipClaimed(
            mediaScrubbing: false, inlinePaging: true))
    }

    func test_isGestureOwnershipClaimed_bothActive_true() {
        XCTAssertTrue(BubbleSwipeResistance.isGestureOwnershipClaimed(
            mediaScrubbing: true, inlinePaging: true))
    }
}
