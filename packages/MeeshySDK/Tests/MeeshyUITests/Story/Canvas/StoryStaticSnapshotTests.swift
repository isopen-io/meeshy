import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryStaticSnapshotTests: XCTestCase {

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

    func test_render_returnsImageOfRequestedSize() throws {
        let slide = StorySlide(effects: StoryEffects(background: "1E1B4B"))
        let size = CGSize(width: 270, height: 480)

        let snapshot = try XCTUnwrap(StoryStaticSnapshot.render(slide: slide, loadedImages: [:], size: size))

        XCTAssertEqual(snapshot.size, size)
    }

    /// The critical property that makes a ONE-SHOT static render safe: `StoryRenderer`'s
    /// generic `imageCache` populates layer `contents` via an async `Task` (fine for a
    /// long-lived live canvas), which would race a single `layer.render(in:)` call right
    /// after `render()` returns. `ComposerImageCacheReader` is special-cased by
    /// `StoryBackgroundLayer`/`StoryMediaLayer` for a SYNCHRONOUS prime — this test proves
    /// `StoryStaticSnapshot` actually gets that synchronous path (background image present
    /// on the very first render, not a race-dependent blank frame).
    func test_render_backgroundImageIsBakedSynchronously_noAsyncRace() throws {
        let bgMedia = StoryMediaObject(id: "bg1", mediaType: "image", aspectRatio: 1.0, isBackground: true)
        let effects = StoryEffects(background: "0000FF", mediaObjects: [bgMedia]) // blue bg colour
        let slide = StorySlide(effects: effects)

        let snapshot = try XCTUnwrap(StoryStaticSnapshot.render(
            slide: slide, loadedImages: ["bg1": solidImage(.red)], size: CGSize(width: 100, height: 178)))

        let corner = try XCTUnwrap(pixel(snapshot, at: CGPoint(x: 3, y: 3)))
        XCTAssertGreaterThan(corner.r, 150, "background image must be baked synchronously into the snapshot")
        XCTAssertLessThan(corner.b, 110, "corner must not be the blue background colour placeholder")
    }
}
