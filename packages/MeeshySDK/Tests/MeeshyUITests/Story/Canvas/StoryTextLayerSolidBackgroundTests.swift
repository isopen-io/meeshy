import XCTest
import QuartzCore
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Régression 2026-06-01 (« Le texte effacé dans le fond noir ne rend pas le
/// texte lisible ») : un fond de texte SOLIDE était posé en SOUS-CALQUE du
/// `CATextLayer`. Or un sous-calque composite TOUJOURS au-dessus du contenu
/// propre de la calque parente (ses glyphes) — `zPosition < 0` n'ordonne que
/// les sous-calques entre eux, il ne pousse PAS un sous-calque derrière le
/// contenu du parent. Résultat : le rectangle de fond masquait totalement le
/// texte dans le rendu canvas committé (boîte noire vide), alors que l'éditeur
/// en place (vue séparée au-dessus) montrait le texte — d'où l'illusion de
/// « texte effacé ». Le composite miniature (`StorySlideRenderer`) utilisait
/// déjà l'attribut `.backgroundColor` (derrière les glyphes) → incohérence.
///
/// Le fond solide doit donc être posé sur le `backgroundColor` de la calque
/// elle-même (rendu DERRIÈRE les glyphes), pas en sous-calque opaque.
@MainActor
final class StoryTextLayerSolidBackgroundTests: XCTestCase {

    private func makeSolidLayer() -> StoryTextLayer {
        let text = StoryTextObject(id: "s1", text: "Bonjour",
                                   x: 0.5, y: 0.5,
                                   textColor: "FFFFFF",
                                   textBg: "000000")
        let layer = StoryTextLayer()
        layer.configure(with: text,
                        geometry: CanvasGeometry(renderSize: CGSize(width: 390, height: 693)),
                        mode: .edit)
        return layer
    }

    func test_solidBackground_isLayerBackgroundColor_notCoveringSublayer() {
        let layer = makeSolidLayer()

        XCTAssertNotNil(layer.backgroundColor,
                        "le fond solide doit être posé sur backgroundColor de la calque")

        let hasOpaqueFillSublayer = (layer.sublayers ?? []).contains { sub in
            !(sub is StoryGlassBackdropLayer) && sub.backgroundColor != nil
        }
        XCTAssertFalse(hasOpaqueFillSublayer,
                       "le fond solide ne doit PAS être un sous-calque qui masque les glyphes")
    }

    func test_solidBackground_keepsGlyphsOnLayerString() {
        let layer = makeSolidLayer()
        let displayed = (layer.string as? NSAttributedString)?.string
        XCTAssertEqual(displayed, "Bonjour",
                       "les glyphes restent rendus par la calque elle-même, AU-DESSUS du fond")
    }

    func test_solidBackground_hasRoundedCorners() {
        let layer = makeSolidLayer()
        XCTAssertGreaterThan(layer.cornerRadius, 0,
                             "le fond solide garde des coins arrondis (parité visuelle avec l'ancien sous-calque)")
    }

    func test_noBackground_hasNoLayerBackgroundColor() {
        let text = StoryTextObject(id: "n1", text: "Salut",
                                   x: 0.5, y: 0.5, textColor: "FFFFFF")
        let layer = StoryTextLayer()
        layer.configure(with: text,
                        geometry: CanvasGeometry(renderSize: CGSize(width: 390, height: 693)),
                        mode: .edit)
        XCTAssertNil(layer.backgroundColor,
                     "sans fond, aucune couleur de fond ne doit être posée")
    }

    /// Le fond glass reste un SOUS-CALQUE (il fait du blur GPU, ne peut pas être
    /// un simple backgroundColor) — la correction solide ne doit pas le casser.
    func test_glassBackground_remainsSublayer() {
        let text = StoryTextObject(id: "g1", text: "GLASS",
                                   x: 0.5, y: 0.5,
                                   backgroundStyle: .glass(radius: 24))
        let layer = StoryTextLayer()
        layer.configure(with: text,
                        geometry: CanvasGeometry(renderSize: CGSize(width: 390, height: 693)),
                        mode: .edit)
        XCTAssertTrue(layer.sublayers?.contains { $0 is StoryGlassBackdropLayer } ?? false,
                      "le fond glass reste un sous-calque")
        XCTAssertNil(layer.backgroundColor,
                     "le glass ne pose pas de backgroundColor solide")
    }
}
