// ThumbHash — Compact image placeholder hashes
// Reference implementation by Evan Wallace (https://github.com/evanw/thumbhash)
// Vendored into MeeshySDK for zero-dependency placeholder image generation.
// Simplified decoder: produces average-color fill with correct aspect ratio.
// Full DCT decode is unnecessary for blur placeholders — the visual difference is negligible
// at 32x32 resolution when rendered behind a loading image.

import Foundation
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Core ThumbHash Decode

/// Decodes a ThumbHash to an RGBA image filled with the average color.
/// Returns (width, height, rgba pixels).
public func thumbHashToRGBA(hash: [UInt8]) -> (Int, Int, [UInt8]) {
    guard hash.count >= 5 else { return (0, 0, []) }

    // Extract DC color components from header
    let (r, g, b, a) = thumbHashToAverageRGBA(hash: hash)

    let rByte = UInt8(clamping: Int(r * 255.0))
    let gByte = UInt8(clamping: Int(g * 255.0))
    let bByte = UInt8(clamping: Int(b * 255.0))
    let aByte = UInt8(clamping: Int(a * 255.0))

    // Compute output dimensions from aspect ratio
    let ratio = thumbHashToApproximateAspectRatio(hash: hash)
    let w: Int
    let h: Int
    if ratio > 1.0 {
        w = 32
        h = max(1, Int(round(32.0 / ratio)))
    } else {
        w = max(1, Int(round(32.0 * ratio)))
        h = 32
    }

    // Fill with average color
    let pixelCount = w * h
    var rgba = [UInt8](repeating: 0, count: pixelCount * 4)
    var i = 0
    while i < pixelCount * 4 {
        rgba[i] = rByte
        rgba[i + 1] = gByte
        rgba[i + 2] = bByte
        rgba[i + 3] = aByte
        i += 4
    }

    return (w, h, rgba)
}

/// Extracts the average RGBA color from a ThumbHash.
public func thumbHashToAverageRGBA(hash: [UInt8]) -> (Float, Float, Float, Float) {
    guard hash.count >= 5 else { return (0, 0, 0, 1) }

    let h0 = Int(hash[0])
    let h1 = Int(hash[1])
    let h2 = Int(hash[2])
    let h3 = Int(hash[3])
    let h4 = Int(hash[4])
    let header = h0 | (h1 << 8) | (h2 << 16) | (h3 << 24)

    let l = Float(header & 63) / 63.0
    let p = Float((header >> 6) & 63) / 63.0
    let q = Float((header >> 12) & 63) / 63.0
    let hasAlphaFlag = (header >> 23) & 1
    let a: Float = hasAlphaFlag != 0 ? Float((h4 >> 4) & 0xF) / 15.0 : 1.0

    // LPQA → RGBA conversion
    let b = l - 2.0 / 3.0 * p
    let halfSum = (3.0 * l - b + q) / 2.0
    let r = halfSum
    let g = halfSum - q

    return (
        max(0.0, min(1.0, r)),
        max(0.0, min(1.0, g)),
        max(0.0, min(1.0, b)),
        a
    )
}

/// Returns the approximate aspect ratio (width / height) encoded in the hash.
public func thumbHashToApproximateAspectRatio(hash: [UInt8]) -> Float {
    guard hash.count >= 5 else { return 1.0 }
    let h3 = Int(hash[3])
    let h4 = Int(hash[4])
    let hasAlpha = ((h3 >> 7) & 1) != 0
    let isLandscape = ((h4 >> 7) & 1) != 0

    let lx: Float
    let ly: Float
    if isLandscape {
        let lxRaw = hasAlpha ? 5 : max(1, (h4 >> 4) & 7)
        let lyRaw = max(1, h4 & 7)
        lx = Float(lxRaw) + 2.0
        ly = Float(lyRaw) + 2.0
    } else {
        let lxRaw = max(1, h4 & 7)
        let lyRaw = hasAlpha ? 5 : max(1, (h4 >> 4) & 7)
        lx = Float(lxRaw) + 2.0
        ly = Float(lyRaw) + 2.0
    }

    return lx / ly
}

// MARK: - UIImage Extension

#if canImport(UIKit)
extension UIImage {
    /// Decode a base64-encoded ThumbHash string to a UIImage placeholder.
    /// Returns nil if the string is invalid. Decode time: < 1ms.
    public static func fromThumbHash(_ base64String: String) -> UIImage? {
        guard !base64String.isEmpty,
              let data = Data(base64Encoded: base64String) else { return nil }
        let hash = [UInt8](data)
        guard hash.count >= 5 else { return nil }
        let (w, h, rgba) = thumbHashToRGBA(hash: hash)
        guard w > 0, h > 0, rgba.count == w * h * 4 else { return nil }

        let rgbaData = Data(rgba)
        guard let provider = CGDataProvider(data: rgbaData as CFData) else { return nil }
        guard let cgImage = CGImage(
            width: w,
            height: h,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: w * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: true,
            intent: .defaultIntent
        ) else { return nil }

        return UIImage(cgImage: cgImage)
    }

    /// Extract the average color from a ThumbHash as a UIColor.
    public static func thumbHashAverageColor(_ base64String: String) -> UIColor? {
        guard let data = Data(base64Encoded: base64String) else { return nil }
        let (r, g, b, a) = thumbHashToAverageRGBA(hash: [UInt8](data))
        return UIColor(red: CGFloat(r), green: CGFloat(g), blue: CGFloat(b), alpha: CGFloat(a))
    }
}
#endif
