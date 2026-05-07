import XCTest
import CoreGraphics
@testable import MeeshyUI

final class ClipSelectionStateTests: XCTestCase {

    func test_empty_hasNoSelection() {
        let state = ClipSelectionState()
        XCTAssertNil(state.selectedClipId)
        XCTAssertNil(state.activeDrag)
        XCTAssertFalse(state.isDragging)
        XCTAssertFalse(state.isSelected("any"))
    }

    func test_selecting_setsSelectedClipId() {
        var state = ClipSelectionState()
        state.select("clip-1")
        XCTAssertEqual(state.selectedClipId, "clip-1")
        XCTAssertTrue(state.isSelected("clip-1"))
        XCTAssertFalse(state.isSelected("clip-2"))
    }

    func test_deselect_clearsSelection() {
        var state = ClipSelectionState()
        state.select("clip-1")
        state.deselect()
        XCTAssertNil(state.selectedClipId)
    }

    func test_beginDrag_setsActiveDrag_andIsDragging() throws {
        var state = ClipSelectionState()
        state.beginDrag(clipId: "clip-1", originalStartTime: 1.0)
        let drag = try XCTUnwrap(state.activeDrag)
        XCTAssertEqual(drag.clipId, "clip-1")
        XCTAssertEqual(drag.originalStartTime, 1.0 as Float, accuracy: 0.001)
        XCTAssertEqual(drag.currentStartTime, 1.0 as Float, accuracy: 0.001)
        XCTAssertTrue(state.isDragging)
    }

    func test_updateDrag_changesCurrentStartTime() throws {
        var state = ClipSelectionState()
        state.beginDrag(clipId: "clip-1", originalStartTime: 1.0)
        state.updateDrag(currentStartTime: 2.5, snappedTo: nil)
        let drag = try XCTUnwrap(state.activeDrag)
        XCTAssertEqual(drag.currentStartTime, 2.5 as Float, accuracy: 0.001)
        XCTAssertNil(drag.snappedTo)
    }

    func test_endDrag_clearsActiveDrag() {
        var state = ClipSelectionState()
        state.beginDrag(clipId: "clip-1", originalStartTime: 1.0)
        state.endDrag()
        XCTAssertNil(state.activeDrag)
        XCTAssertFalse(state.isDragging)
    }
}
