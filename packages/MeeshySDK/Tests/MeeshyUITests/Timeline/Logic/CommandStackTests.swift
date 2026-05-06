import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CommandStackTests: XCTestCase {

    // MARK: - Helpers

    /// Factory: produces a fresh AddClipCommand wrapped in AnyEditCommand.
    /// Each call creates a new UUID + timestamp.
    private func makeAddCmd(clipId: String = UUID().uuidString,
                            timestamp: Date = Date()) -> AnyEditCommand {
        return .addClip(AddClipCommand(
            id: UUID().uuidString,
            timestamp: timestamp,
            clipId: clipId,
            postMediaId: "pm-\(clipId)",
            kind: .video,
            startTime: 0,
            duration: 1.0,
            content: nil
        ))
    }

    private func makeMoveCmd(clipId: String = "c1",
                             oldStart: Float = 0,
                             newStart: Float = 1,
                             timestamp: Date = Date()) -> AnyEditCommand {
        return .moveClip(MoveClipCommand(
            id: UUID().uuidString,
            timestamp: timestamp,
            clipId: clipId,
            kind: .video,
            oldStartTime: oldStart,
            newStartTime: newStart
        ))
    }

    // MARK: - CommandStackSnapshot

    func test_snapshot_init_storesCommandsAndCursor() {
        let cmds = [makeAddCmd(), makeAddCmd()]
        let snap = CommandStackSnapshot(commands: cmds, cursor: 1)
        XCTAssertEqual(snap.commands.count, 2)
        XCTAssertEqual(snap.cursor, 1)
    }

    func test_snapshot_codableRoundTrip() throws {
        let cmds = [makeAddCmd(), makeMoveCmd()]
        let snap = CommandStackSnapshot(commands: cmds, cursor: 2)

        let data = try JSONEncoder().encode(snap)
        let decoded = try JSONDecoder().decode(CommandStackSnapshot.self, from: data)

        XCTAssertEqual(decoded.commands.count, 2)
        XCTAssertEqual(decoded.cursor, 2)
    }

    // MARK: - CommandStack init

    func test_init_default_emptyState() {
        let stack = CommandStack()
        XCTAssertFalse(stack.canUndo)
        XCTAssertFalse(stack.canRedo)
    }

    func test_init_customParameters_storedCorrectly() {
        let stack = CommandStack(maxSize: 10, coalesceWindow: 1.0)
        XCTAssertEqual(stack.maxSize, 10)
        XCTAssertEqual(stack.coalesceWindow, 1.0, accuracy: 0.0001)
        XCTAssertFalse(stack.canUndo)
        XCTAssertFalse(stack.canRedo)
    }

    func test_init_clampsMaxSize_atLeastOne() {
        // maxSize 0 or negative would make push() unable to retain the new command — clamp to 1.
        let stack = CommandStack(maxSize: 0)
        XCTAssertEqual(stack.maxSize, 1)
    }

    // MARK: - CommandStack.push

    func test_push_singleCommand_canUndoBecomesTrue() {
        let stack = CommandStack()
        stack.push(makeAddCmd())
        XCTAssertTrue(stack.canUndo)
        XCTAssertFalse(stack.canRedo)
    }

    func test_push_twoCommands_bothUndoable() {
        let stack = CommandStack(coalesceWindow: 0) // disable coalescing for this test
        stack.push(makeAddCmd(clipId: "a"))
        stack.push(makeAddCmd(clipId: "b"))
        XCTAssertTrue(stack.canUndo)
        XCTAssertEqual(stack.count, 2)
    }

    // MARK: - CommandStack.undo

    func test_undo_emptyStack_returnsNil() {
        let stack = CommandStack()
        XCTAssertNil(stack.undo())
    }

    func test_undo_oneCommand_returnsItAndCanRedo() {
        let stack = CommandStack(coalesceWindow: 0)
        let cmd = makeAddCmd(clipId: "x")
        stack.push(cmd)
        let undone = stack.undo()
        XCTAssertNotNil(undone)
        XCTAssertFalse(stack.canUndo)
        XCTAssertTrue(stack.canRedo)
    }

    func test_undo_returnsCommandsInLIFOOrder() {
        let stack = CommandStack(coalesceWindow: 0)
        let a = makeAddCmd(clipId: "a")
        let b = makeAddCmd(clipId: "b")
        stack.push(a)
        stack.push(b)
        let firstUndone = stack.undo()
        let secondUndone = stack.undo()
        // We compare clipId via the underlying command (b first because LIFO)
        if case let .addClip(cmd) = firstUndone {
            XCTAssertEqual(cmd.clipId, "b")
        } else {
            XCTFail("Expected first undo to return last pushed (b)")
        }
        if case let .addClip(cmd) = secondUndone {
            XCTAssertEqual(cmd.clipId, "a")
        } else {
            XCTFail("Expected second undo to return first pushed (a)")
        }
    }

    // MARK: - CommandStack.redo

    func test_redo_withoutPriorUndo_returnsNil() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd())
        XCTAssertNil(stack.redo())
    }

    func test_redo_afterUndo_restoresAndReturnsCommand() {
        let stack = CommandStack(coalesceWindow: 0)
        let cmd = makeAddCmd(clipId: "z")
        stack.push(cmd)
        _ = stack.undo()
        let redone = stack.redo()
        XCTAssertNotNil(redone)
        XCTAssertTrue(stack.canUndo)
        XCTAssertFalse(stack.canRedo)
    }

    // MARK: - CommandStack — branch truncation

    func test_push_afterUndo_truncatesRedoBranch() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd(clipId: "a"))
        stack.push(makeAddCmd(clipId: "b"))
        stack.push(makeAddCmd(clipId: "c"))
        XCTAssertEqual(stack.count, 3)

        _ = stack.undo() // undo c
        _ = stack.undo() // undo b
        XCTAssertTrue(stack.canRedo)
        XCTAssertEqual(stack.count, 3) // still 3 retained, just cursor is at 1

        stack.push(makeAddCmd(clipId: "d")) // new branch — should drop b and c
        XCTAssertEqual(stack.count, 2) // a + d
        XCTAssertFalse(stack.canRedo)
    }

    func test_push_afterUndo_undoReturnsTheNewCommandFirst() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd(clipId: "a"))
        stack.push(makeAddCmd(clipId: "b"))
        _ = stack.undo() // undo b
        stack.push(makeAddCmd(clipId: "c"))
        let firstUndo = stack.undo()
        if case let .addClip(cmd) = firstUndo {
            XCTAssertEqual(cmd.clipId, "c")
        } else {
            XCTFail("Expected first undo after branch to return c")
        }
    }

    // MARK: - CommandStack — coalescing

    func test_push_coalesce_twoMovesOnSameClipWithinWindow_collapsedToOne() {
        let stack = CommandStack(coalesceWindow: 0.5)
        let now = Date()
        let m1 = makeMoveCmd(clipId: "c1", oldStart: 0, newStart: 1.0, timestamp: now)
        let m2 = makeMoveCmd(clipId: "c1", oldStart: 1.0, newStart: 2.0,
                             timestamp: now.addingTimeInterval(0.1))
        stack.push(m1)
        stack.push(m2)
        XCTAssertEqual(stack.count, 1)
    }

    func test_push_coalesce_preservesOriginalOldStartTime() {
        let stack = CommandStack(coalesceWindow: 0.5)
        let now = Date()
        let m1 = makeMoveCmd(clipId: "c1", oldStart: 0, newStart: 1.0, timestamp: now)
        let m2 = makeMoveCmd(clipId: "c1", oldStart: 1.0, newStart: 5.0,
                             timestamp: now.addingTimeInterval(0.2))
        stack.push(m1)
        stack.push(m2)
        let undone = stack.undo()
        if case let .moveClip(cmd) = undone {
            XCTAssertEqual(cmd.oldStartTime, 0, accuracy: 0.0001)
            XCTAssertEqual(cmd.newStartTime, 5.0, accuracy: 0.0001)
        } else {
            XCTFail("Expected coalesced moveClip command")
        }
    }

    func test_push_coalesce_didChangeFiresOncePerPush() {
        let stack = CommandStack(coalesceWindow: 0.5)
        var changeCount = 0
        stack.didChange = { _ in changeCount += 1 }
        let now = Date()
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 0, newStart: 1, timestamp: now))
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 1, newStart: 2,
                               timestamp: now.addingTimeInterval(0.1)))
        XCTAssertEqual(changeCount, 2) // didChange always fires, even when coalesced
    }

    func test_push_coalesce_repeatedDragFrames_singleCommandRetained() {
        let stack = CommandStack(coalesceWindow: 0.5)
        let now = Date()
        for i in 0..<100 {
            stack.push(makeMoveCmd(clipId: "c1",
                                   oldStart: Float(i),
                                   newStart: Float(i + 1),
                                   timestamp: now.addingTimeInterval(Double(i) * 0.001)))
        }
        XCTAssertEqual(stack.count, 1)
    }

    // MARK: - CommandStack — coalescing rejection rules

    func test_push_coalesce_rejectsDifferentClipId() {
        let stack = CommandStack(coalesceWindow: 0.5)
        let now = Date()
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 0, newStart: 1, timestamp: now))
        stack.push(makeMoveCmd(clipId: "c2", oldStart: 0, newStart: 1,
                               timestamp: now.addingTimeInterval(0.1)))
        XCTAssertEqual(stack.count, 2)
    }

    func test_push_coalesce_rejectsDifferentCommandType() {
        let stack = CommandStack(coalesceWindow: 0.5)
        let now = Date()
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 0, newStart: 1, timestamp: now))
        stack.push(makeAddCmd(clipId: "c1", timestamp: now.addingTimeInterval(0.1)))
        XCTAssertEqual(stack.count, 2)
    }

    func test_push_coalesce_rejectsOutsideTimeWindow() {
        let stack = CommandStack(coalesceWindow: 0.1)
        let now = Date()
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 0, newStart: 1, timestamp: now))
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 1, newStart: 2,
                               timestamp: now.addingTimeInterval(0.5))) // beyond window
        XCTAssertEqual(stack.count, 2)
    }

    // MARK: - CommandStack — FIFO cap

    func test_push_overMaxSize_dropsOldestFIFO() {
        let stack = CommandStack(maxSize: 3, coalesceWindow: 0)
        stack.push(makeAddCmd(clipId: "a"))
        stack.push(makeAddCmd(clipId: "b"))
        stack.push(makeAddCmd(clipId: "c"))
        stack.push(makeAddCmd(clipId: "d")) // should evict 'a'
        XCTAssertEqual(stack.count, 3)
        // Undo three times, expect d, c, b in order
        var ids: [String] = []
        for _ in 0..<3 {
            if case let .addClip(cmd) = stack.undo() {
                ids.append(cmd.clipId)
            }
        }
        XCTAssertEqual(ids, ["d", "c", "b"])
    }

    func test_push_overMaxSize_cursorStaysAtTop() {
        let stack = CommandStack(maxSize: 2, coalesceWindow: 0)
        stack.push(makeAddCmd(clipId: "a"))
        stack.push(makeAddCmd(clipId: "b"))
        stack.push(makeAddCmd(clipId: "c"))
        XCTAssertEqual(stack.count, 2)
        XCTAssertTrue(stack.canUndo)
        XCTAssertFalse(stack.canRedo)
    }

    // MARK: - CommandStack — snapshot / restore

    func test_snapshot_capturesCommandsAndCursor() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd(clipId: "a"))
        stack.push(makeAddCmd(clipId: "b"))
        _ = stack.undo()
        let snap = stack.snapshot()
        XCTAssertEqual(snap.commands.count, 2)
        XCTAssertEqual(snap.cursor, 1)
    }

    func test_restore_rebuildsStackState() {
        let original = CommandStack(coalesceWindow: 0)
        original.push(makeAddCmd(clipId: "a"))
        original.push(makeAddCmd(clipId: "b"))
        original.push(makeAddCmd(clipId: "c"))
        _ = original.undo()
        let snap = original.snapshot()

        let restored = CommandStack(coalesceWindow: 0)
        restored.restore(snap)
        XCTAssertEqual(restored.count, 3)
        XCTAssertTrue(restored.canUndo)
        XCTAssertTrue(restored.canRedo)
        // Calling redo on restored should give us back command 'c'
        if case let .addClip(cmd) = restored.redo() {
            XCTAssertEqual(cmd.clipId, "c")
        } else {
            XCTFail("Expected restored stack to expose c on redo")
        }
    }

    func test_restore_clampsCursorToCommandCount() {
        let stack = CommandStack()
        let bogus = CommandStackSnapshot(commands: [], cursor: 99)
        stack.restore(bogus)
        XCTAssertEqual(stack.count, 0)
        XCTAssertFalse(stack.canUndo)
        XCTAssertFalse(stack.canRedo)
    }

    // MARK: - CommandStack — didChange callback

    func test_didChange_firesOnPush() {
        let stack = CommandStack(coalesceWindow: 0)
        var count = 0
        stack.didChange = { _ in count += 1 }
        stack.push(makeAddCmd())
        XCTAssertEqual(count, 1)
    }

    func test_didChange_firesOnUndo() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd())
        var count = 0
        stack.didChange = { _ in count += 1 }
        _ = stack.undo()
        XCTAssertEqual(count, 1)
    }

    func test_didChange_firesOnRedo() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd())
        _ = stack.undo()
        var count = 0
        stack.didChange = { _ in count += 1 }
        _ = stack.redo()
        XCTAssertEqual(count, 1)
    }

    func test_didChange_firesOnRestore() {
        let stack = CommandStack()
        var count = 0
        stack.didChange = { _ in count += 1 }
        stack.restore(CommandStackSnapshot(commands: [], cursor: 0))
        XCTAssertEqual(count, 1)
    }

    func test_didChange_doesNotFireWhenUndoIsNoop() {
        let stack = CommandStack()
        var count = 0
        stack.didChange = { _ in count += 1 }
        _ = stack.undo() // empty stack — no-op
        XCTAssertEqual(count, 0)
    }

    func test_didChange_doesNotFireWhenRedoIsNoop() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd())
        var count = 0
        stack.didChange = { _ in count += 1 }
        _ = stack.redo() // nothing to redo
        XCTAssertEqual(count, 0)
    }
}
