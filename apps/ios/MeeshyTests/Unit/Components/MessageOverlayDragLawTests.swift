import XCTest
@testable import Meeshy

@MainActor
final class MessageOverlayDragLawTests: XCTestCase {

    // MARK: - outcome — swipe up

    func test_outcome_strongSwipeUp_opensMore() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -80, predicted: -80), .openMore)
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -140, predicted: -140), .openMore)
    }

    func test_outcome_weakSwipeUp_snapsBack() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -40, predicted: -60), .snapBack)
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -79.9, predicted: -79.9), .snapBack)
    }

    func test_outcome_upVelocityInDragDirection_opensMore() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -30, predicted: -200), .openMore)
    }

    func test_outcome_upVelocityAgainstDragDirection_ignored() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: 10, predicted: -200), .snapBack)
    }

    func test_outcome_dragUpBeyondThresholdThenFlingDown_opensMore() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -100, predicted: 200), .openMore)
    }

    // MARK: - outcome — swipe down

    func test_outcome_strongSwipeDown_dismisses() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: 80, predicted: 80), .dismiss)
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: 140, predicted: 140), .dismiss)
    }

    func test_outcome_weakSwipeDown_snapsBack() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: 40, predicted: 50), .snapBack)
    }

    func test_outcome_downVelocityInDragDirection_dismisses() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: 30, predicted: 200), .dismiss)
    }

    func test_outcome_downVelocityAgainstDragDirection_ignored() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -10, predicted: 200), .snapBack)
    }

    func test_outcome_zeroDrag_snapsBack() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: 0, predicted: 0), .snapBack)
    }

    // MARK: - displayOffset

    func test_displayOffset_underThresholds_followsFingerOneToOne() {
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: 0), 0)
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: -50), -50)
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: 50), 50)
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: -80), -80)
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: 80), 80)
    }

    func test_displayOffset_beyondUpThreshold_isDamped() {
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: -120), -92, accuracy: 0.001)
    }

    func test_displayOffset_beyondDownThreshold_isDamped() {
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: 120), 92, accuracy: 0.001)
    }

    func test_displayOffset_staysMonotonic_beyondThreshold() {
        XCTAssertLessThan(
            MessageOverlayDragLaw.displayOffset(for: -200),
            MessageOverlayDragLaw.displayOffset(for: -120)
        )
        XCTAssertGreaterThan(
            MessageOverlayDragLaw.displayOffset(for: 200),
            MessageOverlayDragLaw.displayOffset(for: 120)
        )
    }

    // MARK: - isArmed

    func test_isArmed_exactlyAtUpThreshold() {
        XCTAssertTrue(MessageOverlayDragLaw.isArmed(translation: -80))
        XCTAssertTrue(MessageOverlayDragLaw.isArmed(translation: -120))
        XCTAssertFalse(MessageOverlayDragLaw.isArmed(translation: -79.9))
        XCTAssertFalse(MessageOverlayDragLaw.isArmed(translation: 0))
        XCTAssertFalse(MessageOverlayDragLaw.isArmed(translation: 80))
    }
}
