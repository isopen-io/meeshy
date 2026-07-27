// packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryCanvasLockedItemGuardTests.swift
import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Un texte `isLocked` ne doit être ni supprimé ni dupliqué, quel que soit le
/// chemin emprunté.
///
/// Le seul porteur de ce drapeau aujourd'hui est le badge d'attribution posé
/// par `StoryComposerViewModel(reposting:)` : « Reposté de @X ». Son verrou est
/// la garantie que l'attribution d'une republication ne peut pas être retirée.
///
/// Cette garantie n'existait que sur la voie ViewModel (`deleteElement`,
/// `duplicateElement`, utilisée par la liste de textes du panneau). Les chemins
/// CANVAS — menu contextuel du long-press, manipulation directe, action
/// VoiceOver — mutent `slide.effects` sans passer par le ViewModel et ne
/// testaient donc jamais `isLocked` : taper longuement le badge puis
/// « Supprimer » l'effaçait. Le commentaire de `deleteElement` affirmait
/// pourtant que le badge « cannot be deleted from any path ».
@MainActor
final class StoryCanvasLockedItemGuardTests: XCTestCase {

    private static let lockedId = "attribution-badge"
    private static let freeId = "ordinary-text"

    private func makeCanvas() -> StoryCanvasUIView {
        let locked = StoryTextObject(id: Self.lockedId, text: "Reposté de @alice", isLocked: true)
        let free = StoryTextObject(id: Self.freeId, text: "Bonjour")
        let slide = StorySlide(id: UUID().uuidString,
                               effects: StoryEffects(textObjects: [locked, free]),
                               duration: 6,
                               order: 0)
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        return view
    }

    private func textIds(_ view: StoryCanvasUIView) -> [String] {
        view.slide.effects.textObjects.map(\.id)
    }

    // MARK: - Suppression

    func test_deleteItem_refusesALockedText() {
        let view = makeCanvas()

        view.deleteItem(id: Self.lockedId)

        XCTAssertTrue(textIds(view).contains(Self.lockedId),
                      "Le badge d'attribution a été supprimé depuis le canvas.")
    }

    func test_contextDelete_refusesALockedText() {
        let view = makeCanvas()

        view.contextDelete(id: Self.lockedId)

        XCTAssertTrue(textIds(view).contains(Self.lockedId),
                      "Le badge d'attribution a été supprimé par le menu contextuel.")
    }

    /// La garde ne doit pas déborder : un texte ordinaire reste supprimable par
    /// les mêmes chemins.
    func test_deleteItem_stillRemovesAnOrdinaryText() {
        let view = makeCanvas()

        view.deleteItem(id: Self.freeId)

        XCTAssertFalse(textIds(view).contains(Self.freeId))
    }

    func test_contextDelete_stillRemovesAnOrdinaryText() {
        let view = makeCanvas()

        view.contextDelete(id: Self.freeId)

        XCTAssertFalse(textIds(view).contains(Self.freeId))
    }

    // MARK: - Duplication

    /// Dupliquer le badge produirait deux attributions, dont une modifiable —
    /// et la copie ne serait plus la trace fiable de l'auteur d'origine.
    func test_duplicateItem_refusesALockedText() {
        let view = makeCanvas()
        let before = textIds(view).count

        view.duplicateItem(id: Self.lockedId)

        XCTAssertEqual(textIds(view).count, before,
                       "Le badge d'attribution a été dupliqué.")
    }

    func test_duplicateItem_stillCopiesAnOrdinaryText() {
        let view = makeCanvas()
        let before = textIds(view).count

        view.duplicateItem(id: Self.freeId)

        XCTAssertEqual(textIds(view).count, before + 1)
    }

    // MARK: - Édition

    /// Le tap sur le badge ouvrait l'éditeur de texte complet : on pouvait le
    /// réécrire, le décolorer jusqu'à l'illisible ou le pousser hors champ —
    /// c'est-à-dire retirer l'attribution sans jamais la supprimer.
    func test_enterTextEditingMode_refusesALockedText() {
        let locked = StoryTextObject(id: Self.lockedId, text: "Reposté de @alice", isLocked: true)
        let vm = StoryComposerViewModel()
        vm.currentEffects = StoryEffects(textObjects: [locked])

        vm.enterTextEditingMode(textId: Self.lockedId)

        XCTAssertNil(vm.textEditingMode.activeTextId,
                     "L'éditeur s'est ouvert sur le badge d'attribution.")
    }

    func test_enterTextEditingMode_stillOpensAnOrdinaryText() {
        let free = StoryTextObject(id: Self.freeId, text: "Bonjour")
        let vm = StoryComposerViewModel()
        vm.currentEffects = StoryEffects(textObjects: [free])

        vm.enterTextEditingMode(textId: Self.freeId)

        XCTAssertEqual(vm.textEditingMode.activeTextId, Self.freeId)
    }
}
