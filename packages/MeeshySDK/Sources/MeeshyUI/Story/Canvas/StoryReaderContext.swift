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
    /// Résolveur d'URL audio LOCALE keyé par `audio.id` (et non `postMediaId`).
    /// Le composer/preview stockent leurs clips fraîchement importés dans
    /// `loadedAudioURLs[audio.id]` avec un `postMediaId` vide — le resolver
    /// `postMediaURLResolver` (par `postMediaId`) échoue alors et le son restait
    /// muet. Consommé en priorité par `reconfigureAudioForPlayback`. Directive
    /// user 2026-07-14 : « la preview doit jouer le son en arrière-plan ».
    public let localAudioURLResolver: (@Sendable (String) -> URL?)?

    public init(preferredLanguages: [String] = [],
                mute: Bool = false,
                onCompletion: (@Sendable () -> Void)? = nil,
                postMediaURLResolver: (@Sendable (String) -> URL?)? = nil,
                imageCache: ImageCacheReader? = nil,
                localAudioURLResolver: (@Sendable (String) -> URL?)? = nil) {
        self.preferredLanguages = preferredLanguages
        self.mute = mute
        self.onCompletion = onCompletion
        self.postMediaURLResolver = postMediaURLResolver
        self.imageCache = imageCache
        self.localAudioURLResolver = localAudioURLResolver
    }

    public static let empty = StoryReaderContext()
}

/// Lightweight protocol decoupling the reader from the concrete cache type.
/// Conformed by `CacheCoordinator.shared.images` (DiskCacheStore).
public protocol ImageCacheReader: Sendable {
    func cachedImage(for key: String) async -> UIImage?
}
