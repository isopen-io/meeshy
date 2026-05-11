import Foundation
import UIKit
import MeeshySDK

/// Runtime parameters for `StoryCanvasUIView` mode `.play` reader playback.
///
/// Carries the Prisme Linguistique resolution chain, audio mute state,
/// completion callback (notified when `currentTime ≥ effectiveSlideDuration`),
/// post-media URL resolver (maps `postMediaId` → `URL`), and an optional
/// image cache for thumbHash placeholder + asset lookup.
public struct StoryReaderContext: Sendable {
    public let preferredLanguages: [String]
    public let mute: Bool
    public let onCompletion: (@Sendable () -> Void)?
    public let postMediaURLResolver: (@Sendable (String) -> URL?)?
    public let imageCache: ImageCacheReader?

    public init(preferredLanguages: [String] = [],
                mute: Bool = false,
                onCompletion: (@Sendable () -> Void)? = nil,
                postMediaURLResolver: (@Sendable (String) -> URL?)? = nil,
                imageCache: ImageCacheReader? = nil) {
        self.preferredLanguages = preferredLanguages
        self.mute = mute
        self.onCompletion = onCompletion
        self.postMediaURLResolver = postMediaURLResolver
        self.imageCache = imageCache
    }

    public static let empty = StoryReaderContext()
}

/// Lightweight protocol decoupling the reader from the concrete cache type.
/// Conformed by `CacheCoordinator.shared.images` (DiskCacheStore).
public protocol ImageCacheReader: Sendable {
    func cachedImage(for key: String) async -> UIImage?
}
