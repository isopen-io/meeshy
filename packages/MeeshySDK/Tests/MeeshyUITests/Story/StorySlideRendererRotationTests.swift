import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Le composite cover/thumbHash (`StorySlideRenderer.renderComposite`) doit refléter la
/// ROTATION des overlays — comme le canvas, où `StoryTextLayer` / `StoryMediaLayer` /
/// `StoryStickerLayer` appliquent `CATransform3DMakeRotation(rotation°→rad)`. L'utilisateur
/// pivote ces éléments via `UIRotationGestureRecognizer` (StoryCanvasUIView → updateRotation).
/// Avant le fix, `drawTextObject`/`drawMediaObject`/`drawSticker` ignoraient `rotation` → un
/// overlay pivoté apparaissait DROIT dans la vignette de la tray (≠ ce que l'auteur a composé).
@MainActor
final class StorySlideRendererRotationTests: XCTestCase {

    private let size = CGSize(width: 200, height: 356)

    private func renderText(rotation: Double) throws -> Data {
        var effects = StoryEffects()
        effects.background = "000000"
        effects.textObjects = [
            StoryTextObject(text: "WIDE", x: 0.5, y: 0.5, rotation: rotation, fontSize: 300, textBg: "FF0000")
        ]
        let img = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: StorySlide(id: "s", effects: effects), bgImage: nil, loadedImages: [:], size: size))
        return try XCTUnwrap(img.pngData())
    }

    func test_renderComposite_appliesTextRotation() throws {
        let flat = try renderText(rotation: 0)
        let rotated = try renderText(rotation: 90)
        XCTAssertNotEqual(flat, rotated,
            "une rotation de texte doit changer le composite (parité canvas StoryTextLayer)")
    }

    func test_renderComposite_rotationIsDeterministic() throws {
        // Garde-fou : deux rendus identiques sont byte-égaux — sinon l'assertion
        // d'inégalité ci-dessus ne prouverait rien (faux positif de non-déterminisme).
        XCTAssertEqual(try renderText(rotation: 45), try renderText(rotation: 45))
    }

    private func renderSticker(rotation: Double) throws -> Data {
        var effects = StoryEffects()
        effects.background = "000000"
        effects.stickerObjects = [StorySticker(emoji: "🔺", x: 0.5, y: 0.5, scale: 3, rotation: rotation)]
        let img = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: StorySlide(id: "s", effects: effects), bgImage: nil, loadedImages: [:], size: size))
        return try XCTUnwrap(img.pngData())
    }

    func test_renderComposite_appliesStickerRotation() throws {
        let flat = try renderSticker(rotation: 0)
        let rotated = try renderSticker(rotation: 90)
        XCTAssertNotEqual(flat, rotated,
            "une rotation de sticker doit changer le composite (parité canvas StoryStickerLayer)")
    }
}
