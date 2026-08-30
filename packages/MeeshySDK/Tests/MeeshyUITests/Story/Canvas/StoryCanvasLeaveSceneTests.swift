import XCTest
import UIKit
@testable import MeeshyUI
import MeeshySDK

/// #4046 — « **Sortir de la scène** », la seule des quatre actions de l'issue
/// qui manquait.
///
/// Les trois autres — Monter, Reculer, Modifier — étaient déjà servies sous la
/// loi 4 (`StoryCanvasContextAction.offered`, gardée par
/// `StoryCanvasLockedItemGuardTests`). Celle-ci ne l'était pas, et elle est
/// d'une autre NATURE : les deux premières écrivent le `z` d'un
/// `MeeshyObject` (son ordre DANS son plan), celle-ci écrit son `plane` — le
/// média quitte la scène et redevient une slide du post.
///
/// Les confondre ferait passer un objet devant un fond au lieu de le sortir.
///
/// **Pourquoi un paramètre et pas une lecture du profil.** Le SDK ne connaît
/// ni « Story » ni « Post » : ce sont des notions de l'app. La règle reçoit
/// donc un booléen — l'hôte, qui SAIT son profil, répond « peut-on sortir
/// d'ici ? ». C'est la même frontière que `hasEditor`, qui ne demande pas au
/// SDK s'il existe un éditeur mais si l'hôte en a câblé un.
@MainActor
final class StoryCanvasLeaveSceneTests: XCTestCase {

    /// Même fabrique que `StoryCanvasLockedItemGuardTests` : une scène à deux
    /// textes, montée SANS éditeur — c'est le cas de la scène incrustée.
    private func makeCanvas() -> StoryCanvasUIView {
        let slide = StorySlide(
            id: "s",
            effects: StoryEffects(textObjects: [StoryTextObject(id: "t1", text: "un")]),
            duration: 6,
            order: 0)
        let vue = StoryCanvasUIView(slide: slide, mode: .edit)
        vue.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        return vue
    }

    // MARK: - La règle

    /// En Story, une story EST une scène : on n'en sort pas son fond, ni rien
    /// d'autre. L'action est ABSENTE, jamais grisée (loi 4).
    func test_offered_quandOnNePeutPasSortir_lActionEstAbsente() {
        let servies = StoryCanvasContextAction.offered(
            isLocked: false, isBackground: false,
            sharesPlaneWithAnother: true, hasEditor: true,
            canLeaveScene: false)
        XCTAssertFalse(servies.contains(.leaveScene))
    }

    func test_offered_quandOnPeutSortir_lActionEstServie() {
        let servies = StoryCanvasContextAction.offered(
            isLocked: false, isBackground: false,
            sharesPlaneWithAnother: true, hasEditor: true,
            canLeaveScene: true)
        XCTAssertTrue(servies.contains(.leaveScene))
    }

    /// Un FOND se sort aussi — c'est même le cas nominal en Post : le média
    /// posé au plan `background` redevient une slide. La sortie ne dépend donc
    /// PAS du plan, contrairement à l'empilement.
    func test_offered_unFond_peutSortirDeLaScene() {
        let servies = StoryCanvasContextAction.offered(
            isLocked: false, isBackground: true,
            sharesPlaneWithAnother: false, hasEditor: false,
            canLeaveScene: true)
        XCTAssertTrue(servies.contains(.leaveScene),
                      "Sortir écrit le `plane`, pas le `z` : un fond se sort.")
        XCTAssertFalse(servies.contains(.bringForward),
                       "…et l'empilement, lui, reste refusé à un fond.")
    }

    /// Un élément VERROUILLÉ — le badge d'attribution d'une republication —
    /// ne sort pas : l'en sortir retirerait l'attribution de la scène, ce que
    /// le verrou existe précisément pour empêcher.
    func test_offered_unElementVerrouille_neSortPas() {
        let servies = StoryCanvasContextAction.offered(
            isLocked: true, isBackground: false,
            sharesPlaneWithAnother: true, hasEditor: true,
            canLeaveScene: true)
        XCTAssertFalse(servies.contains(.leaveScene))
        XCTAssertEqual(servies, [.bringForward, .sendBackward],
                       "Le verrou ne laisse passer que l'empilement, inchangé.")
    }

    /// L'ORDRE d'affichage : « Sortir de la scène » se range en AVANT-DERNIER,
    /// juste avant « Supprimer ». Les deux retirent l'objet de la scène ; la
    /// première le rend, la seconde le perd — les voisiner rend le choix
    /// lisible, et met la destructrice en dernier.
    func test_offered_ordreDAffichage_sortirJusteAvantSupprimer() {
        let servies = StoryCanvasContextAction.offered(
            isLocked: false, isBackground: false,
            sharesPlaneWithAnother: true, hasEditor: true,
            canLeaveScene: true)
        XCTAssertEqual(servies, [.edit, .duplicate, .bringForward, .sendBackward,
                                 .leaveScene, .delete])
    }

    /// **La garde NÉGATIVE, celle qui doit rougir si on rend l'action
    /// inconditionnelle.** Sans hôte pour la recevoir, l'action n'a aucun
    /// effet — c'est la loi 4 appliquée à elle-même, exactement comme
    /// « Modifier » sans `onItemDoubleTapped`.
    func test_offered_defautDuParametre_estDeNePasSortir() {
        let servies = StoryCanvasContextAction.offered(
            isLocked: false, isBackground: false,
            sharesPlaneWithAnother: true, hasEditor: true)
        XCTAssertFalse(servies.contains(.leaveScene),
                       "Le défaut FERME : un appelant qui ne se prononce pas n'offre pas la sortie.")
    }

    // MARK: - Le relais

    /// L'action DÉLÈGUE : le SDK ne sait pas ce qu'est « redevenir une slide
    /// du post » — c'est de l'orchestration app. Sans closure câblée, elle
    /// n'est pas offerte (même règle que « Modifier »).
    func test_menu_sansRelaisCable_neProposePasSortirDeLaScene() {
        let vue = makeCanvas()
        vue.onItemLeftScene = nil
        XCTAssertFalse(vue.canLeaveScene,
                       "Sans relais, l'hôte n'a rien pour recevoir la sortie.")
    }

    func test_menu_avecRelaisCable_proposeSortirDeLaScene() {
        let vue = makeCanvas()
        vue.onItemLeftScene = { (_: String, _: StoryCanvasUIView.CanvasItemKind) in }
        XCTAssertTrue(vue.canLeaveScene)
    }

    func test_performContextAction_leaveScene_appelleLeRelaisAvecLIdEtLeKind() {
        let vue = makeCanvas()
        var recu: (String, StoryCanvasUIView.CanvasItemKind)?
        vue.onItemLeftScene = { (id: String, kind: StoryCanvasUIView.CanvasItemKind) in
            recu = (id, kind)
        }

        vue.performContextAction(StoryCanvasContextAction.leaveScene,
                                 on: "obj-1",
                                 kind: StoryCanvasUIView.CanvasItemKind.media)

        XCTAssertEqual(recu?.0, "obj-1")
        XCTAssertEqual(recu?.1, .media)
    }

    // MARK: - Le libellé

    /// Le verbe ne s'écrit plus en français EN DUR : `title` est localisée
    /// depuis `11acc349f0` (« douze mots cessent de répondre en français à tout
    /// le monde »), et ce témoin comparait encore à « Sortir de la scène » —
    /// vert en locale française, rouge partout ailleurs, y compris sur le
    /// simulateur de la CI.
    ///
    /// Ce que le témoin VOULAIT dire survit intact, et sans littéral : la
    /// sortie de scène porte un verbe À ELLE, distinct de celui de la
    /// suppression. C'est la phrase du commentaire ci-dessous — « sortir n'est
    /// pas supprimer » — appliquée au mot autant qu'au glyphe.
    @MainActor
    func test_leaveScene_porteSonVerbeEtSonGlyphe() {
        XCTAssertFalse(StoryCanvasContextAction.leaveScene.title.isEmpty,
                       "un verbe vide ne dirait rien à personne, dans aucune langue")
        XCTAssertNotEqual(StoryCanvasContextAction.leaveScene.title,
                          StoryCanvasContextAction.delete.title,
                          "Sortir n'est pas supprimer — deux verbes distincts.")
        XCTAssertFalse(StoryCanvasContextAction.leaveScene.systemImage.isEmpty)
        XCTAssertNotEqual(StoryCanvasContextAction.leaveScene.systemImage,
                          StoryCanvasContextAction.delete.systemImage,
                          "Sortir n'est pas supprimer — deux glyphes distincts.")
    }
}
