import XCTest
import CoreGraphics
@testable import MeeshyUI

final class ProfileHeaderMetricsTests: XCTestCase {

    func test_progress_atZeroOffset_isExpanded() {
        XCTAssertEqual(ProfileHeaderMetrics.progress(offset: 0), 0, accuracy: 0.0001)
    }

    func test_progress_atPositiveOffset_staysExpanded() {
        // Overscroll above the top (positive minY) must not collapse.
        XCTAssertEqual(ProfileHeaderMetrics.progress(offset: 200), 0, accuracy: 0.0001)
    }

    func test_progress_atLargeNegativeOffset_isFullyCollapsed() {
        XCTAssertEqual(ProfileHeaderMetrics.progress(offset: -1000), 1, accuracy: 0.0001)
    }

    func test_progress_atMidScroll_isBetweenZeroAndOne() {
        let p = ProfileHeaderMetrics.progress(offset: -50)
        XCTAssertGreaterThan(p, 0)
        XCTAssertLessThan(p, 1)
    }

    func test_progress_isMonotonicAsScrollIncreases() {
        let offsets: [CGFloat] = [0, -10, -30, -60, -90, -120, -200]
        let progresses = offsets.map { ProfileHeaderMetrics.progress(offset: $0) }
        for i in 1..<progresses.count {
            XCTAssertGreaterThanOrEqual(progresses[i], progresses[i - 1])
        }
    }

    func test_progress_reachesOneExactlyAtCollapseDistance() {
        let atDistance = ProfileHeaderMetrics.progress(offset: -ProfileHeaderMetrics.collapseDistance)
        XCTAssertEqual(atDistance, 1, accuracy: 0.0001)
    }
}
