import XCTest
import UIKit
import CoreText
@testable import MeeshyUI
@testable import MeeshySDK

/// Repro user 2026-07-11 : « La timeline vit » (style classic = system serif,
/// textAlign center, fontSize 96 — les défauts du composer) rendait « vi1 » —
/// le dernier glyphe rogné à droite. Cause : la mesure TextKit
/// (`boundingRect`) retourne la largeur TYPOGRAPHIQUE ; l'ENCRE des glyphes
/// serif (terminaison du « t ») déborde de l'avance et dépassait la marge de
/// 8 px design — CATextLayer clippe à ses bounds. La largeur du layer doit
/// couvrir l'encre CoreText, pas seulement l'avance typographique.
@MainActor
final class StoryTextLayerInkClippingTests: XCTestCase {

    private func composerDefaultText(_ string: String) -> StoryTextObject {
        StoryTextObject(
            text: string,
            x: 0.5, y: 0.5,
            scale: 1.0,
            rotation: 0,
            fontSize: 96,
            textStyle: "classic",
            textColor: "FFFFFF",
            textAlign: "center"
        )
    }

    /// Rend le layer dans un bitmap à ses propres bounds et retourne les
    /// index de colonnes contenant de l'encre (alpha > 0).
    private func inkColumns(of layer: StoryTextLayer) throws -> (first: Int, last: Int, width: Int) {
        let size = layer.bounds.size
        let width = Int(ceil(size.width)), height = Int(ceil(size.height))
        XCTAssertGreaterThan(width, 0); XCTAssertGreaterThan(height, 0)
        var pixels = [UInt8](repeating: 0, count: width * height)
        let ctx = try XCTUnwrap(CGContext(
            data: &pixels, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: width,
            space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGImageAlphaInfo.alphaOnly.rawValue))
        layer.render(in: ctx)
        var first = Int.max, last = -1
        for x in 0..<width {
            var hasInk = false
            for y in 0..<height where pixels[y * width + x] > 8 {
                hasInk = true; break
            }
            if hasInk {
                first = min(first, x)
                last = max(last, x)
            }
        }
        XCTAssertGreaterThanOrEqual(last, 0, "le rendu doit contenir de l'encre")
        return (first, last, width)
    }

    func test_configure_serifCenteredText_lastGlyphInkNotClippedAtTrailingEdge() throws {
        let layer = StoryTextLayer()
        let geometry = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))

        layer.configure(with: composerDefaultText("La timeline vit"),
                        geometry: geometry, mode: .play)
        let ink = try inkColumns(of: layer)

        XCTAssertLessThan(ink.last, ink.width - 2,
            "De l'encre touche le bord droit du layer (colonne \(ink.last)/\(ink.width)) — le dernier glyphe est rogné")
    }

    func test_configure_serifCenteredText_leadingInkNotClipped() throws {
        let layer = StoryTextLayer()
        let geometry = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))

        layer.configure(with: composerDefaultText("La timeline vit"),
                        geometry: geometry, mode: .play)
        let ink = try inkColumns(of: layer)

        XCTAssertGreaterThan(ink.first, 1,
            "De l'encre touche le bord gauche du layer — glyphe de tête rogné")
    }

    func test_configure_italicishTrailingGlyphs_neverTouchTrailingEdge() throws {
        for text in ["fff", "Wf", "La timeline vit!", "type"] {
            let layer = StoryTextLayer()
            let geometry = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
            layer.configure(with: composerDefaultText(text),
                            geometry: geometry, mode: .play)
            let ink = try inkColumns(of: layer)
            XCTAssertLessThan(ink.last, ink.width - 2,
                "« \(text) » : encre au bord droit — glyphe final rogné")
        }
    }

    // MARK: - Panne 2 (2026-08) : la réserve d'encre ne doit pas re-wrapper le texte

    /// `inkPad` (la réserve pour l'encre qui déborde de l'avance typographique
    /// — cf. tests ci-dessus) ne doit JAMAIS être injecté dans la largeur de
    /// WRAP de `CATextLayer` lui-même : sinon CoreText remplit cette réserve
    /// de VRAIS glyphes au lieu de la laisser vide en marge, et peut
    /// re-wrapper le texte DIFFÉREMMENT de la mesure (`designSize`/
    /// `renderedNeed`, qui ignorent `inkPad`) — débordant alors du `bounds`
    /// finalement calculé. Repro : `textStyle: "curve"` (SavoyeLetPlain,
    /// `inkPad` ≈ 5 design px) et `"calligraphy"` (Zapfino, `inkPad` ≈ 86
    /// design px) sont les deux seuls styles où `inkPad` est assez grand pour
    /// changer le nombre de lignes du re-wrap — jusqu'à 28pt hors-bounds à
    /// gauche mesurés pour Zapfino.
    func test_configure_curveAndCalligraphyStyles_paintedInkNeverExceedsBounds() throws {
        for style in [StoryTextStyle.curve, .calligraphy] {
            var text = composerDefaultText(
                "Un texte assez long pour forcer plusieurs retours a la ligne "
                + "et exposer tout ecart entre la largeur de mesure et la largeur de pose")
            text.textStyle = style.rawValue

            let layer = StoryTextLayer()
            let geometry = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
            layer.configure(with: text, geometry: geometry, mode: .play)
            let ink = try inkColumns(of: layer)

            XCTAssertGreaterThan(ink.first, 1,
                "\(style.rawValue) : de l'encre touche le bord gauche du calque "
                + "(colonne \(ink.first)) — la réserve d'encre a été consommée par un "
                + "re-wrap et déborde des bounds")
            XCTAssertLessThan(ink.last, ink.width - 2,
                "\(style.rawValue) : de l'encre touche le bord droit du calque "
                + "(colonne \(ink.last)/\(ink.width)) — la réserve d'encre a été "
                + "consommée par un re-wrap et déborde des bounds")
        }
    }
}
