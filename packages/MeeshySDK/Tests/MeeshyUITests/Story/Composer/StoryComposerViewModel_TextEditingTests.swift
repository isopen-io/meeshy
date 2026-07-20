import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Exercise la machine d'états du mode d'édition de texte flottant
/// (`textEditingMode` + `enterTextEditingMode` / `exitTextEditingMode` /
/// `setExpandedTool`). Aucune mutation de géométrie : on vérifie aussi que
/// `enterTextEditingMode` ne touche pas `x/y/scale/rotation`.
@MainActor
final class StoryComposerViewModel_TextEditingTests: XCTestCase {

    private func makeSubject() -> StoryComposerViewModel {
        StoryComposerViewModel()
    }

    func test_initialState_isInactive() {
        XCTAssertEqual(makeSubject().textEditingMode, .inactive)
    }

    func test_enterTextEditingMode_setsActiveState() {
        let vm = makeSubject()
        let text = vm.addText()
        XCTAssertNotNil(text)
        vm.enterTextEditingMode(textId: text!.id)
        XCTAssertEqual(vm.textEditingMode, .active(textId: text!.id, expandedTool: nil))
        XCTAssertEqual(vm.textEditingMode.activeTextId, text!.id)
    }

    func test_enterTextEditingMode_invalidId_staysInactive() {
        let vm = makeSubject()
        vm.enterTextEditingMode(textId: "does-not-exist")
        XCTAssertEqual(vm.textEditingMode, .inactive)
    }

    func test_enterTextEditingMode_setsSelectedElementId() {
        let vm = makeSubject()
        let text = vm.addText()!
        vm.enterTextEditingMode(textId: text.id)
        XCTAssertEqual(vm.selectedElementId, text.id)
    }

    func test_enterTextEditingMode_idempotentOnSameText() {
        let vm = makeSubject()
        let text = vm.addText()!
        vm.enterTextEditingMode(textId: text.id)
        vm.setExpandedTool(.color)
        // Re-entering the same text must not reset the expanded tool.
        vm.enterTextEditingMode(textId: text.id)
        XCTAssertEqual(vm.textEditingMode.expandedTool, .color)
    }

    func test_enterTextEditingMode_doesNotMutateGeometry() {
        let vm = makeSubject()
        let text = vm.addText()!
        vm.enterTextEditingMode(textId: text.id)
        let after = vm.currentEffects.textObjects.first { $0.id == text.id }
        XCTAssertEqual(after?.x, text.x)
        XCTAssertEqual(after?.y, text.y)
        XCTAssertEqual(after?.scale, text.scale)
        XCTAssertEqual(after?.rotation, text.rotation)
        XCTAssertEqual(after?.zIndex, text.zIndex)
        XCTAssertEqual(after?.fontSize, text.fontSize)
    }

    func test_exitTextEditingMode_returnsToInactive() {
        let vm = makeSubject()
        let text = vm.addText()!
        vm.enterTextEditingMode(textId: text.id)
        vm.exitTextEditingMode()
        XCTAssertEqual(vm.textEditingMode, .inactive)
    }

    func test_setExpandedTool_storesTool() {
        let vm = makeSubject()
        let text = vm.addText()!
        vm.enterTextEditingMode(textId: text.id)
        vm.setExpandedTool(.border)
        XCTAssertEqual(vm.textEditingMode.expandedTool, .border)
        vm.setExpandedTool(nil)
        XCTAssertNil(vm.textEditingMode.expandedTool)
    }

    func test_setExpandedTool_whileInactive_isNoOp() {
        let vm = makeSubject()
        vm.setExpandedTool(.style)
        XCTAssertEqual(vm.textEditingMode, .inactive)
    }

    func test_deleteElement_whileEditing_exitsMode() {
        let vm = makeSubject()
        let text = vm.addText()!
        vm.enterTextEditingMode(textId: text.id)
        vm.deleteElement(id: text.id)
        XCTAssertEqual(vm.textEditingMode, .inactive)
    }

    func test_textEditTool_hasAllCases() {
        // style, weight, color, size, align, background, frame, border
        XCTAssertEqual(TextEditTool.allCases.count, 8)
    }
}
