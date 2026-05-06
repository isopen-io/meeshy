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
}
