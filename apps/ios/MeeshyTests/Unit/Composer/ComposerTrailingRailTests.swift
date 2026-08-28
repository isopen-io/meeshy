import XCTest
import SwiftUI
@testable import Meeshy
import MeeshyUI
import MeeshySDK

/// #4063 — le rail *trailing* porte les CONTRÔLEURS de l'objet sélectionné.
///
/// **Ce qu'il porte n'est pas une invention** : exactement ce que l'appui long
/// propose déjà (`StoryCanvasContextAction`, #4046). Même règle, autre
/// géographie. Une seconde liste aurait produit deux inventaires d'un même
/// geste, dont la divergence n'aurait rougi nulle part — chacun restant
/// cohérent avec lui-même pendant que le menu offrirait ce que le rail refuse.
///
/// Ces témoins gardent la POLITIQUE app-side, celle qui décide de ce que CE
/// meuble sait faire ; la règle du SDK a la sienne
/// (`StoryCanvasLeaveSceneTests`, `StoryCanvasLockedItemGuardTests`).
@MainActor
final class ComposerTrailingRailTests: XCTestCase {

    private func slide(texts: [StoryTextObject] = []) -> StorySlide {
        StorySlide(id: "s", effects: StoryEffects(textObjects: texts), duration: 6, order: 0)
    }

    private func texte(_ id: String, locked: Bool = false) -> StoryTextObject {
        var t = StoryTextObject(id: id, text: id)
        t.isLocked = locked
        return t
    }

    private let tout: Set<StoryCanvasContextAction> = Set(StoryCanvasContextAction.allCases)

    // MARK: - Loi 4 : sans sélection, il n'y a pas de rail

    /// C'est le témoin qui décide de l'EXISTENCE du rail : la vue ne se monte
    /// que sur une liste non vide.
    func test_sansSelection_aucuneAction_doncAucunRail() {
        XCTAssertTrue(ComposerTrailingRailPolicy.actions(
            slide: slide(texts: [texte("a")]), selectedId: nil,
            served: tout, hasEditor: true, canLeaveScene: true).isEmpty)
    }

    func test_sansSlide_aucuneAction() {
        XCTAssertTrue(ComposerTrailingRailPolicy.actions(
            slide: nil, selectedId: "a",
            served: tout, hasEditor: true, canLeaveScene: true).isEmpty)
    }

    // MARK: - Le filtre APP-side

    /// **Ce que le meuble ne SAIT pas faire n'est pas peint**, et la loi 4 ne
    /// fait pas d'exception pour ce qu'on compte câbler bientôt. L'empilement
    /// ne vit que sur la `StoryCanvasUIView`, dont le meuble n'a aucune
    /// référence.
    func test_uneActionNonServieParLHote_estAbsente() {
        let servies = ComposerTrailingRailPolicy.actions(
            slide: slide(texts: [texte("a"), texte("b")]), selectedId: "a",
            served: [.duplicate, .delete], hasEditor: true, canLeaveScene: true)
        XCTAssertEqual(servies, [.duplicate, .delete])
        XCTAssertFalse(servies.contains(.bringForward),
                       "L'empilement n'a aucune primitive côté meuble.")
    }

    /// Le filtre app-side ne peut RIEN AJOUTER : il ne fait que retrancher de
    /// ce que la règle du SDK a déjà admis. Un objet verrouillé reste
    /// verrouillé, quoi que l'hôte déclare savoir faire.
    func test_leFiltreDeLHote_neContourneJamaisLaRegleDuSDK() {
        let servies = ComposerTrailingRailPolicy.actions(
            slide: slide(texts: [texte("a", locked: true), texte("b")]), selectedId: "a",
            served: tout, hasEditor: true, canLeaveScene: true)
        XCTAssertFalse(servies.contains(.delete),
                       "Le badge d'attribution ne se supprime pas, même si l'hôte sait supprimer.")
        XCTAssertFalse(servies.contains(.duplicate))
        XCTAssertEqual(servies, [.bringForward, .sendBackward],
                       "Le verrou ne laisse passer que l'empilement.")
    }

    // MARK: - Les prédicats EXTRAITS

    /// La règle a été extraite en `StorySceneObjectPredicates` pour que le menu
    /// ET le rail posent la même question. Ce témoin garde qu'elle répond bien
    /// depuis une simple `StorySlide`, sans aucune vue.
    func test_lesPredicats_repondentDepuisUneSlideSeule() {
        let s = slide(texts: [texte("a"), texte("b")])
        XCTAssertFalse(StorySceneObjectPredicates.isLocked(slide: s, id: "a"))
        XCTAssertFalse(StorySceneObjectPredicates.isBackground(slide: s, id: "a"))
        XCTAssertTrue(StorySceneObjectPredicates.sharesPlaneWithAnother(slide: s, besides: "a"))
    }

    /// Un objet SEUL de son plan n'a pas de frère — et c'est ce qui retire
    /// l'empilement (loi 4, #4046).
    func test_unObjetSeul_naPasDeFrereDePlan() {
        let s = slide(texts: [texte("a")])
        XCTAssertFalse(StorySceneObjectPredicates.sharesPlaneWithAnother(slide: s, besides: "a"))
    }

    func test_leVerrou_seLitDepuisLaSlide() {
        let s = slide(texts: [texte("badge", locked: true), texte("libre")])
        XCTAssertTrue(StorySceneObjectPredicates.isLocked(slide: s, id: "badge"))
        XCTAssertFalse(StorySceneObjectPredicates.isLocked(slide: s, id: "libre"))
    }

    // MARK: - La vue

    private func railSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerTrailingRail.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_laSourceDuRail_estLisibleEtNonVide() throws {
        let source = try railSource()
        XCTAssertGreaterThan(source.count, 800)
        XCTAssertTrue(source.contains("struct ComposerTrailingRail"))
    }

    /// Jamais « à droite » — l'arabe échange les deux côtés.
    func test_leRail_neNommeAucunCoteAbsolu() throws {
        let source = compact(try railSource())
        for interdit in [".left)", ".right)", "alignment:.left", "alignment:.right"] {
            XCTAssertFalse(source.contains(interdit), interdit)
        }
    }

    /// Ancré en bas, comme sa jumelle *leading* — le ressort PRÉCÈDE les
    /// actions.
    func test_lesActions_sontPousseesVersLeBas() throws {
        XCTAssertTrue(compact(try railSource()).contains("Spacer(minLength:0)ForEach(actions"))
    }

    /// La vue ne re-filtre pas : une seconde loi 4 divergerait de la première.
    func test_laVue_neRefiltrePasLesActions() throws {
        XCTAssertFalse(compact(try railSource()).contains("ComposerTrailingRailPolicy.actions("))
    }

    /// **La seule action DESTRUCTRICE porte la couleur sémantique d'erreur** —
    /// jamais une couleur de format (U15). Sans elle, supprimer et dupliquer se
    /// ressemblent, et l'irréversible se confond avec l'anodin.
    func test_lActionDestructrice_porteLaCouleurSemantique() throws {
        XCTAssertTrue(compact(try railSource()).contains("action==.delete?MeeshyColors.error"))
    }

    /// Les libellés viennent de l'ACTION, jamais d'une seconde table — sinon
    /// le menu et le rail se mettraient à nommer différemment le même geste.
    func test_lesLibelles_viennentDeLAction() throws {
        XCTAssertTrue(compact(try railSource()).contains("Text(action.title)"))
        for action in StoryCanvasContextAction.allCases {
            XCTAssertFalse(action.title.isEmpty, "\(action)")
        }
    }
}
