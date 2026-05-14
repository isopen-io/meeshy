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

    // MARK: - Trim coalescing helper

    /// Factory: produces a TrimClipCommand wrapped in AnyEditCommand.
    /// Mirrors `makeMoveCmd` to keep trim-coalesce tests symmetrical with
    /// the existing move-coalesce coverage.
    fileprivate func makeTrimCmd(clipId: String = "c1",
                                 oldStart: Float = 0,
                                 oldDuration: Float = 5,
                                 newStart: Float = 0,
                                 newDuration: Float = 5,
                                 timestamp: Date = Date()) -> AnyEditCommand {
        return .trimClip(TrimClipCommand(
            id: UUID().uuidString,
            timestamp: timestamp,
            clipId: clipId,
            kind: .video,
            oldStartTime: oldStart,
            oldDuration: oldDuration,
            newStartTime: newStart,
            newDuration: newDuration
        ))
    }

    // MARK: - Trim coalescing — happy path

    func test_trim_consecutiveCommands_coalesceIntoSingle() {
        // Simulates a 60fps trim drag pushing 10 commands in <200ms.
        // Without coalescing, the FIFO cap (default 50) would be saturated
        // in <1s of drag and the user's undo history would be destroyed.
        let stack = CommandStack(coalesceWindow: 0.5)
        let t0 = Date(timeIntervalSinceReferenceDate: 3_000_000)
        for i in 0..<10 {
            stack.push(makeTrimCmd(clipId: "c1",
                                   oldStart: Float(i) * 0.1,
                                   oldDuration: 5.0 - Float(i) * 0.1,
                                   newStart: Float(i + 1) * 0.1,
                                   newDuration: 5.0 - Float(i + 1) * 0.1,
                                   timestamp: t0.addingTimeInterval(Double(i) * 0.016)))
        }
        XCTAssertEqual(stack.count, 1)
    }

    func test_trim_preservesOldStartTime() {
        // The merged command must roll all the way back to the
        // pre-drag start (from the first push), not the second-to-last.
        let stack = CommandStack(coalesceWindow: 0.5)
        let t0 = Date(timeIntervalSinceReferenceDate: 3_100_000)
        stack.push(makeTrimCmd(clipId: "c1",
                               oldStart: 0.0, oldDuration: 5.0,
                               newStart: 0.5, newDuration: 4.5,
                               timestamp: t0))
        stack.push(makeTrimCmd(clipId: "c1",
                               oldStart: 0.5, oldDuration: 4.5,
                               newStart: 1.2, newDuration: 3.8,
                               timestamp: t0.addingTimeInterval(0.1)))
        let undone = stack.undo()
        guard case let .trimClip(cmd) = undone else {
            XCTFail("Expected coalesced trimClip command")
            return
        }
        XCTAssertEqual(cmd.oldStartTime, 0.0, accuracy: 0.0001)
    }

    func test_trim_preservesNewStartTime() {
        // The merged command must apply forward to the most recent
        // drag position (from the last push), not the first.
        let stack = CommandStack(coalesceWindow: 0.5)
        let t0 = Date(timeIntervalSinceReferenceDate: 3_200_000)
        stack.push(makeTrimCmd(clipId: "c1",
                               oldStart: 0.0, oldDuration: 5.0,
                               newStart: 0.5, newDuration: 4.5,
                               timestamp: t0))
        stack.push(makeTrimCmd(clipId: "c1",
                               oldStart: 0.5, oldDuration: 4.5,
                               newStart: 1.2, newDuration: 3.8,
                               timestamp: t0.addingTimeInterval(0.1)))
        let undone = stack.undo()
        guard case let .trimClip(cmd) = undone else {
            XCTFail("Expected coalesced trimClip command")
            return
        }
        XCTAssertEqual(cmd.newStartTime, 1.2, accuracy: 0.0001)
    }

    func test_trim_preservesOldDuration() {
        // Symmetric to oldStartTime: revert must restore the original duration.
        let stack = CommandStack(coalesceWindow: 0.5)
        let t0 = Date(timeIntervalSinceReferenceDate: 3_300_000)
        stack.push(makeTrimCmd(clipId: "c1",
                               oldStart: 0.0, oldDuration: 10.0,
                               newStart: 0.0, newDuration: 9.0,
                               timestamp: t0))
        stack.push(makeTrimCmd(clipId: "c1",
                               oldStart: 0.0, oldDuration: 9.0,
                               newStart: 0.0, newDuration: 7.5,
                               timestamp: t0.addingTimeInterval(0.1)))
        let undone = stack.undo()
        guard case let .trimClip(cmd) = undone else {
            XCTFail("Expected coalesced trimClip command")
            return
        }
        XCTAssertEqual(cmd.oldDuration, 10.0, accuracy: 0.0001)
    }

    func test_trim_preservesNewDuration() {
        // Symmetric to newStartTime: apply must reach the most recent duration.
        let stack = CommandStack(coalesceWindow: 0.5)
        let t0 = Date(timeIntervalSinceReferenceDate: 3_400_000)
        stack.push(makeTrimCmd(clipId: "c1",
                               oldStart: 0.0, oldDuration: 10.0,
                               newStart: 0.0, newDuration: 9.0,
                               timestamp: t0))
        stack.push(makeTrimCmd(clipId: "c1",
                               oldStart: 0.0, oldDuration: 9.0,
                               newStart: 0.0, newDuration: 7.5,
                               timestamp: t0.addingTimeInterval(0.1)))
        let undone = stack.undo()
        guard case let .trimClip(cmd) = undone else {
            XCTFail("Expected coalesced trimClip command")
            return
        }
        XCTAssertEqual(cmd.newDuration, 7.5, accuracy: 0.0001)
    }

    // MARK: - Trim coalescing — rejection rules

    func test_trim_differentClipId_doesNotCoalesce() {
        // Two simultaneous trims on different clips (e.g. multi-select)
        // must remain independent — coalescing them would merge unrelated
        // edits into a single undo step.
        let stack = CommandStack(coalesceWindow: 0.5)
        let t0 = Date(timeIntervalSinceReferenceDate: 3_500_000)
        stack.push(makeTrimCmd(clipId: "c1",
                               oldStart: 0.0, oldDuration: 5.0,
                               newStart: 0.1, newDuration: 4.9,
                               timestamp: t0))
        stack.push(makeTrimCmd(clipId: "c2",
                               oldStart: 0.0, oldDuration: 5.0,
                               newStart: 0.1, newDuration: 4.9,
                               timestamp: t0.addingTimeInterval(0.05)))
        stack.push(makeTrimCmd(clipId: "c1",
                               oldStart: 0.1, oldDuration: 4.9,
                               newStart: 0.2, newDuration: 4.8,
                               timestamp: t0.addingTimeInterval(0.1)))
        stack.push(makeTrimCmd(clipId: "c2",
                               oldStart: 0.1, oldDuration: 4.9,
                               newStart: 0.2, newDuration: 4.8,
                               timestamp: t0.addingTimeInterval(0.15)))
        // c1, c2, c1, c2 alternating → no two adjacent pushes share clipId,
        // so nothing coalesces.
        XCTAssertEqual(stack.count, 4)
    }

    func test_trim_outsideWindow_doesNotCoalesce() {
        // Two trims separated by more than coalesceWindow are distinct
        // edits (e.g. the user paused, then trimmed again) — each must
        // produce its own undo step.
        let stack = CommandStack(coalesceWindow: 0.1)
        let t0 = Date(timeIntervalSinceReferenceDate: 3_600_000)
        stack.push(makeTrimCmd(clipId: "c1",
                               oldStart: 0.0, oldDuration: 5.0,
                               newStart: 0.5, newDuration: 4.5,
                               timestamp: t0))
        stack.push(makeTrimCmd(clipId: "c1",
                               oldStart: 0.5, oldDuration: 4.5,
                               newStart: 1.0, newDuration: 4.0,
                               timestamp: t0.addingTimeInterval(0.5))) // beyond window
        XCTAssertEqual(stack.count, 2)
    }

    func test_trim_repeatedDragFrames_singleCommandRetained() {
        // Worst-case scenario: a 1.6s trim drag at 60fps would push
        // ~100 commands. Without trim coalescing, the FIFO cap evicts
        // the user's prior history. With coalescing, all 100 collapse
        // to a single undo step that rolls back to the pre-drag state.
        let stack = CommandStack(coalesceWindow: 0.5)
        let t0 = Date(timeIntervalSinceReferenceDate: 3_700_000)
        for i in 0..<100 {
            stack.push(makeTrimCmd(clipId: "c1",
                                   oldStart: Float(i) * 0.01,
                                   oldDuration: 5.0 - Float(i) * 0.01,
                                   newStart: Float(i + 1) * 0.01,
                                   newDuration: 5.0 - Float(i + 1) * 0.01,
                                   timestamp: t0.addingTimeInterval(Double(i) * 0.001)))
        }
        XCTAssertEqual(stack.count, 1)
        // And the merged command's revert() rolls all the way back.
        let undone = stack.undo()
        guard case let .trimClip(cmd) = undone else {
            XCTFail("Expected coalesced trimClip command")
            return
        }
        XCTAssertEqual(cmd.oldStartTime, 0.0, accuracy: 0.0001)
        XCTAssertEqual(cmd.oldDuration, 5.0, accuracy: 0.0001)
    }
}
