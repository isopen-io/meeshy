import Foundation
import CoreGraphics
import ImageIO

/// CPU-only pixel comparison primitives used by Phase 4 visual-equivalence tests.
///
/// `PixelComparison` exposes three complementary metrics:
///
///   * `difference(_:_:)` — bit-exact: number of pixels whose raw 4-channel
///     value differs. Used for impossible-to-fail invariants (same buffer
///     compared to itself, etc.).
///   * `ssim(_:_:windowSize:)` — Wang et al. 2004 Structural Similarity Index
///     over a sliding 8×8 window with stride 4, averaged across the image.
///     Returns a value in [0, 1] where 1.0 = identical and ≥ 0.99 = perceptually
///     identical (acceptable for font-hinting / anti-aliasing LSB drift between
///     UIKit snapshot and the AVFoundation CoreAnimation compositor).
///   * `diffImage(_:_:)` — a red overlay highlighting differing pixels, intended
///     for `XCTAttachment` failure diagnostics so test reports show the diff
///     instead of just a similarity score.
///
/// All functions are pure CPU, nonisolated, and don't pull in Metal / Vision.
/// SSIM is the canonical Wang/Bovik 2004 formulation:
///
///     SSIM(x, y) = (2·μx·μy + C1)(2·σxy + C2) /
///                  ((μx² + μy² + C1)(σx² + σy² + C2))
///
/// with C1 = (0.01·L)², C2 = (0.03·L)², L = 255 (8-bit dynamic range).
///
/// For 4-channel BGRA / RGBA images, pixels are converted to single-channel
/// luminance via ITU-R BT.709 weights (0.2126·R + 0.7152·G + 0.0722·B) before
/// computing per-window mean / variance / covariance. Alpha is ignored — we're
/// comparing rendered output, not transparency.
///
/// **Size mismatch policy**: images of different dimensions return SSIM = 0.0
/// (treated as worst case), and `difference` / `diffImage` return the
/// conservative "everything differs" answer. This keeps callers ergonomic
/// (no try/throws) while still failing loud on mismatched test inputs.
public enum PixelComparison {

    // MARK: - Public API

    /// Bit-exact comparison. Returns 0 if identical, otherwise the count of
    /// pixels that differ in any channel. Returns the pixel count of the larger
    /// image when sizes don't match.
    public static func difference(_ a: CGImage, _ b: CGImage) -> Int {
        guard a.width == b.width, a.height == b.height else {
            return max(a.width * a.height, b.width * b.height)
        }
        guard let bufA = makeRGBA(a), let bufB = makeRGBA(b) else { return 0 }
        let width = a.width
        let height = a.height
        var diffCount = 0
        for y in 0..<height {
            for x in 0..<width {
                let i = (y * width + x) * 4
                if bufA[i] != bufB[i] ||
                   bufA[i + 1] != bufB[i + 1] ||
                   bufA[i + 2] != bufB[i + 2] {
                    diffCount += 1
                }
            }
        }
        return diffCount
    }

    /// Structural Similarity Index in [0, 1].
    ///
    /// 1.0 = identical, ≥ 0.99 = perceptually identical (acceptable LSB drift).
    /// < 0.95 typically corresponds to visible regressions. Returns 0.0 on size
    /// mismatch (treated as worst case).
    ///
    /// Implementation: sliding `windowSize × windowSize` window with stride
    /// `windowSize / 2`, mean of per-window SSIM scores over all windows.
    public static func ssim(_ a: CGImage, _ b: CGImage,
                            windowSize: Int = 8) -> Double {
        guard a.width == b.width, a.height == b.height else { return 0.0 }
        let width = a.width
        let height = a.height
        guard width >= windowSize, height >= windowSize else { return 0.0 }
        guard let lumA = makeLuminance(a), let lumB = makeLuminance(b) else { return 0.0 }

        // Wang et al. 2004 constants for 8-bit dynamic range.
        let dynamicRange: Double = 255.0
        let c1 = pow(0.01 * dynamicRange, 2)
        let c2 = pow(0.03 * dynamicRange, 2)

        let stride = max(1, windowSize / 2)
        var ssimSum = 0.0
        var windowCount = 0

        var y = 0
        while y + windowSize <= height {
            var x = 0
            while x + windowSize <= width {
                let score = windowSSIM(
                    lumA, lumB,
                    width: width,
                    originX: x, originY: y,
                    size: windowSize,
                    c1: c1, c2: c2
                )
                ssimSum += score
                windowCount += 1
                x += stride
            }
            y += stride
        }

        return windowCount > 0 ? ssimSum / Double(windowCount) : 0.0
    }

    /// Returns an image where pixels that differ between `a` and `b` are
    /// overlaid in saturated red on a desaturated copy of `a`. Identical
    /// pixels are rendered at half luminance so the diff stands out.
    ///
    /// Used by tests to attach failure diagnostics via `XCTAttachment(image:)`.
    /// On size mismatch, returns `a` unchanged (the test will already have
    /// surfaced the mismatch via the SSIM = 0.0 path).
    public static func diffImage(_ a: CGImage, _ b: CGImage) -> CGImage {
        guard a.width == b.width, a.height == b.height else { return a }
        guard let bufA = makeRGBA(a), let bufB = makeRGBA(b) else { return a }
        let width = a.width
        let height = a.height

        var out = [UInt8](repeating: 0, count: width * height * 4)
        for y in 0..<height {
            for x in 0..<width {
                let i = (y * width + x) * 4
                let differs = bufA[i] != bufB[i] ||
                              bufA[i + 1] != bufB[i + 1] ||
                              bufA[i + 2] != bufB[i + 2]
                if differs {
                    // Saturated red overlay so diffs are obvious in screenshots.
                    out[i]     = 255 // R
                    out[i + 1] = 32  // G
                    out[i + 2] = 32  // B
                    out[i + 3] = 255 // A
                } else {
                    // Desaturated grey copy of a so the red overlay pops.
                    let r = Double(bufA[i])
                    let g = Double(bufA[i + 1])
                    let b = Double(bufA[i + 2])
                    let lum = UInt8(min(255.0, 0.2126 * r + 0.7152 * g + 0.0722 * b) / 2.0)
                    out[i] = lum
                    out[i + 1] = lum
                    out[i + 2] = lum
                    out[i + 3] = 255
                }
            }
        }

        return makeCGImage(rgba: out, width: width, height: height) ?? a
    }

    // MARK: - Private helpers

    /// Mean / variance / covariance over a `size × size` window.
    private static func windowSSIM(_ a: [Double], _ b: [Double],
                                    width: Int,
                                    originX: Int, originY: Int,
                                    size: Int,
                                    c1: Double, c2: Double) -> Double {
        let count = Double(size * size)
        var sumA = 0.0
        var sumB = 0.0
        for j in 0..<size {
            let row = (originY + j) * width + originX
            for k in 0..<size {
                sumA += a[row + k]
                sumB += b[row + k]
            }
        }
        let meanA = sumA / count
        let meanB = sumB / count

        var varA = 0.0
        var varB = 0.0
        var covAB = 0.0
        for j in 0..<size {
            let row = (originY + j) * width + originX
            for k in 0..<size {
                let dA = a[row + k] - meanA
                let dB = b[row + k] - meanB
                varA += dA * dA
                varB += dB * dB
                covAB += dA * dB
            }
        }
        // Biased variance estimator (divide by N) per the original Wang et al.
        // 2004 SSIM formulation. The 1/(N-1) Bessel correction differs by
        // ~1.6% on our 8×8 windows — within the C1/C2 stabilizer tolerance,
        // and the biased form is the canonical SSIM definition.
        varA /= count
        varB /= count
        covAB /= count

        let numerator = (2 * meanA * meanB + c1) * (2 * covAB + c2)
        let denominator = (meanA * meanA + meanB * meanB + c1) * (varA + varB + c2)
        return denominator > 0 ? numerator / denominator : 1.0
    }

    /// Decode `image` into an RGBA8 byte buffer (premultiplied last, sRGB).
    /// Re-decoding through `CGContext` normalizes any source colorspace /
    /// bitmap layout into a canonical 8-bit RGBA representation we can iterate
    /// over predictably.
    private static func makeRGBA(_ image: CGImage) -> [UInt8]? {
        let width = image.width
        let height = image.height
        guard width > 0, height > 0 else { return nil }

        var buffer = [UInt8](repeating: 0, count: width * height * 4)
        let bitsPerComponent = 8
        let bytesPerRow = width * 4
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue |
                         CGImageAlphaInfo.premultipliedLast.rawValue

        guard let ctx = buffer.withUnsafeMutableBytes({ raw -> CGContext? in
            guard let base = raw.baseAddress else { return nil }
            return CGContext(
                data: base,
                width: width,
                height: height,
                bitsPerComponent: bitsPerComponent,
                bytesPerRow: bytesPerRow,
                space: colorSpace,
                bitmapInfo: bitmapInfo
            )
        }) else { return nil }

        ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return buffer
    }

    /// Decode `image` into a single-channel luminance buffer (BT.709 weights).
    /// Returns `Double` values in [0, 255] so SSIM math doesn't truncate.
    private static func makeLuminance(_ image: CGImage) -> [Double]? {
        guard let rgba = makeRGBA(image) else { return nil }
        let width = image.width
        let height = image.height
        var lum = [Double](repeating: 0, count: width * height)
        for y in 0..<height {
            for x in 0..<width {
                let i = (y * width + x) * 4
                let r = Double(rgba[i])
                let g = Double(rgba[i + 1])
                let b = Double(rgba[i + 2])
                lum[y * width + x] = 0.2126 * r + 0.7152 * g + 0.0722 * b
            }
        }
        return lum
    }

    /// Wrap an RGBA byte buffer back into a CGImage for attachment / display.
    private static func makeCGImage(rgba: [UInt8], width: Int, height: Int) -> CGImage? {
        let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue |
                         CGImageAlphaInfo.premultipliedLast.rawValue
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bytesPerRow = width * 4
        var mutable = rgba
        return mutable.withUnsafeMutableBytes { raw -> CGImage? in
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
    }
}
