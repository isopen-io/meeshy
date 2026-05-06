import UIKit
import MeeshySDK

/// Centralizes image memory management for the Meeshy app.
///
/// The image pipeline is built on `DiskCacheStore` (NSCache + disk FileManager),
/// not Kingfisher — Kingfisher was audited out (2026-05-06, see `decisions.md`).
/// This type provides:
/// - `applyGlobal()` — called once at app launch to cap the in-memory image cache
///   at 60 MB and configure background decode via the shared `DiskCacheStore`
/// - `maxPixelSize(for:)` — converts a SwiftUI point-size to a pixel size suitable
///   for `CGImageSourceCreateThumbnailAtIndex`, matching what `DiskCacheStore` uses
///   internally for its `downsampledImage(data:maxPixelSize:)` pass
///
/// ### Usage
/// ```swift
/// // In MeeshyApp.init() or the top of the root .task:
/// ImageDownsamplingConfig.applyGlobal()
///
/// // In a view that knows its rendered size:
/// CachedAsyncImage(url: avatarURL, targetSize: CGSize(width: 40, height: 40)) { ... }
/// ```
public enum ImageDownsamplingConfig {

    /// Recommended memory cache budget (bytes). Leaves headroom for UIKit and
    /// Metal allocations versus the SDK's default of 80 MB.
    public static let recommendedMemoryCacheLimitBytes: Int = 60 * 1024 * 1024  // 60 MB

    /// Apply global image-pipeline defaults. Call exactly once at app launch,
    /// before any `CachedAsyncImage` or `KFImage` view is rendered.
    ///
    /// Effects:
    /// - Sets `DiskCacheStore` in-memory image cache to 60 MB
    public static func applyGlobal() {
        DiskCacheStore.configureImageCache(memoryCostLimitBytes: recommendedMemoryCacheLimitBytes)
    }

    /// Converts a SwiftUI **point** size into the pixel-size argument expected
    /// by `CGImageSourceCreateThumbnailAtIndex` (`kCGImageSourceThumbnailMaxPixelSize`).
    ///
    /// The returned value is the larger dimension multiplied by the main screen
    /// scale, so a 40×40pt avatar on a 3× display yields 120 px rather than
    /// loading a full 4K image into memory.
    ///
    /// - Parameter pointSize: Rendered size of the image view in SwiftUI points.
    /// - Returns: Max pixel dimension suitable for the `maxPixelSize` argument.
    public static func maxPixelSize(for pointSize: CGSize) -> CGFloat {
        let scale = UIScreen.main.scale
        let largerDimension = max(pointSize.width, pointSize.height)
        return largerDimension * scale
    }
}
