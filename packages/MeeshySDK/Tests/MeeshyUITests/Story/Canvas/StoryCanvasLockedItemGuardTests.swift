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
        // **La fixture CÂBLE l'éditeur (#4046)**, comme le fait l'atelier de
        // production (`StoryComposerView+Canvas.swift:1131`). Elle ne le faisait
        // pas, et affirmait pourtant « Modifier est offerte » — sur un canvas
        // qui n'avait AUCUN éditeur derrière. Une fixture plus pauvre que la
        // production fait passer au vert une entrée qui, chez l'utilisateur,
        // pourrait ne rien faire.
        view.onItemDoubleTapped = { _, _ in }
        return view
    }

    /// Le canvas SANS éditeur — celui de la scène incrustée, qui ne transmet pas
    /// `onItemDoubleTapped`. C'est là que « Modifier » peignait au-dessus d'un
    /// `nil`.
    private func makeCanvasSansEditeur() -> StoryCanvasUIView {
        let slide = StorySlide(id: "s",
                               effects: StoryEffects(textObjects: [lockedText(), freeText()]),
                               duration: 6,
                               order: 0)
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        return view
    }

    /// **Le témoin du cas RÉEL** : la scène incrustée de l'écran document ne
    /// câble aucun éditeur, et son menu ne doit donc pas proposer « Modifier ».
    func test_contextMenu_sansEditeurCable_neProposePasModifier() {
        let vue = makeCanvasSansEditeur()
        let titres = vue.contextMenu(for: freeText().id, kind: .text)
            .children.compactMap { ($0 as? UIAction)?.title }
        // Les deux entrées se nomment par leur ACTION, jamais par un littéral
        // français : `title` est localisée depuis `11acc349f0`, et comparer à
        // « Modifier » / « Dupliquer » rendait ce témoin vert en France et
        // rouge partout ailleurs. Passer par la propriété teste ce que le
        // témoin visait — QUELLES actions sont offertes — sans dépendre de la
        // langue du simulateur.
        XCTAssertFalse(titres.contains(StoryCanvasContextAction.edit.title),
                       "Sans `onItemDoubleTapped`, « Modifier » n'a personne derrière elle.")
        XCTAssertTrue(titres.contains(StoryCanvasContextAction.duplicate.title),
                      "…et les entrées qui ne dépendent d'aucun hôte restent servies.")
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

    /// Le verrou n'a pas bougé au #4046 — il retire toujours contenu et
    /// duplication, et laisse l'empilement. Ce qui a bougé, c'est que
    /// l'empilement est désormais lui aussi soumis à « a-t-il un effet ? ».
    func test_offered_lockedItem_keepsOnlyStackingActions() {
        XCTAssertEqual(
            StoryCanvasContextAction.offered(
                isLocked: true, isBackground: false,
                sharesPlaneWithAnother: true, hasEditor: true),
            [.bringForward, .sendBackward]
        )
    }

    /// « Toutes les actions » exige désormais que l'hôte sache RECEVOIR une
    /// sortie (#4046) : `canLeaveScene` est le sixième cas, et son défaut
    /// FERME. Sans ce paramètre, ce témoin n'affirmerait plus « toutes » mais
    /// « toutes sauf une », en le disant avec le même mot.
    func test_offered_unlockedItem_keepsEveryAction() {
        XCTAssertEqual(
            StoryCanvasContextAction.offered(
                isLocked: false, isBackground: false,
                sharesPlaneWithAnother: true, hasEditor: true,
                canLeaveScene: true),
            [.edit, .duplicate, .bringForward, .sendBackward, .leaveScene, .delete]
        )
    }

    // MARK: - #4046 — loi 4 : une action absente, jamais grisée

    /// **Le défaut principal.** « Mettre au premier plan » un objet qui y est
    /// déjà, faute de frère, ne déplace RIEN : le menu proposait un geste dont
    /// le résultat est l'écran d'avant.
    func test_offered_unObjetSeulDeSonPlan_nOffreAucunEmpilement() {
        let servies = StoryCanvasContextAction.offered(
            isLocked: false, isBackground: false,
            sharesPlaneWithAnother: false, hasEditor: true)
        XCTAssertFalse(servies.contains(.bringForward))
        XCTAssertFalse(servies.contains(.sendBackward))
        XCTAssertEqual(servies, [.edit, .duplicate, .delete],
                       "…et les trois autres restent : elles ont un effet.")
    }

    /// Un FOND n'est pas dans le plan : l'empiler ne veut rien dire.
    func test_offered_unFond_nOffreAucunEmpilement_memeAvecDesFreres() {
        let servies = StoryCanvasContextAction.offered(
            isLocked: false, isBackground: true,
            sharesPlaneWithAnother: true, hasEditor: true)
        XCTAssertFalse(servies.contains(.bringForward))
        XCTAssertFalse(servies.contains(.sendBackward))
    }

    /// **« Modifier » délègue à `onItemDoubleTapped`, que l'HÔTE fournit.** La
    /// scène incrustée de l'écran document ne la transmet pas : le menu y
    /// peignait « Modifier » au-dessus d'un `nil`.
    func test_offered_sansEditeur_nOffrePasModifier() {
        let servies = StoryCanvasContextAction.offered(
            isLocked: false, isBackground: false,
            sharesPlaneWithAnother: true, hasEditor: false)
        XCTAssertFalse(servies.contains(.edit))
        XCTAssertTrue(servies.contains(.duplicate), "Dupliquer, lui, n'a besoin d'aucun hôte.")
    }

    /// Le cas dégénéré : un objet verrouillé, seul de son plan, n'offre RIEN —
    /// et le menu ne doit alors pas s'ouvrir sur une liste vide.
    func test_offered_verrouilleEtSeul_nOffreRien() {
        XCTAssertTrue(
            StoryCanvasContextAction.offered(
                isLocked: true, isBackground: false,
                sharesPlaneWithAnother: false, hasEditor: true).isEmpty
        )
    }

    /// L'ORDRE d'affichage ne bouge pas quand une entrée disparaît : le menu
    /// reste lisible d'un objet à l'autre.
    func test_offered_gardeLOrdreDAffichage() {
        let servies = StoryCanvasContextAction.offered(
            isLocked: false, isBackground: false,
            sharesPlaneWithAnother: true, hasEditor: true)
        XCTAssertEqual(servies, [.edit, .duplicate, .bringForward, .sendBackward, .delete])
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
        // Comme pour l'éditeur ci-dessus : la fixture CÂBLE le relais de sortie,
        // sans quoi elle affirmerait « toutes les actions » sur un menu à qui
        // il en manque une par construction (#4046).
        view.onItemLeftScene = { (_: String, _: StoryCanvasUIView.CanvasItemKind) in }

        let titles = view.contextMenu(for: Self.freeId, kind: .text).children.map(\.title)

        let expectedActions: [StoryCanvasContextAction] = [.edit, .duplicate, .bringForward, .sendBackward, .leaveScene, .delete]
        XCTAssertEqual(titles, expectedActions.map(\.title))
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
