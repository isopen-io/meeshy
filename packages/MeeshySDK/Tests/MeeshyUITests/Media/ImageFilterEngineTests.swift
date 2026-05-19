import XCTest
import UIKit
@testable import MeeshyUI

/// Unit tests for `ImageFilterEngine` — the stateless render pipeline.
final class ImageFilterEngineTests: XCTestCase {

    /// Builds a flat-colour test image at `scale = 1`, so `size` equals the
    /// pixel dimensions and assertions stay simple.
    private func makeImage(width: CGFloat, height: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)
        return renderer.image { ctx in
            UIColor.systemTeal.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    func test_downscaled_largeImage_fitsWithinMaxPixel() {
        let engine = ImageFilterEngine()
        let large = makeImage(width: 4000, height: 3000)
        let result = engine.downscaled(large, maxPixel: 500)
        let resolved = try? XCTUnwrap(result)
        let longest = max(resolved?.size.width ?? 0, resolved?.size.height ?? 0)
        XCTAssertLessThanOrEqual(longest, 501)
        XCTAssertGreaterThan(longest, 400)
    }

    func test_downscaled_smallImage_isReturnedUntouched() {
        let engine = ImageFilterEngine()
        let small = makeImage(width: 100, height: 80)
        let result = engine.downscaled(small, maxPixel: 500)
        XCTAssertEqual(result?.size, CGSize(width: 100, height: 80))
    }

    func test_renderIdentity_producesImageOfSameSize() {
        let engine = ImageFilterEngine()
        let source = makeImage(width: 200, height: 120)
        let result = engine.render(source, state: .identity)
        XCTAssertEqual(result.size.width, 200, accuracy: 2)
        XCTAssertEqual(result.size.height, 120, accuracy: 2)
        XCTAssertNotNil(result.cgImage)
    }

    func test_renderGeometryOnly_quarterTurn_swapsWidthAndHeight() {
        let engine = ImageFilterEngine()
        let source = makeImage(width: 200, height: 100)
        var state = ImageEditState.identity
        state.orientationTurns = 1
        let result = engine.renderGeometryOnly(source, state: state, applyCrop: false)
        XCTAssertEqual(result.size.width, 100, accuracy: 2)
        XCTAssertEqual(result.size.height, 200, accuracy: 2)
    }

    func test_render_withCrop_producesSmallerImage() {
        let engine = ImageFilterEngine()
        let source = makeImage(width: 200, height: 200)
        var state = ImageEditState.identity
        state.cropNormalized = CGRect(x: 0.25, y: 0.25, width: 0.5, height: 0.5)
        let result = engine.render(source, state: state)
        XCTAssertEqual(result.size.width, 100, accuracy: 2)
        XCTAssertEqual(result.size.height, 100, accuracy: 2)
    }

    func test_render_withFilterAndAdjustments_keepsDimensions() {
        let engine = ImageFilterEngine()
        let source = makeImage(width: 160, height: 160)
        var state = ImageEditState.identity
        state.filter = .dramatic
        state.adjustments.contrast = 1.3
        state.adjustments.exposure = 0.5
        state.effect = .grain
        let result = engine.render(source, state: state)
        XCTAssertEqual(result.size.width, 160, accuracy: 2)
        XCTAssertEqual(result.size.height, 160, accuracy: 2)
        XCTAssertNotNil(result.cgImage)
    }

    func test_filterThumbnails_returnsOneEntryPerFilter() {
        let engine = ImageFilterEngine()
        let source = makeImage(width: 300, height: 300)
        let thumbnails = engine.filterThumbnails(for: source, maxPixel: 120)
        XCTAssertEqual(Set(thumbnails.keys), Set(ImageFilter.allCases))
        for (_, thumb) in thumbnails {
            XCTAssertLessThanOrEqual(max(thumb.size.width, thumb.size.height), 121)
        }
    }
}
