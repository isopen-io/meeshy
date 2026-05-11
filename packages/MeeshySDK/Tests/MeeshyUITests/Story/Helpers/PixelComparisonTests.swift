import XCTest
import CoreGraphics
import UIKit
@testable import MeeshyUI

/// Pins the contract of the `PixelComparison` helper used by Phase 4
/// equivalence tests. Four scenarios:
///
///   1. Identical buffer compared to itself → SSIM exactly 1.0
///   2. Solid white vs solid black → SSIM near zero
///   3. ~1 % of pixels drifted by ±1 LSB on luminance → SSIM > 0.99
///      (this is the tolerance band the export-equivalence tests rely on)
///   4. `diffImage` highlights the differing pixel(s) in saturated red
final class PixelComparisonTests: XCTestCase {

    // MARK: - 1. Identical images

    func test_ssim_identicalImages_returns1() throws {
        let img = try makeSolidImage(width: 64, height: 64, color: (128, 128, 128))
        let score = PixelComparison.ssim(img, img)
        XCTAssertEqual(score, 1.0, accuracy: 1e-9,
                       "SSIM of an image with itself must be exactly 1.0")
    }

    // MARK: - 2. Completely different images

    func test_ssim_completelyDifferentImages_returnsLow() throws {
        let white = try makeSolidImage(width: 100, height: 100, color: (255, 255, 255))
        let black = try makeSolidImage(width: 100, height: 100, color: (0, 0, 0))
        let score = PixelComparison.ssim(white, black)
        XCTAssertLessThan(score, 0.5,
                          "SSIM of solid white vs solid black must be < 0.5 (got \(score))")
    }

    // MARK: - 3. Sub-LSB anti-aliasing drift

    func test_ssim_minorAntialiasingDifference_returns_above_099() throws {
        // Base image: mid-grey with a small amount of structure so SSIM isn't
        // dominated by a degenerate zero-variance window. We sprinkle a faint
        // diagonal so per-window σ² > 0 across the buffer.
        let width = 100
        let height = 100
        let total = width * height
        var base = [UInt8](repeating: 0, count: total * 4)
        for y in 0..<height {
            for x in 0..<width {
                let i = (y * width + x) * 4
                let lum = UInt8(128 + ((x + y) % 16))   // [128, 143] band
                base[i]     = lum
                base[i + 1] = lum
                base[i + 2] = lum
                base[i + 3] = 255
            }
        }

        // Drift copy: same as base but ~1 % of pixels shifted by +1 LSB.
        // We use a deterministic stride (every 100th pixel) so the test is
        // reproducible across runs.
        var drift = base
        let driftCount = total / 100
        for k in 0..<driftCount {
            let pixelIndex = k * 100   // 1 % of pixels, evenly spaced
            let i = pixelIndex * 4
            // +1 LSB on each channel — the classic "anti-aliasing drift" case.
            drift[i]     = drift[i] &+ 1
            drift[i + 1] = drift[i + 1] &+ 1
            drift[i + 2] = drift[i + 2] &+ 1
        }

        let baseImg = try makeCGImage(rgba: base, width: width, height: height)
        let driftImg = try makeCGImage(rgba: drift, width: width, height: height)
        let score = PixelComparison.ssim(baseImg, driftImg)
        XCTAssertGreaterThan(score, 0.99,
                             "Sub-LSB drift on 1 % of pixels must keep SSIM > 0.99 (got \(score))")
    }

    // MARK: - 4. diffImage highlights diffs

    func test_diffImage_highlightsDifferingPixels() throws {
        let width = 8
        let height = 8
        let total = width * height
        // Two identical mid-grey buffers...
        var a = [UInt8](repeating: 128, count: total * 4)
        var b = a
        // ...except b's pixel at (3, 3) is bright green.
        let targetX = 3
        let targetY = 3
        let i = (targetY * width + targetX) * 4
        b[i]     = 0    // R
        b[i + 1] = 255  // G
        b[i + 2] = 0    // B
        b[i + 3] = 255  // A

        // Force the alpha channel everywhere on a so makeRGBA round-trip is
        // stable (premultiplied storage doesn't surprise us).
        for j in 0..<total {
            a[j * 4 + 3] = 255
        }

        let aImg = try makeCGImage(rgba: a, width: width, height: height)
        let bImg = try makeCGImage(rgba: b, width: width, height: height)
        let diff = PixelComparison.diffImage(aImg, bImg)

        // Sanity: diff is the same size.
        XCTAssertEqual(diff.width, width)
        XCTAssertEqual(diff.height, height)

        // Read the diff back and assert the target pixel is red-overlaid.
        let pixels = try readRGBA(diff)
        let targetR = pixels[i]
        let targetG = pixels[i + 1]
        let targetB = pixels[i + 2]
        XCTAssertGreaterThan(targetR, 200,
                             "Differing pixel should be saturated red (R > 200, got \(targetR))")
        XCTAssertLessThan(targetG, 50,
                          "Differing pixel should have low green (got \(targetG))")
        XCTAssertLessThan(targetB, 50,
                          "Differing pixel should have low blue (got \(targetB))")

        // And a non-diff pixel must NOT be red-overlaid (it's a grey/desaturated copy).
        let untouchedIdx = 0   // top-left pixel, unchanged between a and b
        let untouchedR = pixels[untouchedIdx]
        let untouchedG = pixels[untouchedIdx + 1]
        let untouchedB = pixels[untouchedIdx + 2]
        XCTAssertEqual(Int(untouchedR), Int(untouchedG),
                       "Unchanged pixel should be greyscale in diff image")
        XCTAssertEqual(Int(untouchedG), Int(untouchedB),
                       "Unchanged pixel should be greyscale in diff image")
        XCTAssertLessThan(untouchedR, 200,
                          "Unchanged pixel must not be red (got R=\(untouchedR))")
    }

    // MARK: - Helpers

    /// Solid-color RGBA image of the given size. Useful for the trivial
    /// cases (all-white, all-black) without going through UIGraphics.
    private func makeSolidImage(width: Int, height: Int,
                                 color: (UInt8, UInt8, UInt8)) throws -> CGImage {
        let total = width * height
        var buf = [UInt8](repeating: 0, count: total * 4)
        for i in 0..<total {
            buf[i * 4]     = color.0
            buf[i * 4 + 1] = color.1
            buf[i * 4 + 2] = color.2
            buf[i * 4 + 3] = 255
        }
        return try makeCGImage(rgba: buf, width: width, height: height)
    }

    /// Wrap an RGBA byte buffer into a CGImage for test use. Mirrors the
    /// production helper's encoding (sRGB, premultipliedLast, byteOrder32Big).
    private func makeCGImage(rgba: [UInt8], width: Int, height: Int) throws -> CGImage {
        let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue |
                         CGImageAlphaInfo.premultipliedLast.rawValue
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bytesPerRow = width * 4
        var mutable = rgba
        let result: CGImage? = mutable.withUnsafeMutableBytes { raw -> CGImage? in
            guard let base = raw.baseAddress else { return nil }
            guard let ctx = CGContext(
                data: base,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: bytesPerRow,
                space: colorSpace,
                bitmapInfo: bitmapInfo
            ) else { return nil }
            return ctx.makeImage()
        }
        guard let img = result else {
            throw NSError(domain: "PixelComparisonTests", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Failed to create CGImage"])
        }
        return img
    }

    /// Read a CGImage back into RGBA bytes for assertion. Mirrors the encoding
    /// pipeline of `PixelComparison.diffImage` so we round-trip cleanly.
    private func readRGBA(_ image: CGImage) throws -> [UInt8] {
        let width = image.width
        let height = image.height
        let bytesPerRow = width * 4
        var buf = [UInt8](repeating: 0, count: width * height * 4)
        let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue |
                         CGImageAlphaInfo.premultipliedLast.rawValue
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let result: Bool = buf.withUnsafeMutableBytes { raw -> Bool in
            guard let base = raw.baseAddress else { return false }
            guard let ctx = CGContext(
                data: base,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: bytesPerRow,
                space: colorSpace,
                bitmapInfo: bitmapInfo
            ) else { return false }
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        if !result {
            throw NSError(domain: "PixelComparisonTests", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "Failed to read CGImage"])
        }
        return buf
    }
}
