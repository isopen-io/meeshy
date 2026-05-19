import XCTest
@testable import MeeshyUI

/// Unit tests for `ImageEditHistory` — the snapshot-based undo/redo stack.
final class ImageEditHistoryTests: XCTestCase {

    private func state(filter: ImageFilter) -> ImageEditState {
        var state = ImageEditState.identity
        state.filter = filter
        return state
    }

    func test_initialHistory_hasSingleStep_andNoUndoRedo() {
        let history = ImageEditHistory(initial: .identity)
        XCTAssertEqual(history.count, 1)
        XCTAssertEqual(history.cursor, 0)
        XCTAssertFalse(history.canUndo)
        XCTAssertFalse(history.canRedo)
        XCTAssertEqual(history.current, .identity)
    }

    func test_record_addsStep_andEnablesUndo() {
        var history = ImageEditHistory(initial: .identity)
        history.record(state(filter: .vivid), label: "Vivid")
        XCTAssertEqual(history.count, 2)
        XCTAssertTrue(history.canUndo)
        XCTAssertFalse(history.canRedo)
        XCTAssertEqual(history.current.filter, .vivid)
    }

    func test_record_withStateEqualToCurrent_isNoOp() {
        var history = ImageEditHistory(initial: .identity)
        history.record(.identity, label: "Same")
        XCTAssertEqual(history.count, 1)
        XCTAssertFalse(history.canUndo)
    }

    func test_undo_restoresPreviousState_andEnablesRedo() {
        var history = ImageEditHistory(initial: .identity)
        history.record(state(filter: .noir), label: "Noir")
        let restored = history.undo()
        XCTAssertEqual(restored, .identity)
        XCTAssertEqual(history.current, .identity)
        XCTAssertFalse(history.canUndo)
        XCTAssertTrue(history.canRedo)
    }

    func test_redo_reappliesUndoneState() {
        var history = ImageEditHistory(initial: .identity)
        history.record(state(filter: .noir), label: "Noir")
        _ = history.undo()
        let redone = history.redo()
        XCTAssertEqual(redone?.filter, .noir)
        XCTAssertEqual(history.current.filter, .noir)
        XCTAssertFalse(history.canRedo)
    }

    func test_undo_atStart_returnsNil() {
        var history = ImageEditHistory(initial: .identity)
        XCTAssertNil(history.undo())
    }

    func test_recordAfterUndo_truncatesTheRedoBranch() {
        var history = ImageEditHistory(initial: .identity)
        history.record(state(filter: .vivid), label: "A")
        history.record(state(filter: .noir), label: "B")
        _ = history.undo() // back to A
        history.record(state(filter: .sepia), label: "C")
        XCTAssertEqual(history.count, 3) // identity, A, C — B discarded
        XCTAssertFalse(history.canRedo)
        XCTAssertEqual(history.current.filter, .sepia)
    }

    func test_jump_movesCursorToTargetStep() {
        var history = ImageEditHistory(initial: .identity)
        history.record(state(filter: .vivid), label: "A")
        history.record(state(filter: .noir), label: "B")
        let originalID = history.steps[0].id
        let restored = history.jump(to: originalID)
        XCTAssertEqual(restored, .identity)
        XCTAssertEqual(history.current, .identity)
        XCTAssertTrue(history.canRedo)
    }

    func test_jump_toUnknownID_returnsNil() {
        var history = ImageEditHistory(initial: .identity)
        XCTAssertNil(history.jump(to: UUID()))
    }
}
