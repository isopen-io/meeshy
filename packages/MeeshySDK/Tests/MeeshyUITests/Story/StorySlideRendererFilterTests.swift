import XCTest
import UIKit
import CoreImage
@testable import MeeshyUI
@testable import MeeshySDK

/// The thumbHash composite (`StorySlideRenderer.renderComposite`) must reflect the
/// SAME filter the canvas/viewer renders, so the blur placeholder matches the played
/// story (no colour pop when the real frame replaces the placeholder). Coverage is
/// gated on `StoryFilteredLayer.Kind(storyFilter:)` — the single source of truth for
/// "which filters actually render": vintage/bw render → composite filtered;
/// kernel-less filters (warm/cool/…) don't render → composite left unchanged.
@MainActor
final class StorySlideRendererFilterTests: XCTestCase {

    private func makeSlide(filter: String?, intensity: Double = 1.0) -> StorySlide {
        var effects = StoryEffects()
        effects.background = "0040FF"   // blue-dominant: b ≫ r
        effects.filter = filter
        effects.filterIntensity = intensity
        return StorySlide(id: "s", effects: effects)
    }

    /// Average RGB (0…255) of an image, via CIAreaAverage.
    private func avg(_ image: UIImage) -> (r: CGFloat, g: CGFloat, b: CGFloat)? {
        guard let ci = CIImage(image: image) else { return nil }
        let ctx = CIContext()
        guard let filter = CIFilter(name: "CIAreaAverage", parameters: [
            kCIInputImageKey: ci,
            "inputExtent": CIVector(cgRect: ci.extent),
        ]), let output = filter.outputImage else { return nil }
        var bitmap = [UInt8](repeating: 0, count: 4)
        ctx.render(output, toBitmap: &bitmap, rowBytes: 4,
                   bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
                   format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
        return (CGFloat(bitmap[0]), CGFloat(bitmap[1]), CGFloat(bitmap[2]))
    }

    func test_noFilter_compositeStaysBlueDominant() throws {
        let img = try XCTUnwrap(StorySlideRenderer.renderComposite(slide: makeSlide(filter: nil), bgImage: nil))
        let c = try XCTUnwrap(avg(img))
        XCTAssertGreaterThan(c.b, c.r + 80, "baseline blue background must stay blue-dominant")
    }

    func test_bwFilter_desaturatesComposite() throws {
        let base = try XCTUnwrap(avg(try XCTUnwrap(
            StorySlideRenderer.renderComposite(slide: makeSlide(filter: nil), bgImage: nil))))
        let bw = try XCTUnwrap(avg(try XCTUnwrap(
            StorySlideRenderer.renderComposite(slide: makeSlide(filter: StoryFilter.bw.rawValue), bgImage: nil))))
        // base is strongly blue (b−r ≈ 255); bw must collapse the channel spread.
        XCTAssertLessThan(abs(bw.r - bw.b), abs(base.r - base.b) - 100,
                          "bw must desaturate the composite (r≈g≈b)")
    }

    func test_vintageFilter_shiftsCompositeWarm() throws {
        let vintage = try XCTUnwrap(avg(try XCTUnwrap(
            StorySlideRenderer.renderComposite(slide: makeSlide(filter: StoryFilter.vintage.rawValue), bgImage: nil))))
        // base blue has r ≪ b; sepia/vintage flips it to a warm tone where r > b.
        XCTAssertGreaterThan(vintage.r, vintage.b, "vintage must shift the composite warm (r > b)")
    }

    func test_kernellessFilter_leavesCompositeUnchanged() throws {
        // warm/cool/dramatic/vivid/fade/chrome have no Metal kernel → the viewer leaves
        // them unfiltered, so the thumbHash must too (else placeholder ≠ played story).
        let base = try XCTUnwrap(avg(try XCTUnwrap(
            StorySlideRenderer.renderComposite(slide: makeSlide(filter: nil), bgImage: nil))))
        let warm = try XCTUnwrap(avg(try XCTUnwrap(
            StorySlideRenderer.renderComposite(slide: makeSlide(filter: StoryFilter.warm.rawValue), bgImage: nil))))
        XCTAssertEqual(warm.r, base.r, accuracy: 4)
        XCTAssertEqual(warm.g, base.g, accuracy: 4)
        XCTAssertEqual(warm.b, base.b, accuracy: 4)
    }
}
