import UIKit

public enum ImageCompressor {
    public nonisolated static func compress(_ image: UIImage, maxSizeKB: Int) -> Data {
        var compression: CGFloat = 0.8
        var compressed = image.jpegData(compressionQuality: compression) ?? Data()
        while compressed.count > maxSizeKB * 1024, compression > 0.1 {
            compression -= 0.1
            compressed = image.jpegData(compressionQuality: compression) ?? Data()
        }
        return compressed
    }

    /// Off-main variant of `compress`. The iterative JPEG re-encoding (up to ~8
    /// full-image passes) is CPU-heavy and was running on the caller — typically
    /// `@MainActor` (avatar / banner / entity-image upload), freezing the UI for
    /// the whole compression. Hop to a background task. The `@unchecked Sendable`
    /// box is safe: the `UIImage` is only read (pixel encode), never mutated.
    public static func compressOffMain(_ image: UIImage, maxSizeKB: Int) async -> Data {
        let box = SendableImageBox(image: image)
        return await Task.detached(priority: .userInitiated) {
            ImageCompressor.compress(box.image, maxSizeKB: maxSizeKB)
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
