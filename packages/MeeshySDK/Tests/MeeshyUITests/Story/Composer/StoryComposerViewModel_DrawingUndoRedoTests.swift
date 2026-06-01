import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Undo / redo (retour arrière / avant) des traits de dessin du composer.
@MainActor
final class StoryComposerViewModel_DrawingUndoRedoTests: XCTestCase {

    private func makeSubject() -> StoryComposerViewModel { StoryComposerViewModel() }

    private func stroke(id: String) -> StoryDrawingStroke {
        StoryDrawingStroke(
            id: id,
            points: [StoryDrawingStrokePoint(x: 0, y: 0), StoryDrawingStrokePoint(x: 10, y: 10)],
            colorHex: "FF0000", width: 5, tool: .pen, smoothing: .raw)
    }

    func test_commitStroke_appendsAndClearsRedo() {
        let vm = makeSubject()
        vm.drawingRedoStack = [stroke(id: "old")]
        vm.commitStroke(stroke(id: "s1"))
        XCTAssertEqual(vm.drawingStrokes.map(\.id), ["s1"])
        XCTAssertTrue(vm.drawingRedoStack.isEmpty, "a new stroke invalidates redo")
    }

    func test_undo_movesLastStrokeToRedo() {
        let vm = makeSubject()
        vm.commitStroke(stroke(id: "s1"))
        vm.commitStroke(stroke(id: "s2"))

        XCTAssertTrue(vm.canUndoStroke)
        vm.undoLastStroke()

        XCTAssertEqual(vm.drawingStrokes.map(\.id), ["s1"])
        XCTAssertEqual(vm.drawingRedoStack.map(\.id), ["s2"])
        XCTAssertTrue(vm.canRedoStroke)
    }

    func test_redo_reappliesUndoneStroke() {
        let vm = makeSubject()
        vm.commitStroke(stroke(id: "s1"))
        vm.undoLastStroke()

        vm.redoLastStroke()

        XCTAssertEqual(vm.drawingStrokes.map(\.id), ["s1"])
        XCTAssertTrue(vm.drawingRedoStack.isEmpty)
    }

    func test_undo_redo_roundtrip_preservesOrder() {
        let vm = makeSubject()
        vm.commitStroke(stroke(id: "a"))
        vm.commitStroke(stroke(id: "b"))
        vm.commitStroke(stroke(id: "c"))

        vm.undoLastStroke()   // remove c
        vm.undoLastStroke()   // remove b
        vm.redoLastStroke()   // re-add b

        XCTAssertEqual(vm.drawingStrokes.map(\.id), ["a", "b"])
        XCTAssertEqual(vm.drawingRedoStack.map(\.id), ["c"])
    }

    func test_undo_onEmpty_isNoOp() {
        let vm = makeSubject()
        XCTAssertFalse(vm.canUndoStroke)
        vm.undoLastStroke()
        XCTAssertTrue(vm.drawingStrokes.isEmpty)
        XCTAssertTrue(vm.drawingRedoStack.isEmpty)
    }

    func test_redo_onEmpty_isNoOp() {
        let vm = makeSubject()
        XCTAssertFalse(vm.canRedoStroke)
        vm.redoLastStroke()
        XCTAssertTrue(vm.drawingStrokes.isEmpty)
    }

    func test_newStrokeAfterUndo_clearsRedo() {
        let vm = makeSubject()
        vm.commitStroke(stroke(id: "s1"))
        vm.undoLastStroke()                 // redo: [s1]
        XCTAssertTrue(vm.canRedoStroke)

        vm.commitStroke(stroke(id: "s2"))   // new draw → redo cleared
        XCTAssertFalse(vm.canRedoStroke)
        XCTAssertEqual(vm.drawingStrokes.map(\.id), ["s2"])
    }

    func test_undo_clearsSelectionIfUndoneStrokeWasSelected() {
        let vm = makeSubject()
        vm.commitStroke(stroke(id: "s1"))
        vm.enterDrawingEditingMode()
        vm.selectStroke("s1")
        XCTAssertEqual(vm.drawingEditingMode.selectedStrokeId, "s1")

        vm.undoLastStroke()
        XCTAssertNil(vm.drawingEditingMode.selectedStrokeId)
    }

    func test_deleteStroke_clearsRedo() {
        let vm = makeSubject()
        vm.commitStroke(stroke(id: "s1"))
        vm.commitStroke(stroke(id: "s2"))
        vm.undoLastStroke()                 // redo: [s2]
        XCTAssertTrue(vm.canRedoStroke)

        vm.deleteStroke("s1")               // manual delete → redo cleared
        XCTAssertFalse(vm.canRedoStroke)
    }
}
