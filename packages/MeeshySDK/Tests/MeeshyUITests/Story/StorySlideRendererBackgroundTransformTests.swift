import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Le composite cover/thumbHash (`StorySlideRenderer.renderComposite`) doit refléter le
/// transform du FOND (zoom/pan/rotation) comme `SlideMiniPreview` (référence non-ambiguë :
/// `.scaleEffect(scale)` + `.rotationEffect(rotation)` autour du centre, `.position(x·w, y·h)`)
/// et le canvas. Avant le fix it.51, le fond était dessiné full-bleed sans transform → un fond
/// zoomé/pané/pivoté par l'utilisateur apparaissait droit dans la vignette de la tray (it.50).
@MainActor
final class StorySlideRendererBackgroundTransformTests: XCTestCase {

    private let size = CGSize(width: 200, height: 356)

    /// Image asymétrique (haut rouge / bas bleu) pour qu'un zoom/pan/rotation change les pixels.
    private func asymmetricImage() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 90, height: 160)).image { ctx in
            UIColor.red.setFill();  ctx.fill(CGRect(x: 0, y: 0, width: 90, height: 80))
            UIColor.blue.setFill(); ctx.fill(CGRect(x: 0, y: 80, width: 90, height: 80))
        }
    }

    private func render(scale: Double = 1, x: Double = 0.5, y: Double = 0.5, rotation: Double = 0) throws -> Data {
        let bg = StoryMediaObject(id: "bg", aspectRatio: 9.0 / 16.0,
                                  x: x, y: y, scale: scale, rotation: rotation, isBackground: true)
        let effects = StoryEffects(mediaObjects: [bg])
        let img = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: StorySlide(id: "s", effects: effects), bgImage: nil,
            loadedImages: ["bg": asymmetricImage()], size: size))
        return try XCTUnwrap(img.pngData())
    }

    func test_renderComposite_appliesBackgroundZoom() throws {
        XCTAssertNotEqual(try render(scale: 1), try render(scale: 2),
            "le zoom du fond doit changer le composite (parité SlideMiniPreview/canvas)")
    }

    func test_renderComposite_appliesBackgroundPan() throws {
        XCTAssertNotEqual(try render(x: 0.5), try render(x: 0.8),
            "le pan du fond doit changer le composite")
    }

    func test_renderComposite_appliesBackgroundRotation() throws {
        XCTAssertNotEqual(try render(rotation: 0), try render(rotation: 45),
            "la rotation du fond doit changer le composite")
    }

    func test_renderComposite_backgroundTransformIsDeterministic() throws {
        XCTAssertEqual(try render(scale: 1.5, x: 0.6, rotation: 20),
                       try render(scale: 1.5, x: 0.6, rotation: 20))
    }
}
