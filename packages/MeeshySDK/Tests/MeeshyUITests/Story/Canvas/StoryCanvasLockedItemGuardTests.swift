import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Un texte `isLocked` — le badge d'attribution posé par
/// `StoryComposerViewModel(reposting:)`, « Reposté de @X » — ne doit être ni
/// supprimé, ni dupliqué, ni édité, quel que soit le chemin emprunté.
///
/// La garantie n'existait que sur la voie ViewModel (`deleteElement`,
/// `duplicateElement`). Les chemins CANVAS — menu long-press, action
/// VoiceOver, tap qui ouvre l'éditeur — mutent `slide.effects` sans passer
/// par lui et ne lisaient jamais le drapeau. Chaque garde a son test de
/// non-débordement : un texte ordinaire reste supprimable, duplicable et
/// éditable par les mêmes chemins.
@MainActor
final class StoryCanvasLockedItemGuardTests: XCTestCase {

    private static let lockedId = "attribution-badge"
    private static let freeId = "ordinary-text"

    private func lockedText() -> StoryTextObject {
        StoryTextObject(id: Self.lockedId, text: "Reposté de @alice", y: 0.92, isLocked: true)
    }

    private func freeText() -> StoryTextObject {
        StoryTextObject(id: Self.freeId, text: "Bonjour")
    }

    private func makeCanvas() -> StoryCanvasUIView {
        let slide = StorySlide(id: "s",
                               effects: StoryEffects(textObjects: [lockedText(), freeText()]),
                               duration: 6,
                               order: 0)
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        return view
    }

    private func textIds(_ view: StoryCanvasUIView) -> [String] {
        view.slide.effects.textObjects.map(\.id)
    }

    private var sendToBackName: String {
        String(localized: "story.canvas.a11y.sendToBack", defaultValue: "Mettre à l'arrière", bundle: .module)
    }

    // MARK: - Suppression

    func test_deleteItem_lockedText_isKept() {
        let view = makeCanvas()

        view.deleteItem(id: Self.lockedId)

        XCTAssertTrue(textIds(view).contains(Self.lockedId),
                      "Le badge d'attribution a été supprimé par l'action VoiceOver.")
    }

    func test_deleteItem_ordinaryText_isRemoved() {
        let view = makeCanvas()

        view.deleteItem(id: Self.freeId)

        XCTAssertFalse(textIds(view).contains(Self.freeId))
    }

    func test_contextDelete_lockedText_isKeptAndHostIsNotNotified() {
        let view = makeCanvas()
        var notifications = 0
        view.onItemModified = { _ in notifications += 1 }

        view.contextDelete(id: Self.lockedId)

        XCTAssertTrue(textIds(view).contains(Self.lockedId),
                      "Le badge d'attribution a été supprimé par le menu long-press.")
        XCTAssertEqual(notifications, 0, "Un refus ne produit aucune mutation à propager.")
    }

    func test_contextDelete_ordinaryText_isRemoved() {
        let view = makeCanvas()

        view.contextDelete(id: Self.freeId)

        XCTAssertFalse(textIds(view).contains(Self.freeId))
    }

    // MARK: - Duplication

    /// Dupliquer le badge produirait deux attributions, dont une modifiable.
    func test_duplicateItem_lockedText_isNotCopied() {
        let view = makeCanvas()
        let before = textIds(view).count

        view.duplicateItem(id: Self.lockedId)

        XCTAssertEqual(textIds(view).count, before, "Le badge d'attribution a été dupliqué.")
    }

    func test_duplicateItem_ordinaryText_isCopied() {
        let view = makeCanvas()
        let before = textIds(view).count

        view.duplicateItem(id: Self.freeId)

        XCTAssertEqual(textIds(view).count, before + 1)
    }

    func test_contextDuplicate_lockedText_isNotCopiedAndNoDuplicationIsAnnounced() {
        let view = makeCanvas()
        var announcements = 0
        view.onItemDuplicated = { _, _, _ in announcements += 1 }
        let before = textIds(view).count

        view.contextDuplicate(id: Self.lockedId)

        XCTAssertEqual(textIds(view).count, before, "Le badge d'attribution a été dupliqué.")
        XCTAssertEqual(announcements, 0)
    }

    func test_contextDuplicate_ordinaryText_isCopied() {
        let view = makeCanvas()
        let before = textIds(view).count

        view.contextDuplicate(id: Self.freeId)

        XCTAssertEqual(textIds(view).count, before + 1)
    }

    // MARK: - Menu long-press

    func test_offered_lockedItem_keepsOnlyStackingActions() {
        XCTAssertEqual(StoryCanvasContextAction.offered(isLocked: true), [.bringForward, .sendBackward])
    }

    func test_offered_unlockedItem_keepsEveryAction() {
        XCTAssertEqual(StoryCanvasContextAction.offered(isLocked: false), StoryCanvasContextAction.allCases)
    }

    func test_contextMenu_lockedText_hidesEditDuplicateAndDelete() {
        let view = makeCanvas()

        let titles = view.contextMenu(for: Self.lockedId, kind: .text).children.map(\.title)

        XCTAssertEqual(titles, [StoryCanvasContextAction.bringForward.title,
                                StoryCanvasContextAction.sendBackward.title],
                       "Le menu propose encore une action qui retire ou dénature l'attribution.")
    }

    func test_contextMenu_ordinaryText_offersEveryAction() {
        let view = makeCanvas()

        let titles = view.contextMenu(for: Self.freeId, kind: .text).children.map(\.title)

        XCTAssertEqual(titles, StoryCanvasContextAction.allCases.map(\.title))
    }

    /// Même si une entrée de menu était fabriquée ailleurs, le point de
    /// passage du menu refuse un élément verrouillé.
    func test_performContextAction_deleteOnLockedText_isKept() {
        let view = makeCanvas()

        view.performContextAction(.delete, on: Self.lockedId, kind: .text)

        XCTAssertTrue(textIds(view).contains(Self.lockedId))
    }

    func test_performContextAction_duplicateOnLockedText_isNotCopied() {
        let view = makeCanvas()
        let before = textIds(view).count

        view.performContextAction(.duplicate, on: Self.lockedId, kind: .text)

        XCTAssertEqual(textIds(view).count, before)
    }

    // MARK: - Actions VoiceOver

    /// Annoncer « Supprimer » sur un élément qui refuse la suppression serait
    /// un cul-de-sac VoiceOver : l'action n'est pas offerte.
    func test_makeCustomActions_lockedText_offersOnlySendToBack() {
        let view = makeCanvas()

        let names = view.makeCustomActions(forId: Self.lockedId, kind: .text).map(\.name)

        XCTAssertEqual(names, [sendToBackName])
    }

    func test_makeCustomActions_ordinaryText_stillOffersEditDeleteDuplicateAndSendToBack() {
        let view = makeCanvas()

        let names = view.makeCustomActions(forId: Self.freeId, kind: .text).map(\.name)

        XCTAssertEqual(names.count, 4)
        XCTAssertEqual(names.last, sendToBackName)
    }

    // MARK: - Édition

    /// Le tap sur le badge ouvrait l'éditeur de texte complet : le réécrire,
    /// le décolorer jusqu'à l'illisible ou le pousser hors champ revient à
    /// retirer l'attribution sans jamais la supprimer.
    func test_enterTextEditingMode_lockedText_staysInactive() {
        let vm = StoryComposerViewModel()
        vm.currentEffects = StoryEffects(textObjects: [lockedText()])

        vm.enterTextEditingMode(textId: Self.lockedId)

        XCTAssertNil(vm.textEditingMode.activeTextId,
                     "L'éditeur s'est ouvert sur le badge d'attribution.")
    }

    func test_enterTextEditingMode_ordinaryText_becomesActive() {
        let vm = StoryComposerViewModel()
        vm.currentEffects = StoryEffects(textObjects: [freeText()])

        vm.enterTextEditingMode(textId: Self.freeId)

        XCTAssertEqual(vm.textEditingMode.activeTextId, Self.freeId)
    }
}
