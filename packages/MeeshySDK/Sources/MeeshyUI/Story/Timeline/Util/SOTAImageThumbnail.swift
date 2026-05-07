import ImageIO
import UIKit

/// SOTA thumbnail extraction via CGImageSource.
///
/// 2-4x faster than `UIImage.preparingThumbnail(of:)` for images read from disk
/// (Apple Engineering forum measurement, 2023):
/// - HEIC 4K: 52ms vs 83ms
/// - JPEG 4K: 24ms vs 105ms
///
/// Used by `VideoClipBar` (and any other strip-rendering view) to extract the
/// frame thumbnails that line the timeline track. The cost is further amortized
/// by the OS image cache on subsequent renders.
///
/// - Note: This helper is intentionally synchronous. Callers should dispatch
///   off the main thread for hot paths (the timeline strip extractor uses a
///   background `Task` for its first decode pass).
public enum SOTAImageThumbnail {

    /// Decode a thumbnail from a local file URL whose largest pixel dimension is
    /// at most `maxPixelSize`. Returns nil if the source cannot be opened.
    ///
    /// Pure ImageIO work — nonisolated so it can be called from any actor context
    /// (detached Tasks, background queues).
    ///
    /// - Parameters:
    ///   - url: Local file URL (HEIC/JPEG/PNG supported via ImageIO).
    ///   - maxPixelSize: Cap on the longest side, in pixels (NOT points).
    public nonisolated static func thumbnail(from url: URL, maxPixelSize: CGFloat) -> UIImage? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: false,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
        ]
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }

    /// Async variant — suspends off the main actor so the caller need not manage
    /// a detached Task themselves. Suitable for use in `Task { }` blocks inside
    /// SwiftUI `.onAppear` and `.task` modifiers.
    public nonisolated static func thumbnailAsync(from url: URL, maxPixelSize: CGFloat) async -> UIImage? {
        await Task.detached(priority: .userInitiated) {
            thumbnail(from: url, maxPixelSize: maxPixelSize)
        }.value
    }
}
