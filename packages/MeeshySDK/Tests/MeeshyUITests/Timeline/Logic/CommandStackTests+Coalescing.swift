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

    // MARK: - FIFO cap untouched by coalesce

    func test_push_coalesce_doesNotInteractWithFIFOCap() {
        let stack = CommandStack(maxSize: 3, coalesceWindow: 0.5)
        let t0 = Date(timeIntervalSinceReferenceDate: 2_000_000)
        for i in 0..<100 {
            stack.push(makeMoveCmd(clipId: "c1",
                                   oldStart: Float(i),
                                   newStart: Float(i + 1),
                                   timestamp: t0.addingTimeInterval(Double(i) * 0.001)))
        }
        XCTAssertEqual(stack.count, 1)
    }
}
