import XCTest
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// Régression : un texte long doit **passer à la ligne** dans la largeur du
/// canvas, pas déborder ni être tronqué avec « … ». `configure` mesurait le
/// texte en mono-ligne (`NSAttributedString.size()`), produisant des largeurs
/// hors-canvas.
@MainActor
final class StoryTextLayerWrappingTests: XCTestCase {

    private let geometry = CanvasGeometry(renderSize: CGSize(width: 390, height: 693))

    private func configured(_ text: String) -> StoryTextLayer {
        let obj = StoryTextObject(id: "t", text: text)
        let layer = StoryTextLayer()
        layer.configure(with: obj, geometry: geometry, mode: .edit)
        return layer
    }

    func test_configure_longText_wrapsWithinCanvasWidth() {
        let short = configured("Court")
        let long = configured("Un message vraiment tres long qui doit absolument "
            + "passer a la ligne sur plusieurs lignes du canvas au lieu de "
            + "deborder largement ou d'etre tronque avec des points de suspension")

        // Le texte long reste dans la largeur du canvas (il wrappe).
        XCTAssertLessThanOrEqual(long.bounds.width, geometry.renderSize.width)
        // Et il est nettement plus haut que le texte court — plusieurs lignes.
        XCTAssertGreaterThan(long.bounds.height, short.bounds.height * 2)
    }

    func test_configure_neverTruncates() {
        let long = configured("Un message long qui doit passer a la ligne proprement")
        XCTAssertEqual(long.truncationMode, .none,
                       "le texte ne doit jamais être tronqué avec « … »")
    }
}
