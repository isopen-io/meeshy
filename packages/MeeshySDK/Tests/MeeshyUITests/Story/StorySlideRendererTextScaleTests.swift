import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Le composite cover/thumbHash (`StorySlideRenderer.renderComposite`) doit refléter le
/// `scale` de pinch du texte — comme le canvas, où `StoryTextLayer` calcule
/// `designFontSize = fontSize * scale` (ligne 62) et l'utilisateur agrandit/réduit le texte
/// via `UIPinchGestureRecognizer` (StoryCanvasUIView.updateScale → text.scale, 0.3…4.0).
/// Avant le fix, `drawTextObject` n'utilisait que `resolvedSize` (= fontSize, sans scale) →
/// un texte agrandi au doigt apparaissait à sa taille de BASE dans la vignette de la tray.
@MainActor
final class StorySlideRendererTextScaleTests: XCTestCase {

    private let size = CGSize(width: 200, height: 356)

    private func renderText(scale: Double) throws -> Data {
        var effects = StoryEffects()
        effects.background = "000000"
        effects.textObjects = [
            StoryTextObject(text: "A", x: 0.5, y: 0.5, scale: scale, fontSize: 200, textBg: "FF0000")
        ]
        let img = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: StorySlide(id: "s", effects: effects), bgImage: nil, loadedImages: [:], size: size))
        return try XCTUnwrap(img.pngData())
    }

    func test_renderComposite_appliesTextScale() throws {
        let small = try renderText(scale: 1.0)
        let large = try renderText(scale: 3.0)
        XCTAssertNotEqual(small, large,
            "le scale de pinch du texte doit changer la taille rendue dans le composite (parité StoryTextLayer)")
    }

    func test_renderComposite_textScaleIsDeterministic() throws {
        // Garde-fou : deux rendus au même scale sont byte-égaux — sinon l'assertion
        // d'inégalité ci-dessus ne prouverait rien.
        XCTAssertEqual(try renderText(scale: 2.0), try renderText(scale: 2.0))
    }
}
