import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

extension CommandStackTests {

    // MARK: - Coalesce window exact boundary

    func test_push_coalesce_atExactWindowBoundary_stillMerges() {
        let stack = CommandStack(coalesceWindow: 0.1)
        let t0 = Date(timeIntervalSinceReferenceDate: 1_000_000)
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 0, newStart: 1, timestamp: t0))
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 1, newStart: 2,
                               timestamp: t0.addingTimeInterval(0.1)))
        XCTAssertEqual(stack.count, 1)
    }
}
