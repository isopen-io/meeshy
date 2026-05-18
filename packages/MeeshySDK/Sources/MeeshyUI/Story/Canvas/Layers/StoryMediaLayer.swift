import Foundation
import QuartzCore
import AVFoundation
import UIKit
import MeeshySDK

/// Async image loader used by `StoryMediaLayer.configureImage`. Default
/// production conformer is `DiskCacheImageLoader`, which forwards into
/// `CacheCoordinator.shared.images` (`DiskCacheStore`) and inherits its
/// L1 NSCache + L2 disk + network fetch + downsampling pipeline.
///
/// The protocol exists so tests can inject a deterministic in-process stub
/// and exercise the cancel chain without hitting the real disk cache or
/// `URLSession`. Marked `nonisolated` on the requirement so witnesses don't
/// pick up MeeshyUI's `defaultIsolation(MainActor)` — actor-isolated
/// witnesses (e.g. `DiskCacheStore.image(for:)`) match cleanly.
public protocol StoryMediaImageLoading: Sendable {
    nonisolated func image(for urlString: String) async -> UIImage?
}

/// Production conformer — thin shim around `CacheCoordinator.shared.images`.
/// We don't conform `DiskCacheStore` directly because doing so from the UI
/// module crosses the MainActor / actor isolation boundary in a way that
/// confuses Swift 6.2's conformance checker; a value-type shim sidesteps
/// the issue and stays trivially `Sendable`.
public struct DiskCacheImageLoader: StoryMediaImageLoading {
    public nonisolated init() {}
    public nonisolated func image(for urlString: String) async -> UIImage? {
        await CacheCoordinator.shared.images.image(for: urlString)
    }
}

/// `CALayer` subclass that renders a single `StoryMediaObject` (image or video)
/// inside the Story canvas. Owns its `AVPlayer`/`AVPlayerLayer` for video paths
/// and its loop observer.
///
/// The class is `nonisolated` to interop with `CALayer`'s nonisolated initializers
/// (the MeeshyUI module's default `MainActor` isolation conflicts with the parent's
/// `init()` / `init(layer:)` / `init?(coder:)`). Methods that touch UIKit globals
/// (`UIScreen.main.scale`, `UIImage`, `AVPlayer`) are explicitly `@MainActor`.
///
/// Position and size live in design space (1080-référentiel) before being projected
/// through `CanvasGeometry` so output is bit-identical across device sizes.
public final class StoryMediaLayer: CALayer, @unchecked Sendable {
    public private(set) nonisolated(unsafe) var media: StoryMediaObject?
    public private(set) nonisolated(unsafe) weak var avPlayer: AVPlayer?
    public private(set) nonisolated(unsafe) var avPlayerLayer: AVPlayerLayer?

    private nonisolated(unsafe) var loopObserver: NSObjectProtocol?

    /// Image loader used by `configureImage`. Defaults to a shim that calls
    /// `CacheCoordinator.shared.images.image(for:)`. Override in tests via
    /// `_setImageLoaderForTesting(_:)` to inject a deterministic stub.
    /// `nonisolated(unsafe)` so the `nonisolated init()` can populate the
    /// default value; readers/writers below are explicitly `@MainActor` so
    /// mutation always happens on a single isolation context.
    private nonisolated(unsafe) var imageLoader: any StoryMediaImageLoading = DiskCacheImageLoader()

    /// In-flight network/cache fetch for the current media URL. Captured so a
    /// subsequent `configure(with:geometry:mode:)` call (recycled layer, new
    /// slide, scrub) cancels the previous load before it can stamp a stale
    /// CGImage into `contents`. `Task<Void, Never>` because the closure
    /// swallows all errors — it either sets `contents` or no-ops.
    private nonisolated(unsafe) var currentLoadTask: Task<Void, Never>?

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryMediaLayer does not support NSCoder")
    }

    deinit {
        if let token = loopObserver {
            NotificationCenter.default.removeObserver(token)
        }
    }

    /// Test-only seam to inject a deterministic image loader. Cancels any
    /// pending load so the next `configure` call starts from a clean slate.
    @MainActor
    public func _setImageLoaderForTesting(_ loader: any StoryMediaImageLoading) {
        currentLoadTask?.cancel()
        currentLoadTask = nil
        imageLoader = loader
    }

    /// Awaitable handle to the most recent image load. Used by tests to wait
    /// for the async fetch to complete (or to observe it being cancelled).
    /// Returns `nil` when no load is currently in flight.
    @MainActor
    public func _currentImageLoadTaskForTesting() -> Task<Void, Never>? {
        currentLoadTask
    }

    /// Configures the layer for a foreground media object.
    ///
    /// `resolver` / `imageCache` close the URL-resolution gap that left
    /// foreground media invisible (RC4.1). Unlike `StoryBackgroundLayer`,
    /// `StoryMediaLayer` previously read `media.mediaURL` directly — but a
    /// published story never stamps `mediaURL` onto a per-object `StoryMediaObject`
    /// (the URL lives on `StoryItem.media`, reachable only via the resolver),
    /// and the composer preview hands its bitmaps through the resolver too.
    /// The signature mirrors `StoryBackgroundLayer.configure(...,resolver:imageCache:)`.
    @MainActor
    public func configure(with media: StoryMediaObject,
                          geometry: CanvasGeometry,
                          mode: RenderMode,
                          resolver: (@Sendable (String) -> URL?)? = nil,
                          imageCache: ImageCacheReader? = nil) {
        self.media = media

        // Design-space frame (1080-référentiel) → render-space via geometry.
        let baseDesignSize = baseMediaDesignSize(aspectRatio: media.aspectRatio)
        let scaledDesignSize = CGSize(
            width: baseDesignSize.width * CGFloat(media.scale),
            height: baseDesignSize.height * CGFloat(media.scale)
        )
        let renderedSize = geometry.render(scaledDesignSize)

        let designCenterX = geometry.designLength(forNormalized: CGFloat(media.x))
        let designCenterY = CGFloat(media.y) * CanvasGeometry.designHeight
        let renderedCenter = geometry.render(CGPoint(x: designCenterX, y: designCenterY))

        bounds = CGRect(origin: .zero, size: renderedSize)
        position = renderedCenter
        anchorPoint = media.anchor
        transform = CATransform3DMakeRotation(CGFloat(media.rotation) * .pi / 180, 0, 0, 1)
        zPosition = CGFloat(media.zIndex)
        contentsScale = UIScreen.main.scale
        name = media.id

        // Coins arrondis du média (image ET vidéo). `masksToBounds` clippe le
        // contenu — y compris le sublayer `AVPlayerLayer` du chemin vidéo — au
        // rectangle arrondi. Le cadre foreground réutilise ce `cornerRadius`.
        cornerRadius = min(renderedSize.width, renderedSize.height) * Self.cornerRadiusFraction
        masksToBounds = true

        switch media.kind {
        case .image:
            configureImage(media, resolver: resolver, imageCache: imageCache)
        case .video:
            configureVideo(media, mode: mode, resolver: resolver)
        case .none:
            break
        }

        // Rasterize static images during playback to skip per-frame compositing.
        // Videos cannot be rasterized (their AVPlayerLayer keeps changing).
        let staticImage = media.kind == .image && media.isStatic
        shouldRasterize = mode == .play && staticImage
        if shouldRasterize { rasterizationScale = UIScreen.main.scale }
    }

    // MARK: - Sizing

    /// Rayon des coins arrondis du média, exprimé en proportion de son petit
    /// côté rendu. Le cadre foreground (`StoryCanvasUIView.applyForegroundFrames`)
    /// pose son `border` sur ce même layer : bordure et image héritent donc
    /// exactement du même arrondi, sans constante dupliquée.
    static let cornerRadiusFraction: CGFloat = 0.06

    /// Base design size (in 1080-référentiel pixels) of a media before user `scale`
    /// is layered on. Envelope is 65 % of the short canvas side, fitted to aspect.
    private nonisolated func baseMediaDesignSize(aspectRatio: Double) -> CGSize {
        let target: CGFloat = CanvasGeometry.designWidth * 0.65   // 702
        let ratio = max(0.1, min(10.0, CGFloat(aspectRatio)))
        if abs(ratio - 1.0) < 0.05 {
            let side = CanvasGeometry.designWidth * 0.5  // 540 carré
            return CGSize(width: side, height: side)
        }
        if ratio < 1.0 {
            return CGSize(width: target * ratio, height: target)
        }
        return CGSize(width: target, height: target / ratio)
    }

    // MARK: - URL resolution

    /// Resolves the playable URL for a foreground media object.
    ///
    /// Order (identical to `StoryReaderContext.postMediaURLResolver`):
    ///  1. `resolver(media.postMediaId)` — preloaded composer-preview asset,
    ///     then the published `StoryItem.media` remote URL.
    ///  2. Fallback `media.mediaURL` — fixtures and the `file://` URL the
    ///     composer edition embeds directly on the object.
    @MainActor
    private func resolvedMediaURL(for media: StoryMediaObject,
                                  resolver: (@Sendable (String) -> URL?)?) -> URL? {
        if !media.postMediaId.isEmpty, let resolved = resolver?(media.postMediaId) {
            return resolved
        }
        if let urlString = media.mediaURL, let url = URL(string: urlString) {
            return url
        }
        return nil
    }

    // MARK: - Image path

    /// Configure the layer's `contents` from a media URL.
    ///
    /// **Performance contract** (P0 fix, 2026-05-12):
    /// - The previous implementation called `Data(contentsOf: url)` directly,
    ///   which is synchronous I/O. On `http(s)` URLs that meant a blocking
    ///   network fetch on the main thread (~500 ms / 5 MB on 4G ≈ 30 dropped
    ///   frames) every time `rebuildLayers()` ran on `displayLinkTick`.
    /// - We now keep the contract synchronous for `file://` URLs (already
    ///   non-blocking — local FS read is fast and matches the legacy hot path
    ///   used by the composer preview) and switch `http(s)` to the cache
    ///   coordinator's async `image(for:)` API, which serves from the L1
    ///   NSCache instantly when warm, falls back to disk, and finally to the
    ///   network on `URLSession`.
    /// - `currentLoadTask` is cancelled on every entry so a recycled layer
    ///   (slide change, scrub, re-configure for a different media) never
    ///   stamps the previous URL's image into `contents` after the new URL
    ///   has been set. The continuation also guards with `Task.isCancelled`
    ///   before mutating `contents`.
    @MainActor
    private func configureImage(_ media: StoryMediaObject,
                                resolver: (@Sendable (String) -> URL?)?,
                                imageCache: ImageCacheReader?) {
        // Cancel any in-flight load from a previous configure() call before
        // we mutate `contents`. The previous Task observes `isCancelled`
        // and returns without touching `contents`.
        currentLoadTask?.cancel()
        currentLoadTask = nil

        contentsGravity = .resizeAspectFill
        masksToBounds = true

        let resolvedURL = resolvedMediaURL(for: media, resolver: resolver)

        // Local file:// URLs stay on the synchronous path — they are not
        // blocking in any meaningful sense (no DNS / TCP / TLS) and the
        // composer preview relies on the image being present by the time
        // `configure(with:)` returns. Anything with a network scheme goes
        // through the async cache.
        if let url = resolvedURL, url.isFileURL {
            if let data = try? Data(contentsOf: url),
               let cgImage = UIImage(data: data)?.cgImage {
                contents = cgImage
            }
            return
        }

        let loader = imageLoader
        let postMediaId = media.postMediaId
        currentLoadTask = Task { @MainActor [weak self] in
            // (1) Fast-path image cache (composer preview / disk-backed reader).
            if let imageCache,
               let cached = await imageCache.cachedImage(for: postMediaId)?.cgImage {
                guard let self, !Task.isCancelled else { return }
                self.contents = cached
                return
            }
            // (2) Network URL through the disk-cache-backed loader.
            guard let url = resolvedURL else { return }
            let loaded = await loader.image(for: url.absoluteString)
            guard let self,
                  !Task.isCancelled,
                  let cgImage = loaded?.cgImage else { return }
            self.contents = cgImage
        }
    }

    // MARK: - Video path

    @MainActor
    private func configureVideo(_ media: StoryMediaObject,
                                mode: RenderMode,
                                resolver: (@Sendable (String) -> URL?)?) {
        guard let url = resolvedMediaURL(for: media, resolver: resolver) else { return }
        let player = AVPlayer(url: url)
        let playerLayer = AVPlayerLayer(player: player)
        playerLayer.frame = bounds
        playerLayer.videoGravity = .resizeAspectFill
        addSublayer(playerLayer)
        avPlayer = player
        avPlayerLayer = playerLayer

        switch mode {
        case .play:
            // Start playback immediately — `play()` is safe regardless of
            // AVPlayer status (it queues until ready). `preroll(atRate:)`,
            // by contrast, requires `.readyToPlay` and throws
            // NSInvalidArgumentException when the player has just been
            // initialised — bug discovered by ExportEquivalenceTests.
            player.play()
        case .edit:
            player.seek(to: .zero)
        }

        if media.loop {
            player.actionAtItemEnd = .none
            loopObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: player.currentItem,
                queue: .main
            ) { [weak player] _ in
                player?.seek(to: .zero)
                player?.play()
            }
        }
    }
}
