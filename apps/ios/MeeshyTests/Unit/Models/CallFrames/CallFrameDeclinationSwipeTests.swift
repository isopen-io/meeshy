import XCTest
@testable import Meeshy

/// LES DÉCLINAISONS BALAYABLES SOUS iOS 16 (#12685, C1.6) — la loi du glissement vertical dans la
/// vignette : l'axe se lit au premier geste (le carrousel garde l'horizontal), la page suit le doigt
/// avec une résistance aux bords, et elle ne change qu'au franchissement du seuil ou d'un élan.
final class CallFrameDeclinationSwipeTests: XCTestCase {
    private let height: CGFloat = 100

    func test_isVertical_whenHeightDominates_isTrue() {
        XCTAssertTrue(CallFrameDeclinationSwipe.isVertical(CGSize(width: 3, height: -12)))
    }

    func test_isVertical_whenWidthDominates_leavesTheGestureToTheCarousel() {
        XCTAssertFalse(CallFrameDeclinationSwipe.isVertical(CGSize(width: 14, height: 5)))
    }

    func test_target_swipeUpPastTheThreshold_goesToTheNextDeclination() {
        XCTAssertEqual(CallFrameDeclinationSwipe.target(index: 0, count: 3, translation: -40, predictedEnd: -40, height: height), 1)
    }

    func test_target_swipeDownPastTheThreshold_goesToThePreviousDeclination() {
        XCTAssertEqual(CallFrameDeclinationSwipe.target(index: 2, count: 3, translation: 40, predictedEnd: 40, height: height), 1)
    }

    func test_target_shortSlowDrag_staysOnThePage() {
        XCTAssertEqual(CallFrameDeclinationSwipe.target(index: 1, count: 3, translation: -10, predictedEnd: -20, height: height), 1)
    }

    func test_target_shortFlick_commitsOnItsMomentum() {
        XCTAssertEqual(CallFrameDeclinationSwipe.target(index: 1, count: 3, translation: -15, predictedEnd: -90, height: height), 2)
    }

    func test_target_atTheEdges_neverLoopsNorOverflows() {
        XCTAssertEqual(CallFrameDeclinationSwipe.target(index: 0, count: 3, translation: 80, predictedEnd: 150, height: height), 0)
        XCTAssertEqual(CallFrameDeclinationSwipe.target(index: 2, count: 3, translation: -80, predictedEnd: -150, height: height), 2)
    }

    func test_target_aLongDragNeverSkipsMoreThanOnePage() {
        XCTAssertEqual(CallFrameDeclinationSwipe.target(index: 0, count: 4, translation: -300, predictedEnd: -600, height: height), 1)
    }

    func test_followedOffset_inTheMiddle_followsTheFingerOnePageAtMost() {
        XCTAssertEqual(CallFrameDeclinationSwipe.followedOffset(index: 1, count: 3, translation: -30, height: height), -30)
        XCTAssertEqual(CallFrameDeclinationSwipe.followedOffset(index: 1, count: 3, translation: -250, height: height), -height)
    }

    func test_followedOffset_pastAnEdge_resistsInsteadOfFollowing() {
        let pulled = CallFrameDeclinationSwipe.followedOffset(index: 0, count: 3, translation: 60, height: height)
        XCTAssertGreaterThan(pulled, 0)
        XCTAssertLessThan(pulled, 30)
    }

    func test_latch_withinOneGesture_keepsTheAxisReadAtTheFirstMove() {
        let start = CGPoint(x: 20, y: 30)
        let first = CallFrameDeclinationSwipe.latch(nil, start: start, translation: CGSize(width: 2, height: -12))
        let later = CallFrameDeclinationSwipe.latch(first, start: start, translation: CGSize(width: 40, height: -14))
        XCTAssertTrue(later.isVertical)
    }

    func test_latch_aNewTouchRelatchesEvenWhenThePreviousGestureWasCancelled() {
        let cancelled = CallFrameDeclinationSwipe.latch(nil, start: CGPoint(x: 20, y: 30), translation: CGSize(width: 18, height: 3))
        XCTAssertFalse(cancelled.isVertical)
        let next = CallFrameDeclinationSwipe.latch(cancelled, start: CGPoint(x: 24, y: 52), translation: CGSize(width: 1, height: -15))
        XCTAssertTrue(next.isVertical)
    }
}
