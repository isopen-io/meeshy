import XCTest
import UIKit
@testable import MeeshyUI

/// **Toucher le texte qu'on écrit lève le clavier** (#5099).
///
/// > Directive porteur 2026-09-04 : « Il faut rendre coherent le fait de toucher
/// > le placeholder d'avoir le clavier qui s'affiche ! »
///
/// Le canvas monte le champ de saisie en SOUS-VUE et pose ses reconnaisseurs sur
/// lui-même. `cancelsTouchesInView` valant `true` par défaut, le tap reconnu par
/// le canvas ANNULAIT celui du `UITextView` — qui ne devenait donc jamais
/// premier répondeur au doigt.
///
/// Le défaut se lisait comme une décision d'ÉCRAN (l'hôte plein écran gardait
/// `id != objectId`) alors que la cause était une couche plus bas, et valait
/// pour tous les hôtes du canvas.
final class StoryCanvasInlineEditTouchPolicyTests: XCTestCase {

    /// Aucune édition en cours : rien n'est disputé, tout revient au canvas.
    /// C'est le cas le plus fréquent, et la règle ne doit rien y coûter.
    func test_sansChampMonte_leCanvasRecoitTout() {
        let vue = UIView()
        XCTAssertTrue(
            StoryCanvasInlineEditTouchPolicy.canvasReceives(touched: vue, inlineEditor: nil))
    }

    /// La touche posée sur le champ LUI-MÊME lui revient.
    func test_surLeChamp_leCanvasSEfface() {
        let champ = UIView()
        XCTAssertFalse(
            StoryCanvasInlineEditTouchPolicy.canvasReceives(touched: champ, inlineEditor: champ))
    }

    /// **Le témoin qui empêche la règle de naître MORTE.**
    ///
    /// `touch.view` n'est presque jamais le `UITextView` : UIKit rend la sous-vue
    /// interne qui porte le texte, la sélection ou le curseur. Une règle écrite
    /// avec `===` passerait les deux témoins précédents, serait verte, et
    /// laisserait le cas NOMINAL exactement aussi cassé qu'avant.
    func test_surUnDescendantDuChamp_leCanvasSEfface() {
        let champ = UIView()
        let interne = UIView()
        champ.addSubview(interne)
        let profond = UIView()
        interne.addSubview(profond)

        XCTAssertFalse(
            StoryCanvasInlineEditTouchPolicy.canvasReceives(touched: interne, inlineEditor: champ),
            "la sous-vue interne du champ appartient au champ")
        XCTAssertFalse(
            StoryCanvasInlineEditTouchPolicy.canvasReceives(touched: profond, inlineEditor: champ),
            "la descendance vaut à toute profondeur, pas au premier niveau")
    }

    /// **Aucun geste n'est retiré.** Désigner un AUTRE objet pendant qu'on écrit
    /// reste possible — c'est ce que l'éditeur plein écran offre par son plan 2D
    /// comme par sa scène, et une règle trop large le lui aurait pris.
    func test_ailleursQueSurLeChamp_leCanvasRecoit() {
        let champ = UIView()
        let autre = UIView()
        let hote = UIView()
        hote.addSubview(champ)
        hote.addSubview(autre)

        XCTAssertTrue(
            StoryCanvasInlineEditTouchPolicy.canvasReceives(touched: autre, inlineEditor: champ))
        XCTAssertTrue(
            StoryCanvasInlineEditTouchPolicy.canvasReceives(touched: hote, inlineEditor: champ),
            "l'ANCÊTRE du champ n'est pas son descendant — le canvas garde ses touches")
    }

    /// `UITouch.view` est optionnel : une touche sans vue ne peut pas appartenir
    /// au champ, donc elle revient au canvas. Sans ce cas, la règle rendrait un
    /// `nil` non gardé au premier geste multi-touches interrompu.
    func test_uneToucheSansVue_revientAuCanvas() {
        XCTAssertTrue(
            StoryCanvasInlineEditTouchPolicy.canvasReceives(touched: nil, inlineEditor: UIView()))
    }
}
