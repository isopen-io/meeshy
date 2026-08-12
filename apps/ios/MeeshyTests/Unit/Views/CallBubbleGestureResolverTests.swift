import XCTest
import CoreGraphics
@testable import Meeshy

@MainActor
final class CallBubbleGestureResolverTests: XCTestCase {

    // MARK: - shouldCollapse

    func test_shouldCollapse_belowBothThresholds_false() {
        XCTAssertFalse(CallBubbleGestureResolver.shouldCollapse(translationWidth: 40, velocityWidth: 100))
    }

    func test_shouldCollapse_aboveDistanceThreshold_rightward_true() {
        XCTAssertTrue(CallBubbleGestureResolver.shouldCollapse(translationWidth: 90, velocityWidth: 0))
    }

    func test_shouldCollapse_aboveDistanceThreshold_leftward_true() {
        XCTAssertTrue(CallBubbleGestureResolver.shouldCollapse(translationWidth: -90, velocityWidth: 0))
    }

    func test_shouldCollapse_aboveVelocityThreshold_rightward_true() {
        XCTAssertTrue(CallBubbleGestureResolver.shouldCollapse(translationWidth: 10, velocityWidth: 600))
    }

    func test_shouldCollapse_aboveVelocityThreshold_leftward_true() {
        XCTAssertTrue(CallBubbleGestureResolver.shouldCollapse(translationWidth: -10, velocityWidth: -600))
    }

    func test_shouldCollapse_exactlyAtThresholds_false() {
        // `>` not `>=` at the threshold itself — a small safety margin before commit.
        XCTAssertFalse(CallBubbleGestureResolver.shouldCollapse(translationWidth: 80, velocityWidth: 500))
    }

    // MARK: - snappedEdge

    func test_snappedEdge_centerLeftOfMiddle_isLeading() {
        XCTAssertEqual(CallBubbleGestureResolver.snappedEdge(centerX: 100, screenWidth: 390), .leading)
    }

    func test_snappedEdge_centerRightOfMiddle_isTrailing() {
        XCTAssertEqual(CallBubbleGestureResolver.snappedEdge(centerX: 300, screenWidth: 390), .trailing)
    }

    func test_snappedEdge_exactlyAtMiddle_isTrailing() {
        // Deterministic tie-break: dead center resolves to .trailing.
        XCTAssertEqual(CallBubbleGestureResolver.snappedEdge(centerX: 195, screenWidth: 390), .trailing)
    }

    // MARK: - menuOffset

    func test_menuOffset_clusterAlreadyFits_returnsZero() {
        // Small button (12pt): overflow = 12 + 8 - 20 = 0 → already fits, both edges.
        XCTAssertEqual(CallBubbleGestureResolver.menuOffset(edge: .trailing, screenWidth: 390, buttonDiameter: 12), 0)
        XCTAssertEqual(CallBubbleGestureResolver.menuOffset(edge: .leading, screenWidth: 390, buttonDiameter: 12), 0)
    }

    func test_menuOffset_anchoredTrailing_shiftsClusterLeft() {
        // Real HIG button (44pt): overflow = 44 + 8 - 20 = 32 → shift left (negative).
        XCTAssertEqual(CallBubbleGestureResolver.menuOffset(edge: .trailing, screenWidth: 390, buttonDiameter: 44), -32)
    }

    func test_menuOffset_anchoredLeading_shiftsClusterRight() {
        XCTAssertEqual(CallBubbleGestureResolver.menuOffset(edge: .leading, screenWidth: 390, buttonDiameter: 44), 32)
    }

    // MARK: - clampedVerticalPosition

    func test_clampedVerticalPosition_withinBounds_unchanged() {
        XCTAssertEqual(CallBubbleGestureResolver.clampedVerticalPosition(200, availableHeight: 700, bubbleRadius: 28), 200)
    }

    func test_clampedVerticalPosition_aboveTop_clampsToRadius() {
        XCTAssertEqual(CallBubbleGestureResolver.clampedVerticalPosition(-10, availableHeight: 700, bubbleRadius: 28), 28)
    }

    func test_clampedVerticalPosition_intoFabZone_clampsAboveIt() {
        // availableHeight 700, fabExclusionZoneHeight 148, bubbleRadius 28 → max = 700-148-28 = 524
        XCTAssertEqual(CallBubbleGestureResolver.clampedVerticalPosition(680, availableHeight: 700, bubbleRadius: 28), 524)
    }

    func test_clampedVerticalPosition_tinyAvailableHeight_neverInverted() {
        // maxY would compute negative here — must clamp to minY (28), never invert the range.
        XCTAssertEqual(CallBubbleGestureResolver.clampedVerticalPosition(1000, availableHeight: 100, bubbleRadius: 28), 28)
    }

    // MARK: - size(for:) / interpolatedSize(progress:)

    func test_size_forEachTier() {
        XCTAssertEqual(CallBubbleGestureResolver.size(for: .circle), CGSize(width: 56, height: 56))
        XCTAssertEqual(CallBubbleGestureResolver.size(for: .small), CGSize(width: 90, height: 160))
        XCTAssertEqual(CallBubbleGestureResolver.size(for: .medium), CGSize(width: 120, height: 213))
        XCTAssertEqual(CallBubbleGestureResolver.size(for: .large), CGSize(width: 160, height: 284))
    }

    func test_interpolatedSize_atExactTierBoundaries_matchesSize() {
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 0), CGSize(width: 56, height: 56))
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 1), CGSize(width: 90, height: 160))
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 3), CGSize(width: 160, height: 284))
    }

    func test_interpolatedSize_midway_isLinearMidpoint() {
        // Between .circle (56,56) and .small (90,160): midpoint (73,108).
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 0.5), CGSize(width: 73, height: 108))
    }

    func test_interpolatedSize_clampsBelowZeroAndAboveMax() {
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: -5), CGSize(width: 56, height: 56))
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 99), CGSize(width: 160, height: 284))
    }

    // MARK: - interpolatedCornerRadius(progress:)

    func test_interpolatedCornerRadius_atCircle_isHalfDiameter() {
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedCornerRadius(progress: 0), 28)
    }

    func test_interpolatedCornerRadius_atOrPastFirstRectangleTier_isFixedTwenty() {
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedCornerRadius(progress: 1), 20)
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedCornerRadius(progress: 2.5), 20)
    }

    func test_interpolatedCornerRadius_midwayToFirstRectangleTier_isLinearMidpoint() {
        // 28 + (20 - 28) * 0.5 = 24
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedCornerRadius(progress: 0.5), 24)
    }

    // MARK: - controlBarOpacity(progress:)

    func test_controlBarOpacity_belowHalf_isZero() {
        XCTAssertEqual(CallBubbleGestureResolver.controlBarOpacity(progress: 0), 0)
        XCTAssertEqual(CallBubbleGestureResolver.controlBarOpacity(progress: 0.5), 0)
    }

    func test_controlBarOpacity_fadesInBetweenHalfAndOne() {
        XCTAssertEqual(CallBubbleGestureResolver.controlBarOpacity(progress: 0.75), 0.5, accuracy: 0.0001)
    }

    func test_controlBarOpacity_atOrPastFirstRectangleTier_isFullyOpaque() {
        XCTAssertEqual(CallBubbleGestureResolver.controlBarOpacity(progress: 1), 1)
        XCTAssertEqual(CallBubbleGestureResolver.controlBarOpacity(progress: 2.5), 1)
    }

    // MARK: - progress(startingTier:scale:)

    func test_progress_noScaleChange_returnsStartingTierRawValue() {
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .medium, scale: 1.0), 2)
    }

    func test_progress_pinchOutFromCircle_reachesSmallAtQuarterZoom() {
        // sensitivity 4: (1.25 - 1) * 4 = 1.0
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .circle, scale: 1.25), 1.0, accuracy: 0.0001)
    }

    func test_progress_pinchInFromSmall_returnsToCircleAtQuarterPinchIn() {
        // (0.75 - 1) * 4 = -1.0, starting tier .small (1) → 0
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .small, scale: 0.75), 0, accuracy: 0.0001)
    }

    func test_progress_clampsToValidRange() {
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .circle, scale: 0.2), 0)
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .large, scale: 3.0), 3)
    }

    // MARK: - nextTier(progress:velocity:)

    func test_nextTier_belowMidpoint_snapsDown() {
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 0.4, velocity: 0), .circle)
    }

    func test_nextTier_aboveMidpoint_snapsUp() {
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 0.6, velocity: 0), .small)
    }

    func test_nextTier_fastOutwardFlick_skipsATierAhead() {
        // biased = 1.0 + 0.5 = 1.5 → rounds to 2 (.medium), one tier past a plain snap of .small.
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 1.0, velocity: 2.0), .medium)
    }

    func test_nextTier_fastInwardFlick_snapsATierEarlyOnTheWayDown() {
        // biased = 0.9 - 0.5 = 0.4 → rounds to 0 (.circle) even though plain progress alone (0.9) would round to 1.
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 0.9, velocity: -2.0), .circle)
    }

    func test_nextTier_clampsToValidTierRange() {
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: -1, velocity: 0), .circle)
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 5, velocity: 0), .large)
    }
}
