import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// WS1 — rendering PARITY pins for `StorySlideRenderer.renderComposite`.
///
/// The pre-existing renderer suites use SQUARE source images and NotEqual
/// assertions, which pass under BOTH the old stretch+0.6×width math and the new
/// `baseMediaDesignSize`-driven aspect-fill geometry — i.e. a regression back to
/// the squishing bug would keep CI green. These tests probe ACTUAL drawn-pixel
/// geometry so the proportions are nailed down:
///   1. a non-square foreground media draws into a box whose ratio matches
///      `StoryMediaLayer.baseMediaDesignSize(aspectRatio:) × projection`;
///   2. an asymmetric (wide) background media fills 9:16 via aspect-FILL crop,
///      NOT a stretch;
///   3. the 2px white foreground border is present at/above the 24pt threshold
///      and absent below it.
@MainActor
final class StorySlideRendererProportionTests: XCTestCase {

    // MARK: - Pixel helpers (mirror StorySlideRendererBackgroundMediaTests)

    private func solidImage(_ color: UIColor, size: CGSize = CGSize(width: 80, height: 80)) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill(); ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    /// Wide source: a vertical band of `bandColor` on the far left, `fill`
    /// everywhere else. Used to distinguish aspect-fill crop (band cropped off)
    /// from a stretch (band visible at the left edge).
    private func leftBandImage(band: UIColor, fill: UIColor,
                               size: CGSize, bandWidth: CGFloat) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            fill.setFill(); ctx.fill(CGRect(origin: .zero, size: size))
            band.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: bandWidth, height: size.height))
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

    private func isRed(_ c: (r: Int, g: Int, b: Int)) -> Bool { c.r > 150 && c.b < 110 }
    private func isBlue(_ c: (r: Int, g: Int, b: Int)) -> Bool { c.b > 150 && c.r < 110 }
    private func isWhite(_ c: (r: Int, g: Int, b: Int)) -> Bool { c.r > 180 && c.g > 180 && c.b > 180 }

    // MARK: - (1) Foreground media box matches baseMediaDesignSize (no squish)

    func test_renderComposite_foregroundBoxMatchesBaseMediaDesignSize_portrait() throws {
        let size = CGSize(width: 540, height: 960)
        // Portrait foreground (0.5) over a blue solid background.
        let fg = StoryMediaObject(id: "fg", kind: .image, aspectRatio: 0.5,
                                  x: 0.5, y: 0.5, scale: 1.0, isBackground: false)
        let effects = StoryEffects(background: "0000FF", mediaObjects: [fg])
        let slide = StorySlide(effects: effects)

        let composite = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: slide, bgImage: nil, loadedImages: ["fg": solidImage(.red)], size: size
        ))
        let cg = try XCTUnwrap(composite.cgImage)
        let sx = CGFloat(cg.width) / size.width
        let sy = CGFloat(cg.height) / size.height

        // Expected box from the SINGLE source of truth — no duplicated constant.
        let designBox = StoryMediaLayer.baseMediaDesignSize(aspectRatio: 0.5)
        let projection = size.width / CanvasGeometry.designWidth
        let boxW = designBox.width * projection
        let boxH = designBox.height * projection
        XCTAssertGreaterThan(boxH, boxW, "0.5 aspect must yield a PORTRAIT box (taller than wide)")

        let cx = size.width * 0.5, cy = size.height * 0.5
        let top = cy - boxH / 2, bottom = cy + boxH / 2
        let left = cx - boxW / 2, right = cx + boxW / 2

        func at(_ px: CGFloat, _ py: CGFloat) throws -> (r: Int, g: Int, b: Int) {
            try XCTUnwrap(pixel(composite, at: CGPoint(x: px * sx, y: py * sy)))
        }

        // Centre is the media.
        XCTAssertTrue(isRed(try at(cx, cy)), "centre must be the foreground media")
        // Inside each computed edge → media; just outside → bg colour. An 8pt
        // margin clears the 2px border. A regression to the old 0.6×width SQUARE
        // box would put a different colour at these portrait-specific points.
        XCTAssertTrue(isRed(try at(cx, top + 8)), "inside top edge is media")
        XCTAssertTrue(isBlue(try at(cx, top - 8)), "above the box is the bg colour")
        XCTAssertTrue(isRed(try at(cx, bottom - 8)), "inside bottom edge is media")
        XCTAssertTrue(isRed(try at(left + 8, cy)), "inside left edge is media")
        XCTAssertTrue(isBlue(try at(left - 8, cy)), "left of the box is the bg colour")
        XCTAssertTrue(isBlue(try at(right + 8, cy)), "right of the box is the bg colour")
    }

    // MARK: - (2) Background media is aspect-FILL cropped, not stretched

    func test_renderComposite_backgroundMediaIsAspectFillCropped_notStretched() throws {
        let size = CGSize(width: 200, height: 356) // ~9:16
        let bg = StoryMediaObject(id: "bg", kind: .image, aspectRatio: 3.0, isBackground: true)
        let effects = StoryEffects(background: "00FF00", mediaObjects: [bg])
        let slide = StorySlide(effects: effects)

        // Wide source (3:1): far-left blue band, red elsewhere. Aspect-fill into
        // a tall rect crops the SIDES → the band is cropped off and the visible
        // left edge is RED. A stretch would squish the whole source in, leaving
        // the left edge BLUE.
        let wide = leftBandImage(band: .blue, fill: .red,
                                 size: CGSize(width: 300, height: 100), bandWidth: 30)

        let composite = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: slide, bgImage: nil, loadedImages: ["bg": wide], size: size
        ))
        let cg = try XCTUnwrap(composite.cgImage)
        let sx = CGFloat(cg.width) / size.width
        let sy = CGFloat(cg.height) / size.height

        func at(_ px: CGFloat, _ py: CGFloat) throws -> (r: Int, g: Int, b: Int) {
            try XCTUnwrap(pixel(composite, at: CGPoint(x: px * sx, y: py * sy)))
        }

        XCTAssertTrue(isRed(try at(2, size.height / 2)),
                      "aspect-fill crops the side band → left edge is RED (a stretch would show BLUE)")
        XCTAssertTrue(isRed(try at(size.width / 2, size.height / 2)),
                      "centre is the red fill")
    }

    // MARK: - (3) 2px white border present >= 24pt, absent below

    func test_renderComposite_foregroundBorderPresentAtThreshold() throws {
        let size = CGSize(width: 300, height: 534)
        // Square foreground, full scale → box well above 24pt → border drawn.
        let fg = StoryMediaObject(id: "fg", kind: .image, aspectRatio: 1.0,
                                  x: 0.5, y: 0.5, scale: 1.0, isBackground: false)
        let slide = StorySlide(effects: StoryEffects(background: "0000FF", mediaObjects: [fg]))

        let composite = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: slide, bgImage: nil, loadedImages: ["fg": solidImage(.red)], size: size
        ))

        let designBox = StoryMediaLayer.baseMediaDesignSize(aspectRatio: 1.0)
        let boxH = designBox.height * (size.width / CanvasGeometry.designWidth)
        XCTAssertGreaterThanOrEqual(boxH, 24, "precondition: box >= 24pt so the border is drawn")
        let top = size.height * 0.5 - boxH / 2

        XCTAssertTrue(
            hasWhitePixelAlongColumn(composite, xPoint: size.width * 0.5,
                                     yPoints: stride(from: top - 5, through: top + 5, by: 0.5),
                                     size: size),
            "a 2px white border must be present along the top edge when the box is >= 24pt"
        )
    }

    func test_renderComposite_foregroundBorderAbsentBelowThreshold() throws {
        let size = CGSize(width: 300, height: 534)
        // Tiny scale → box below 24pt → border SKIPPED.
        let fg = StoryMediaObject(id: "fg", kind: .image, aspectRatio: 1.0,
                                  x: 0.5, y: 0.5, scale: 0.1, isBackground: false)
        let slide = StorySlide(effects: StoryEffects(background: "0000FF", mediaObjects: [fg]))

        let composite = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: slide, bgImage: nil, loadedImages: ["fg": solidImage(.red)], size: size
        ))

        let designBox = StoryMediaLayer.baseMediaDesignSize(aspectRatio: 1.0)
        let boxH = designBox.height * 0.1 * (size.width / CanvasGeometry.designWidth)
        XCTAssertLessThan(boxH, 24, "precondition: box < 24pt so the border is skipped")
        let top = size.height * 0.5 - boxH / 2

        // Red box + blue bg → no white anywhere along the (would-be) top edge.
        XCTAssertFalse(
            hasWhitePixelAlongColumn(composite, xPoint: size.width * 0.5,
                                     yPoints: stride(from: top - 5, through: top + 5, by: 0.5),
                                     size: size),
            "no white border may be drawn when the box is below 24pt"
        )
    }

    // MARK: - White-scan helper

    private func hasWhitePixelAlongColumn(_ composite: UIImage, xPoint: CGFloat,
                                          yPoints: StrideThrough<CGFloat>,
                                          size: CGSize) -> Bool {
        guard let cg = composite.cgImage else { return false }
        let sx = CGFloat(cg.width) / size.width
        let sy = CGFloat(cg.height) / size.height
        for y in yPoints {
            if let p = pixel(composite, at: CGPoint(x: xPoint * sx, y: y * sy)), isWhite(p) {
                return true
            }
        }
        return false
    }
}
