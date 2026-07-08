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
}
