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

    func test_renderComposite_drawsVideoBackgroundFrameFullBleed() throws {
        // A VIDEO background carries its poster frame in `loadedImages[bgMedia.id]`
        // (the same frame the canvas/mini-preview use). The composite (and thus the
        // thumbHash that becomes the story's preview) MUST stamp it full-bleed so the
        // thumbnail captures the video background — not just bgColour + overlays.
        // Pre-fix `renderComposite` gated the bg-media draw on `kind == .image`, so a
        // video background was dropped and the corner stayed the bg colour.
        let bgVideo = StoryMediaObject(id: "bgvid", mediaType: "video", aspectRatio: 1.0, isBackground: true)
        let effects = StoryEffects(background: "0000FF", mediaObjects: [bgVideo]) // blue bg colour
        let slide = StorySlide(effects: effects)

        let composite = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: slide, bgImage: nil, loadedImages: ["bgvid": solidImage(.red)]
        ))

        let corner = try XCTUnwrap(pixel(composite, at: CGPoint(x: 3, y: 3)))
        XCTAssertGreaterThan(corner.r, 150, "video poster frame must fill the composite (corner R high)")
        XCTAssertLessThan(corner.b, 110, "corner must NOT be the blue background colour")
    }

    func test_renderComposite_drawsForegroundVideoPosterFrame() throws {
        // A FOREGROUND (non-background) video carries its poster in loadedImages[id]
        // — the mini-preview already draws it (no kind filter), but renderComposite
        // gated the foreground loop on `kind == .image`, dropping foreground videos
        // from the composite/thumbHash. "All content of the composer" must include
        // foreground video clips. (A distinct background media is present so the fg
        // video isn't resolved AS the background.)
        let bg = StoryMediaObject(id: "bg", mediaType: "image", aspectRatio: 1.0, isBackground: true)
        let fgVideo = StoryMediaObject(id: "fgvid", mediaType: "video", aspectRatio: 1.0,
                                       x: 0.5, y: 0.5, isBackground: false)
        let effects = StoryEffects(background: "0000FF", mediaObjects: [bg, fgVideo]) // blue bg colour
        let slide = StorySlide(effects: effects)

        // Only the fg video has a poster → bg falls back to the blue colour; the centre
        // must show the red fg-video poster, the corner stays blue.
        let composite = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: slide, bgImage: nil, loadedImages: ["fgvid": solidImage(.red)]
        ))
        guard let cg = composite.cgImage else { return XCTFail("no cgImage") }
        let centre = try XCTUnwrap(pixel(composite, at: CGPoint(x: cg.width / 2, y: cg.height / 2)))
        XCTAssertGreaterThan(centre.r, 150, "foreground video poster must be drawn at its position")
        XCTAssertLessThan(centre.b, 110, "centre must NOT be the blue background colour")
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
