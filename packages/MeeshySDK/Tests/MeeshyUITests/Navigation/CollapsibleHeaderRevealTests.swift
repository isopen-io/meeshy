import XCTest
import SwiftUI
@testable import MeeshyUI

// Pure-logic suite — NOT @MainActor (MeeshyUI defaultIsolation is MainActor;
// the function under test is `nonisolated`, so the test must stay off the actor).
final class CollapsibleHeaderRevealTests: XCTestCase {

    func test_revealOpacity_atRest_isZero() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 0), 0, accuracy: 0.0001)
    }

    func test_revealOpacity_belowStartThreshold_isZero() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 0.5), 0, accuracy: 0.0001)
    }

    func test_revealOpacity_atStartThreshold_isZero() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 0.6), 0, accuracy: 0.0001)
    }

    func test_revealOpacity_fullyCollapsed_isOne() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 1), 1, accuracy: 0.0001)
    }

    func test_revealOpacity_midReveal_isHalf() {
        // start=0.6 → midpoint of the reveal band [0.6, 1.0] is 0.8
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 0.8), 0.5, accuracy: 0.0001)
    }

    func test_revealOpacity_isClampedAboveOne() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 1.5), 1, accuracy: 0.0001)
    }

    // MARK: - pinnedAccessoryReveal

    private func reveal(_ offset: CGFloat, start: CGFloat = 70, end: CGFloat = 140) -> CGFloat {
        CollapsibleHeaderMetrics.pinnedAccessoryReveal(scrollOffset: offset, start: start, end: end)
    }

    func test_pinnedAccessoryReveal_atRest_isZero() {
        XCTAssertEqual(reveal(0), 0, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_beforeStart_isZero() {
        // scrolled 50pt (offset -50), start is 70 → still hidden
        XCTAssertEqual(reveal(-50), 0, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_atStart_isZero() {
        XCTAssertEqual(reveal(-70), 0, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_midBand_isHalf() {
        // midpoint of [70, 140] is 105
        XCTAssertEqual(reveal(-105), 0.5, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_atEnd_isOne() {
        XCTAssertEqual(reveal(-140), 1, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_pastEnd_isClampedToOne() {
        XCTAssertEqual(reveal(-300), 1, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_positiveOverscroll_isZero() {
        // pull-to-refresh overscroll (positive offset) must never reveal
        XCTAssertEqual(reveal(40), 0, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_degenerateBand_isStep() {
        // start == end → step function at the threshold
        XCTAssertEqual(reveal(-100, start: 120, end: 120), 0, accuracy: 0.0001)
        XCTAssertEqual(reveal(-120, start: 120, end: 120), 1, accuracy: 0.0001)
    }
}
