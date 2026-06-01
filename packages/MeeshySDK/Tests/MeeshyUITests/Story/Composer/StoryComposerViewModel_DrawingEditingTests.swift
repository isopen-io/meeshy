import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Exercise la machine d'états du mode d'édition de dessin flottant
/// (`drawingEditingMode` + transitions) et l'édition par-trait (sélection,
/// suppression, recoloration, épaisseur, lissage) sur `drawingStrokes`.
@MainActor
final class StoryComposerViewModel_DrawingEditingTests: XCTestCase {

    private func makeSubject() -> StoryComposerViewModel {
        StoryComposerViewModel()
    }

    private func stroke(id: String, colorHex: String = "FF0000",
                        width: Double = 5,
                        smoothing: StrokeSmoothing = .raw) -> StoryDrawingStroke {
        StoryDrawingStroke(
            id: id,
            points: [StoryDrawingStrokePoint(x: 0, y: 0), StoryDrawingStrokePoint(x: 10, y: 10)],
            colorHex: colorHex, width: width, tool: .pen, smoothing: smoothing)
    }

    func test_initialState_isInactive() {
        XCTAssertEqual(makeSubject().drawingEditingMode, .inactive)
    }

    func test_enterDrawingEditingMode_whenNoStrokes_expandsColorPalette() {
        let vm = makeSubject()
        vm.enterDrawingEditingMode()
        XCTAssertTrue(vm.drawingEditingMode.isActive)
        XCTAssertNil(vm.drawingEditingMode.selectedStrokeId)
        XCTAssertEqual(vm.drawingEditingMode.expandedTool, .color)
    }

    func test_enterDrawingEditingMode_whenStrokesExist_noExpandedPanel() {
        let vm = makeSubject()
        vm.drawingStrokes = [stroke(id: "s1")]
        vm.enterDrawingEditingMode()
        XCTAssertTrue(vm.drawingEditingMode.isActive)
        XCTAssertNil(vm.drawingEditingMode.selectedStrokeId)
        XCTAssertNil(vm.drawingEditingMode.expandedTool)
    }

    func test_setExpandedDrawingTool_updatesWhenActive() {
        let vm = makeSubject()
        vm.enterDrawingEditingMode()
        vm.setExpandedDrawingTool(.color)
        XCTAssertEqual(vm.drawingEditingMode.expandedTool, .color)
    }

    func test_setExpandedDrawingTool_noopWhenInactive() {
        let vm = makeSubject()
        vm.setExpandedDrawingTool(.color)
        XCTAssertEqual(vm.drawingEditingMode, .inactive)
    }

    func test_selectStroke_validId_updatesMode() {
        let vm = makeSubject()
        vm.drawingStrokes = [stroke(id: "s1")]
        vm.enterDrawingEditingMode()
        vm.selectStroke("s1")
        XCTAssertEqual(vm.drawingEditingMode.selectedStrokeId, "s1")
    }

    func test_selectStroke_invalidId_noop() {
        let vm = makeSubject()
        vm.drawingStrokes = [stroke(id: "s1")]
        vm.enterDrawingEditingMode()
        vm.selectStroke("nope")
        XCTAssertNil(vm.drawingEditingMode.selectedStrokeId)
    }

    func test_deleteStroke_removesFromArrayAndClearsSelectionIfSelected() {
        let vm = makeSubject()
        vm.drawingStrokes = [stroke(id: "s1"), stroke(id: "s2")]
        vm.enterDrawingEditingMode()
        vm.selectStroke("s1")
        vm.deleteStroke("s1")
        XCTAssertEqual(vm.drawingStrokes.map(\.id), ["s2"])
        XCTAssertNil(vm.drawingEditingMode.selectedStrokeId)
    }

    func test_deleteStroke_unselected_keepsSelection() {
        let vm = makeSubject()
        vm.drawingStrokes = [stroke(id: "s1"), stroke(id: "s2")]
        vm.enterDrawingEditingMode()
        vm.selectStroke("s2")
        vm.deleteStroke("s1")
        XCTAssertEqual(vm.drawingStrokes.map(\.id), ["s2"])
        XCTAssertEqual(vm.drawingEditingMode.selectedStrokeId, "s2")
    }

    func test_updateSelectedStrokeColor_mutatesStroke() {
        let vm = makeSubject()
        vm.drawingStrokes = [stroke(id: "s1", colorHex: "FF0000")]
        vm.enterDrawingEditingMode()
        vm.selectStroke("s1")
        vm.updateSelectedStrokeColor("00FF00")
        XCTAssertEqual(vm.drawingStrokes.first?.colorHex, "00FF00")
    }

    func test_updateSelectedStrokeWidth_mutatesStroke() {
        let vm = makeSubject()
        vm.drawingStrokes = [stroke(id: "s1", width: 5)]
        vm.enterDrawingEditingMode()
        vm.selectStroke("s1")
        vm.updateSelectedStrokeWidth(18)
        XCTAssertEqual(vm.drawingStrokes.first?.width, 18)
    }

    func test_updateSelectedStrokeSmoothing_mutatesStroke() {
        let vm = makeSubject()
        vm.drawingStrokes = [stroke(id: "s1", smoothing: .raw)]
        vm.enterDrawingEditingMode()
        vm.selectStroke("s1")
        vm.updateSelectedStrokeSmoothing(.curve)
        XCTAssertEqual(vm.drawingStrokes.first?.smoothing, .curve)
    }

    func test_updateSelectedStroke_noSelection_noop() {
        let vm = makeSubject()
        vm.drawingStrokes = [stroke(id: "s1", colorHex: "FF0000")]
        vm.enterDrawingEditingMode()
        vm.updateSelectedStrokeColor("00FF00")
        XCTAssertEqual(vm.drawingStrokes.first?.colorHex, "FF0000")
    }

    func test_exit_resetsToInactive() {
        let vm = makeSubject()
        vm.enterDrawingEditingMode()
        vm.selectStroke(nil)
        vm.exitDrawingEditingMode()
        XCTAssertEqual(vm.drawingEditingMode, .inactive)
    }

    func test_drawingStrokes_computed_roundtripsThroughCurrentEffects() {
        let vm = makeSubject()
        vm.drawingStrokes = [stroke(id: "s1")]
        XCTAssertEqual(vm.currentEffects.drawingStrokes?.map(\.id), ["s1"])
        XCTAssertEqual(vm.drawingStrokes.map(\.id), ["s1"])
    }

    func test_drawingStrokes_emptyAssignment_clearsEffects() {
        let vm = makeSubject()
        vm.drawingStrokes = [stroke(id: "s1")]
        vm.drawingStrokes = []
        XCTAssertNil(vm.currentEffects.drawingStrokes)
    }
}
