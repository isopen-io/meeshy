import XCTest
import QuartzCore
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Régression 2026-06-01 (suite de `104ff0387`, cas FOND VERRE / glass).
///
/// Un `CATextLayer` compose son `string` dans son PROPRE contenu, lequel passe
/// SOUS tout sous-calque (`zPosition` n'ordonne que les sous-calques entre eux,
/// il ne pousse PAS un sous-calque derrière le contenu du parent). Le backdrop
/// glass étant un sous-calque, il se composait AU-DESSUS des glyphes → hors
/// édition (canvas committé + reader) le texte blanc passait sous la boîte
/// givrée sombre = « blanc sur black ». En édition, l'éditeur inline (une
/// `UIView` au-dessus de TOUS les CALayer) peignait les glyphes par-dessus →
/// contraste ok. D'où la divergence édition / hors-édition signalée par l'user.
///
/// Le correctif (reporté par `104ff0387` pour le seul cas glass) : peindre les
/// glyphes visibles dans une SOUS-CALQUE posée APRÈS le backdrop (donc au-dessus
/// de lui) et rendre les glyphes propres du parent transparents pour qu'ils ne
/// peignent pas une 2e fois sous le verre.
@MainActor
final class StoryTextLayerGlassZOrderTests: XCTestCase {

    private func makeGlassLayer() -> StoryTextLayer {
        let text = StoryTextObject(id: "g1", text: "Bonjour",
                                   x: 0.5, y: 0.5,
                                   textColor: "FFFFFF",
                                   backgroundStyle: .glass(radius: 24))
        let layer = StoryTextLayer()
        layer.configure(with: text,
                        geometry: CanvasGeometry(renderSize: CGSize(width: 390, height: 693)),
                        mode: .play)
        return layer
    }

    /// Lit l'alpha de la couleur de premier plan du premier glyphe d'un
    /// `CATextLayer` (que la couleur soit stockée en `CGColor` ou `UIColor`).
    /// Retourne `-1` si indéterminable.
    private func foregroundAlpha(of layer: CATextLayer?) -> CGFloat {
        guard let attr = layer?.string as? NSAttributedString, attr.length > 0,
              let value = attr.attribute(.foregroundColor, at: 0, effectiveRange: nil)
        else { return -1 }
        if let ui = value as? UIColor {
            var a: CGFloat = 0
            ui.getWhite(nil, alpha: &a)
            return a
        }
        // `.foregroundColor` est stocké en `CGColor` (cf. `configure` :
        // `color.cgColor`). `as? CGColor` déclenche un warning « always succeeds »
        // (type CoreFoundation) traité en erreur — on teste donc le CFTypeID.
        let cf = value as CFTypeRef
        if CFGetTypeID(cf) == CGColor.typeID {
            return (cf as! CGColor).alpha
        }
        return -1
    }

    /// La sous-calque de glyphes (un `CATextLayer` portant le texte) doit exister
    /// et être composée APRÈS le backdrop glass (index supérieur ⇒ au-dessus).
    func test_glassBackground_glyphsRenderAboveBackdrop() {
        let layer = makeGlassLayer()
        let subs = layer.sublayers ?? []

        guard let backdropIndex = subs.firstIndex(where: { $0 is StoryGlassBackdropLayer }) else {
            return XCTFail("le backdrop glass doit rester un sous-calque")
        }
        guard let glyphIndex = subs.lastIndex(where: {
            !($0 is StoryGlassBackdropLayer) && ($0 as? CATextLayer)?.string != nil
        }) else {
            return XCTFail("les glyphes visibles doivent vivre dans une sous-calque CATextLayer")
        }
        XCTAssertGreaterThan(glyphIndex, backdropIndex,
                             "la sous-calque de glyphes doit être AU-DESSUS du backdrop glass")
    }

    /// La sous-calque de glyphes porte le texte avec une couleur VISIBLE (non
    /// transparente) — c'est ce que l'utilisateur lit par-dessus le verre.
    func test_glassBackground_glyphSublayerHasVisibleText() {
        let layer = makeGlassLayer()
        let glyph = (layer.sublayers ?? [])
            .first { !($0 is StoryGlassBackdropLayer) && $0 is CATextLayer } as? CATextLayer
        XCTAssertEqual((glyph?.string as? NSAttributedString)?.string, "Bonjour",
                       "la sous-calque de glyphes porte le texte")
        XCTAssertGreaterThan(foregroundAlpha(of: glyph), 0,
                             "les glyphes au-dessus du verre sont visibles (non transparents)")
    }

    /// Les glyphes propres du parent restent transparents : ils peindraient
    /// sinon sous le backdrop (le bug d'origine). Le contenu texte est conservé.
    func test_glassBackground_parentGlyphsAreSuppressed() {
        let layer = makeGlassLayer()
        let parent = layer.string as? NSAttributedString
        XCTAssertEqual(parent?.string, "Bonjour", "le contenu texte du parent est préservé")
        XCTAssertEqual(foregroundAlpha(of: layer), 0, accuracy: 0.001,
                       "les glyphes du parent sont transparents (ils peindraient sinon SOUS le verre)")
    }

    /// `setGlyphsHidden` (édition inline) bascule la sous-calque de glyphes, pas
    /// le parent (déjà transparent) — l'éditeur inline reprend la main au-dessus.
    func test_glassBackground_setGlyphsHidden_togglesGlyphSublayer() {
        let layer = makeGlassLayer()
        let glyph = (layer.sublayers ?? [])
            .first { !($0 is StoryGlassBackdropLayer) && $0 is CATextLayer } as? CATextLayer
        XCTAssertNotNil(glyph)

        XCTAssertGreaterThan(foregroundAlpha(of: glyph), 0, "glyphes visibles au départ")

        layer.setGlyphsHidden(true)
        XCTAssertEqual(foregroundAlpha(of: glyph), 0, accuracy: 0.001,
                       "glyphes masqués pendant l'édition inline")

        layer.setGlyphsHidden(false)
        XCTAssertGreaterThan(foregroundAlpha(of: glyph), 0, "glyphes restaurés en fin d'édition")
    }

    /// Le backdrop glass reste un sous-calque (blur GPU) et aucun
    /// `backgroundColor` solide n'est posé sur le parent — la correction glass
    /// ne doit pas régresser l'invariant vérifié par le cas solide.
    func test_glassBackground_keepsBackdropSublayer_andNoSolidFill() {
        let layer = makeGlassLayer()
        XCTAssertTrue((layer.sublayers ?? []).contains { $0 is StoryGlassBackdropLayer },
                      "le fond glass reste un sous-calque")
        XCTAssertNil(layer.backgroundColor, "le glass ne pose pas de backgroundColor solide")
    }
}
