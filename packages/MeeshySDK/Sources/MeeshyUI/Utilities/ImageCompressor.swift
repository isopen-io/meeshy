import UIKit

public enum ImageCompressor {
    public nonisolated static func compress(_ image: UIImage, maxSizeKB: Int, maxDimension: CGFloat = 1280) -> Data {
        // Cap the pixel dimensions BEFORE the quality loop. Without this a
        // full-resolution photo (e.g. a 4000×3000 camera shot used as a 120-pt
        // avatar) was re-encoded at full size up to ~8 times to hit the size
        // budget — burning CPU/battery and yielding a blocky JPEG. None of the
        // callers (avatar / banner / cover) ever display above this.
        let scaled = downsampledIfNeeded(image, maxPixelDimension: maxDimension)
        var compression: CGFloat = 0.8
        var compressed = scaled.jpegData(compressionQuality: compression) ?? Data()
        while compressed.count > maxSizeKB * 1024, compression > 0.1 {
            compression -= 0.1
            compressed = scaled.jpegData(compressionQuality: compression) ?? Data()
        }
        return compressed
    }

    private nonisolated static func downsampledIfNeeded(_ image: UIImage, maxPixelDimension: CGFloat) -> UIImage {
        let pixelW = image.size.width * image.scale
        let pixelH = image.size.height * image.scale
        let maxSide = max(pixelW, pixelH)
        guard maxSide > maxPixelDimension, maxSide > 0 else { return image }
        let ratio = maxPixelDimension / maxSide
        let newSize = CGSize(width: (pixelW * ratio).rounded(), height: (pixelH * ratio).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1 // newSize is already expressed in pixels
        format.opaque = false
        return UIGraphicsImageRenderer(size: newSize, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    /// Off-main variant of `compress`. The iterative JPEG re-encoding (up to ~8
    /// full-image passes) is CPU-heavy and was running on the caller — typically
    /// `@MainActor` (avatar / banner / entity-image upload), freezing the UI for
    /// the whole compression. Hop to a background task. The `@unchecked Sendable`
    /// box is safe: the `UIImage` is only read (pixel encode), never mutated.
    public static func compressOffMain(_ image: UIImage, maxSizeKB: Int, maxDimension: CGFloat = 1280) async -> Data {
        let box = SendableImageBox(image: image)
        return await Task.detached(priority: .userInitiated) {
            ImageCompressor.compress(box.image, maxSizeKB: maxSizeKB, maxDimension: maxDimension)
        }.value
    }

    /// Off-main single-pass JPEG encode. `jpegData` is CPU-bound; on `@MainActor`
    /// send paths it blocked the UI for each thumbnail it re-encoded.
    public static func jpegOffMain(_ image: UIImage, quality: CGFloat) async -> Data? {
        let box = SendableImageBox(image: image)
        return await Task.detached(priority: .utility) {
            box.image.jpegData(compressionQuality: quality)
        }.value
    }
}

private struct SendableImageBox: @unchecked Sendable {
    let image: UIImage
}
