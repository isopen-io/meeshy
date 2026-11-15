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

    /// Refermer un panneau rend la main aux bulles — il ne quitte PAS l'édition.
    /// C'est ce que fait le tap hors du panneau ; seul « Terminé » sort. Le test
    /// voisin ne vérifiait que la remise à zéro de l'outil, si bien qu'un
    /// `setExpandedTool(nil)` qui aurait fermé l'éditeur entier serait passé vert.
    func test_setExpandedTool_nil_keepsEditingTheSameText() {
        let vm = makeSubject()
        let text = vm.addText()!
        vm.enterTextEditingMode(textId: text.id)
        vm.setExpandedTool(.frame)

        vm.setExpandedTool(nil)

        XCTAssertEqual(vm.textEditingMode, .active(textId: text.id, expandedTool: nil))
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

    /// L'ordre est celui de l'ÉNUMÉRÉ (la barre lit `TextEditTool.all`, cf.
    /// ci-dessous) : le verrouiller fait échouer le test avec le nom de
    /// l'outil ajouté ou déplacé, là où un simple compte disait seulement
    /// « 9 au lieu de 8 ».
    ///
    /// `language` a rejoint la liste le 2026-07-25 : la langue d'écriture se
    /// règle à côté des attributs visuels parce qu'une langue source fausse ne
    /// se voit pas à l'écriture — elle ne se paie qu'à la traduction.
    /// Taille et graisse ont quitté la liste le 2026-07-28 : ce sont des
    /// valeurs continues, réglées par curseur dans le panneau Police. Les
    /// loger derrière une bulle chacune coûtait deux places sur une rangée
    /// dont la largeur est comptée.
    /// `effect` a rejoint la liste le 2026-09-02 (#4870), EN QUEUE de
    /// l'énuméré : c'est `TextEditTool.all` qui porte l'ordre de la rangée
    /// (l'EFFET y est deuxième, après la police), et les deux ordres ne
    /// coïncident plus — ce que `TextEditToolbarLayoutTests` garde de son
    /// côté. Cette liste-ci documente l'ÉNUMÉRÉ, pas la barre.
    func test_textEditTool_hasAllCases() {
        XCTAssertEqual(
            TextEditTool.allCases,
            [.style, .color, .align, .background, .frame, .border, .language, .effect]
        )
    }
}
