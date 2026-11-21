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

    // MARK: - size(for:) / interpolatedSize(progress:) — #19701 : trois tailles de la même vignette

    func test_size_forEachTier() {
        XCTAssertEqual(CallBubbleGestureResolver.size(for: .small), CGSize(width: 90, height: 160))
        XCTAssertEqual(CallBubbleGestureResolver.size(for: .medium), CGSize(width: 120, height: 213))
        XCTAssertEqual(CallBubbleGestureResolver.size(for: .large), CGSize(width: 160, height: 284))
    }

    func test_interpolatedSize_atExactTierBoundaries_matchesSize() {
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 0), CGSize(width: 90, height: 160))
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 1), CGSize(width: 120, height: 213))
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 2), CGSize(width: 160, height: 284))
    }

    func test_interpolatedSize_midway_isLinearMidpoint() {
        // Between .small (90,160) and .medium (120,213): midpoint (105,186.5).
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 0.5), CGSize(width: 105, height: 186.5))
    }

    func test_interpolatedSize_clampsBelowZeroAndAboveMax() {
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: -5), CGSize(width: 90, height: 160))
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 99), CGSize(width: 160, height: 284))
    }

    func test_everyTier_isAPortraitVignette_neverACircle() {
        for tier in CallBubbleSizeTier.allCases {
            let size = CallBubbleGestureResolver.size(for: tier)
            XCTAssertGreaterThan(size.height, size.width, "\(tier) est une vignette portrait")
        }
        XCTAssertEqual(CallBubbleGestureResolver.rectangleCornerRadius, 20)
    }

    // MARK: - progress(startingTier:scale:)

    func test_progress_noScaleChange_returnsStartingTierRawValue() {
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .medium, scale: 1.0), 1)
    }

    func test_progress_pinchOutFromSmall_reachesMediumAtQuarterZoom() {
        // sensitivity 4: (1.25 - 1) * 4 = 1.0
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .small, scale: 1.25), 1.0, accuracy: 0.0001)
    }

    func test_progress_pinchInFromMedium_returnsToSmallAtQuarterPinchIn() {
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .medium, scale: 0.75), 0, accuracy: 0.0001)
    }

    func test_progress_clampsToValidRange() {
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .small, scale: 0.2), 0)
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .large, scale: 3.0), 2)
    }

    // MARK: - nextTier(progress:velocity:)

    func test_nextTier_belowMidpoint_snapsDown() {
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 0.4, velocity: 0), .small)
    }

    func test_nextTier_aboveMidpoint_snapsUp() {
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 0.6, velocity: 0), .medium)
    }

    func test_nextTier_fastOutwardFlick_skipsATierAhead() {
        // biased = 1.0 + 0.5 = 1.5 → rounds to 2 (.large).
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 1.0, velocity: 2.0), .large)
    }

    func test_nextTier_fastInwardFlick_snapsATierEarlyOnTheWayDown() {
        // biased = 0.9 - 0.5 = 0.4 → rounds to 0 (.small) even though plain progress alone (0.9) would round to 1.
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 0.9, velocity: -2.0), .small)
    }

    func test_nextTier_clampsToValidTierRange() {
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: -1, velocity: 0), .small)
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 5, velocity: 0), .large)
    }

    // MARK: - #19701 — le glissé avec élan

    func test_glide_slowRelease_landsWhereTheFingerLeft() {
        let moved = CGSize(width: 40, height: -30)
        XCTAssertEqual(CallBubbleGestureResolver.glidedTranslation(translation: moved, predicted: moved), moved)
    }

    func test_glide_flick_carriesTheVignetteAlongItsMomentum() {
        let glided = CallBubbleGestureResolver.glidedTranslation(translation: CGSize(width: 30, height: 20), predicted: CGSize(width: 150, height: 220))
        XCTAssertEqual(glided, CGSize(width: 150, height: 220))
    }

    func test_glide_violentFlick_isBoundedOnEachAxis() {
        let glided = CallBubbleGestureResolver.glidedTranslation(translation: CGSize(width: 10, height: -10), predicted: CGSize(width: 2_000, height: -2_000))
        XCTAssertEqual(glided.width, 10 + CallBubbleGestureResolver.maxGlide)
        XCTAssertEqual(glided.height, -10 - CallBubbleGestureResolver.maxGlide)
    }

    func test_glide_flickTowardTheOtherEdge_switchesTheSnappedEdge() {
        // Posée à droite (centre x = 300 sur 390), un jet vers la gauche la fait changer de bord.
        let glided = CallBubbleGestureResolver.glidedTranslation(translation: CGSize(width: -60, height: 0), predicted: CGSize(width: -260, height: 0))
        XCTAssertEqual(CallBubbleGestureResolver.snappedEdge(centerX: 300 + glided.width, screenWidth: 390), .leading)
        XCTAssertEqual(CallBubbleGestureResolver.snappedEdge(centerX: 300 - 60, screenWidth: 390), .trailing, "sans l'élan, elle serait restée à droite")
    }

    func test_bubbleView_releasesWithTheGlide_andAGlideSpring() throws {
        let view = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallBubbleView.swift"))
        XCTAssertTrue(view.contains("translation: value.translation, predicted: value.predictedEndTranslation"))
        XCTAssertTrue(view.contains("response: CallBubbleGestureResolver.glideResponse"))
        XCTAssertTrue(view.contains("dragTranslation = value.translation"), "le doigt porte la vignette image par image")
        XCTAssertFalse(view.contains("CallEdgeDisk"), "plus de disque")
    }
}
