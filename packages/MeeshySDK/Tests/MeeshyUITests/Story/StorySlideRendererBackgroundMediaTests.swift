import XCTest
import UIKit
import MeeshyUI
import MeeshySDK

/// Cohérence du composite ThumbHash avec le rendu réel pour la couche FOND.
/// Une story moderne porte son fond comme `StoryMediaObject(isBackground: true)`
/// (pas comme `bgImage` legacy séparé). `renderComposite` doit dessiner ce fond
/// PLEIN CADRE (comme `StoryBackgroundLayer` / `SlideMiniPreview`) et l'exclure
/// de la couche foreground — sinon le fond est rendu en petite image 0.6× centrée
/// qui (étant dessinée après le texte) occulte le texte dans le placeholder.
@MainActor
final class StorySlideRendererBackgroundMediaTests: XCTestCase {

    private func solidImage(_ color: UIColor, size: CGSize = CGSize(width: 80, height: 80)) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill(); ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    private func pixel(_ image: UIImage, at point: CGPoint) -> (r: Int, g: Int, b: Int)? {
        guard let cg = image.cgImage else { return nil }
        let w = cg.width, h = cg.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let cs = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8,
                                  bytesPerRow: w * 4, space: cs,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let x = min(max(0, Int(point.x)), w - 1)
        let y = min(max(0, Int(point.y)), h - 1)
        let i = (y * w + x) * 4
        return (Int(data[i]), Int(data[i + 1]), Int(data[i + 2]))
    }

    func test_renderComposite_drawsBackgroundMediaFullBleed_notTinyCentered() throws {
        let bgMedia = StoryMediaObject(id: "bg1", mediaType: "image", aspectRatio: 1.0, isBackground: true)
        let effects = StoryEffects(background: "0000FF", mediaObjects: [bgMedia]) // blue bg color
        let slide = StorySlide(effects: effects)

        let composite = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: slide, bgImage: nil, loadedImages: ["bg1": solidImage(.red)]
        ))

        // A CORNER pixel must be the RED background media (full-bleed), NOT the
        // blue bg colour. Pre-fix the bg media was only drawn as a 0.6× centred
        // blob, leaving the corners blue.
        let corner = try XCTUnwrap(pixel(composite, at: CGPoint(x: 3, y: 3)))
        XCTAssertGreaterThan(corner.r, 150, "corner R should be high (bg media fills the frame)")
        XCTAssertLessThan(corner.b, 110, "corner should NOT be the blue background colour")
    }

    func test_renderComposite_noBackgroundMedia_keepsBackgroundColour() throws {
        // Sans média de fond, le composite garde la couleur de fond (pas de régression).
        let effects = StoryEffects(background: "0000FF")
        let slide = StorySlide(effects: effects)

        let composite = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: slide, bgImage: nil, loadedImages: [:]
        ))

        let corner = try XCTUnwrap(pixel(composite, at: CGPoint(x: 3, y: 3)))
        XCTAssertGreaterThan(corner.b, 150, "corner should be the blue bg colour")
        XCTAssertLessThan(corner.r, 110)
    }
}
