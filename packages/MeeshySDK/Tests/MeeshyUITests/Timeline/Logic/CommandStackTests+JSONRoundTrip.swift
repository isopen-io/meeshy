import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

extension CommandStackTests {

    // MARK: - JSON round-trip with redo branch

    func test_snapshot_jsonRoundTrip_preservesUndoneRedoBranch() throws {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd(clipId: "r1"))
        stack.push(makeAddCmd(clipId: "r2"))
        stack.push(makeAddCmd(clipId: "r3"))
        _ = stack.undo() // cursor now at 2, redo branch has r3

        let snap = stack.snapshot()
        let data = try JSONEncoder().encode(snap)
        let decoded = try JSONDecoder().decode(CommandStackSnapshot.self, from: data)

        let fresh = CommandStack(coalesceWindow: 0)
        fresh.restore(decoded)

        XCTAssertTrue(fresh.canUndo)
        XCTAssertTrue(fresh.canRedo)
        XCTAssertEqual(fresh.count, 3)

        let redone = fresh.redo()
        if case let .addClip(cmd) = redone {
            XCTAssertEqual(cmd.clipId, "r3")
        } else {
            XCTFail("Expected redo after JSON round-trip to return r3")
        }
    }
}
