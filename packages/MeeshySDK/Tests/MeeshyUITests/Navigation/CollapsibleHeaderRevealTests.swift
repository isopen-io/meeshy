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
}
