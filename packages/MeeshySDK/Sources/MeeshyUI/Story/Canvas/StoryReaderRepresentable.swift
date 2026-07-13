import SwiftUI
import UIKit
import CoreMedia
import MeeshySDK

/// SwiftUI drop-in surface for the story reader.
/// Wraps `StoryCanvasUIView` in mode `.play` with the runtime context needed
/// for Prisme Linguistique, audio, completion timing, and image cache.
///
/// Three initializers cover the full call-site matrix:
/// - `init(story:)` — primary path from `StoryItem` (feed / viewer)
/// - `init(repost:)` — feed embed / repost preview from `RepostContent`
/// - `init(post:)` — `APIPost`-backed story (feed contexts)
public struct StoryReaderRepresentable: UIViewRepresentable {

    // Internal state accessed by tests via `internal(set)` so that the two
    // property assertions in `StoryReaderRepresentableInitsTests` compile.
    let storyItem: StoryItem
    public internal(set) var preferredLanguages: [String]
    public internal(set) var mute: Bool
    /// Drives `StoryCanvasUIView.setPaused(_:)` — gels la timeline canvas
    /// (displayLink + AVPlayer + audioMixer) en phase avec la progress bar
    /// du viewer parent. Sans ça, ouvrir un sheet pendant la lecture laissait
    /// `lastPlaybackTime` avancer dans le vide → saut visible au resume.
    /// Drivé depuis `shouldPauseTimer` du viewer.
    public internal(set) var isPaused: Bool
    /// `true` quand cette représentable est utilisée comme calque sortant
    /// (`outgoingStory` dans `StoryCardView`) pendant un cross-fade. Force le
    /// canvas à monter en `.edit` mode dès `makeUIView` — ses AVPlayer bg /
    /// FG et son audio mixer ne démarrent JAMAIS, supprimant la double-lecture
    /// 350-400 ms pendant la transition (user 2026-05-28).
    ///
    /// Visuellement, le slide affiche son image bg + ses textes/stickers
    /// rendus par `rebuildLayers()` mais les vidéos sont figées frame 0. C'est
    /// suffisant pour un cross-fade d'animation : le canvas sort en opacity 0
    /// avant qu'on perçoive l'absence de mouvement vidéo.
    public internal(set) var isOutgoing: Bool
    /// Stored as `@Sendable` so it can be forwarded into `StoryReaderContext`
    /// which requires `@Sendable () -> Void`. Call-sites supply a plain `() -> Void`
    /// which Swift coerces automatically when the closure itself has no captures
    /// that prevent Sendability.
    let onCompletion: (@Sendable () -> Void)?
    /// Fires exactly once per `rebuildLayers()` cycle when the slide's background
    /// media is fully usable (real bitmap replaced the thumbhash placeholder,
    /// video reached `.readyToPlay`, or solid-color/gradient — immediate).
    /// Used by the viewer to gate the slide progress timer and a loading spinner.
    let onContentReady: (() -> Void)?

    /// Fraction `[0, 1]` du contenu de la slide disponible localement.
    /// Émis à chaque transition d'état d'asset (background ready, KVO video
    /// foreground, etc.). Permet de piloter un overlay loader granulaire
    /// (`StoryReaderLoadingOverlay`) qui fade out au-delà du seuil 20 %.
    let onContentProgress: ((Double) -> Void)?

    /// Position de lecture (secondes) émise par le displayLink interne du
    /// canvas à ~60 Hz. Source de vérité pour piloter la progress bar du
    /// viewer parent en sync EXACTE avec la timeline (vidéo BG + audio +
    /// keyframes). Aligné sur `slide.computedTotalDuration()` qui inclut
    /// le roundup des cycles bg → la transition n'interrompt jamais un
    /// loop mid-cycle.
    let onPlaybackTime: ((Double) -> Void)?

    /// `true`/`false` quand la lecture du média primaire de la slide
    /// progresse / stalle (buffer). Le viewer câble ça sur
    /// `StoryReaderTimerController.setPlaybackStalled(!progressing)` pour la
    /// timeline unifiée (progress bar + auto-advance gelés en phase avec la
    /// lecture). No-op pour les slides sans vidéo primaire.
    let onPlaybackProgressing: ((Bool) -> Void)?

    /// Locally-loaded assets handed in by the composer "Preview" path for a
    /// story whose media has not been uploaded yet. Keyed by media id.
    /// `preloadedImages` are in-memory bitmaps (e.g. from `PhotosPicker`);
    /// `preloadedVideoURLs` / `preloadedAudioURLs` are `file://` URLs.
    /// These are consumed by `makeUIView` so the canvas — which resolves media
    /// strictly through `StoryReaderContext.postMediaURLResolver` /
    /// `imageCache` — can render assets that have no usable remote URL yet.
    let preloadedImages: [String: UIImage]
    let preloadedVideoURLs: [String: URL]
    let preloadedAudioURLs: [String: URL]

    // MARK: - Primary init

    public init(story: StoryItem,
                preferredLanguage: String? = nil,
                preferredLanguages: [String] = [],
                preferredContentLanguages: [String]? = nil,
                preloadedImages: [String: UIImage] = [:],
                preloadedVideoURLs: [String: URL] = [:],
                preloadedAudioURLs: [String: URL] = [:],
                mute: Bool = false,
                isPaused: Bool = false,
                isOutgoing: Bool = false,
                onCompletion: (@Sendable () -> Void)? = nil,
                onContentReady: (() -> Void)? = nil,
                onContentProgress: ((Double) -> Void)? = nil,
                onPlaybackTime: ((Double) -> Void)? = nil,
                onPlaybackProgressing: ((Bool) -> Void)? = nil) {
        self.storyItem = story
        // `preferredContentLanguages` is the legacy label; it takes priority over
        // `preferredLanguages` when provided so existing call-sites compile unchanged.
        let effective = preferredContentLanguages ?? preferredLanguages
        let chain: [String] = effective.isEmpty
            ? (preferredLanguage.map { [$0] } ?? [])
            : effective
        self.preferredLanguages = chain
        self.mute = mute
        self.isPaused = isPaused
        self.isOutgoing = isOutgoing
        self.onCompletion = onCompletion
        self.onContentReady = onContentReady
        self.onContentProgress = onContentProgress
        self.onPlaybackTime = onPlaybackTime
        self.onPlaybackProgressing = onPlaybackProgressing
        self.preloadedImages = preloadedImages
        self.preloadedVideoURLs = preloadedVideoURLs
        self.preloadedAudioURLs = preloadedAudioURLs
    }

    // MARK: - UIViewRepresentable

    public func makeUIView(context: Context) -> StoryCanvasUIView {
        let slide = storyItem.toRenderableSlide(preferredLanguages: preferredLanguages)
        // Outgoing canvas (cross-fade sortant) doit naître en `.edit` pour ne
        // jamais démarrer ses médias — sinon les bg/FG AVPlayer + audio mixer
        // jouent en double avec le canvas visible 350-400 ms le temps de
        // l'anim (user 2026-05-28 « les média jouent en double / s'entrevauche »).
        let initialMode: RenderMode = isOutgoing ? .edit : .play
        let view = StoryCanvasUIView(slide: slide, mode: initialMode)
        let mediaList = storyItem.media
        let completion = onCompletion
        let contentReady = onContentReady

        // Preloaded composer assets. `preloadedImages` are in-memory bitmaps
        // (non-`Sendable`), so we persist them to temp `file://` URLs ONCE here
        // — URLs are `Sendable`, which lets both the resolver closure and the
        // `ImageCacheReader` capture them without crossing Swift 6 strict
        // concurrency. `makeUIView` runs once per representable instance, so
        // the writes happen exactly once.
        let videoURLs = preloadedVideoURLs
        let audioURLs = preloadedAudioURLs
        let imageURLs = Self.persistPreloadedImages(preloadedImages)

        // Resolver: preloaded local assets take priority (composer preview),
        // then fall through to the published `StoryItem.media` remote URLs so
        // the live viewer behaves identically when the preloaded dicts are empty.
        let resolver: @Sendable (String) -> URL? = { postId in
            if let local = videoURLs[postId] ?? audioURLs[postId] ?? imageURLs[postId] {
                return local
            }
            return mediaList.first { $0.id == postId }
                     .flatMap { $0.url.flatMap(URL.init(string:)) }
        }

        // The background-image branch of `StoryBackgroundLayer.configure`
        // only consults the resolver when `imageCache` is non-nil. Supply a
        // file-backed cache reader so preloaded images reach the resolver path;
        // it stays `nil` when no images were preloaded so the live viewer is
        // unaffected.
        let imageCache: ImageCacheReader? = imageURLs.isEmpty
            ? nil
            : PreloadedImageCacheReader(fileURLs: imageURLs)

        view.onContentReady = { contentReady?() }
        let progress = onContentProgress
        view.onContentProgress = { value in progress?(value) }
        let playback = onPlaybackTime
        view.onPlaybackTime = { t in playback?(t) }
        let progressing = onPlaybackProgressing
        view.onPlaybackProgressing = { p in progressing?(p) }
        view.setReaderContext(StoryReaderContext(
            preferredLanguages: preferredLanguages,
            mute: mute,
            onCompletion: completion,
            postMediaURLResolver: resolver,
            imageCache: imageCache
        ))
        return view
    }

    /// Writes each preloaded `UIImage` to a unique temp `file://` URL and
    /// returns a `[mediaId: URL]` map. PNG keeps the bitmap lossless (composer
    /// previews may include transparency). Images that fail to encode are
    /// silently dropped — the resolver then falls back to the remote lookup.
    private static func persistPreloadedImages(_ images: [String: UIImage]) -> [String: URL] {
        guard !images.isEmpty else { return [:] }
        let dir = FileManager.default.temporaryDirectory
        var result: [String: URL] = [:]
        for (mediaId, image) in images {
            guard let data = image.pngData() else { continue }
            let url = dir.appendingPathComponent("story-preview-\(UUID().uuidString).png")
            guard (try? data.write(to: url, options: .atomic)) != nil else { continue }
            result[mediaId] = url
        }
        return result
    }

    public func updateUIView(_ view: StoryCanvasUIView, context: Context) {
        let newSlide = storyItem.toRenderableSlide(preferredLanguages: preferredLanguages)
        let identityChanged = newSlide.id != view.slide.id
        if identityChanged || newSlide.content != view.slide.content {
            view.slide = newSlide
        }
        if identityChanged && !isOutgoing {
            // Reset défensif de la timeline canvas quand l'id slide change :
            // garantit que `currentTime` redémarre à zéro EN PHASE avec
            // `lastPlaybackTime = 0` côté viewer (cf. `startTimer()`). Sans ça,
            // un canvas dont l'identité change (rare avec SwiftUI `.id(story.id)`
            // qui teardown + makeUIView, mais possible si on factorise le
            // representable à une instance long-lived plus tard) pourrait
            // démarrer la slide N+1 avec le `currentTime` résiduel de la slide N.
            //
            // Skip pour outgoing : le canvas reste en `.edit` et son média
            // reste figé jusqu'à ce que SwiftUI détruise la vue.
            view.setMode(.play, time: .zero)
        }
        // Pause synchronisée avec le viewer : sheets, composer, drag, long-press.
        // `setPaused` est idempotent côté canvas. Pour outgoing, le canvas est
        // en `.edit` donc `setPaused` est no-op (gate `guard mode == .play`)
        // — mais on l'appelle quand même pour préserver le contrat idempotent.
        view.setPaused(isPaused || isOutgoing)
    }
}

// MARK: - Convenience inits

extension StoryReaderRepresentable {

    /// Construct from a `RepostContent` (feed embed, repost preview).
    /// Synthesizes a `StoryItem` from the repost's media + effects.
    /// `isPaused` is driven by the host (e.g. PostDetailView) for the SAME
    /// viewport-visibility + call-aware pausing as the native story canvas — a
    /// muted feed embed leaves it `false`; an unmuted detail embed must forward it.
    public init(repost: RepostContent,
                preferredContentLanguages: [String]? = nil,
                mute: Bool = false,
                isPaused: Bool = false,
                onCompletion: (@Sendable () -> Void)? = nil) {
        let synthetic = StoryItem(
            id: repost.id,
            content: repost.content,
            media: repost.media,
            storyEffects: repost.storyEffects,
            createdAt: repost.timestamp,
            expiresAt: repost.expiresAt,
            isViewed: false
        )
        self.init(story: synthetic,
                  preferredLanguages: preferredContentLanguages ?? [],
                  mute: mute,
                  isPaused: isPaused,
                  onCompletion: onCompletion,
                  onContentReady: nil,
                  onContentProgress: nil)
    }

    /// Construct from an `APIPost` (used in feed contexts where stories arrive
    /// as posts). Converts `APIPostMedia` → `FeedMedia` inline.
    public init(post: APIPost,
                preferredLanguage: String? = nil,
                preferredLanguages: [String] = [],
                mute: Bool = false,
                onCompletion: (@Sendable () -> Void)? = nil) {
        let feedMedia: [FeedMedia] = (post.media ?? []).map { m in
            FeedMedia(
                id: m.id,
                type: m.mediaType,
                url: m.fileUrl,
                thumbnailUrl: m.thumbnailUrl,
                thumbHash: m.thumbHash,
                thumbnailColor: Self.thumbnailColor(for: m.mimeType),
                width: m.width,
                height: m.height,
                duration: m.duration.map { $0 / 1000 },
                fileName: m.originalName ?? m.fileName
            )
        }
        let synthetic = StoryItem(
            id: post.id,
            content: post.content,
            media: feedMedia,
            storyEffects: post.storyEffects,
            createdAt: post.createdAt,
            expiresAt: post.expiresAt,
            isViewed: post.isViewedByMe ?? false
        )
        let chain = preferredLanguages.isEmpty
            ? (preferredLanguage.map { [$0] } ?? [])
            : preferredLanguages
        self.init(story: synthetic,
                  preferredLanguages: chain,
                  mute: mute,
                  onCompletion: onCompletion,
                  onContentReady: nil,
                  onContentProgress: nil)
    }

    // MARK: - Private helpers

    private static func thumbnailColor(for mimeType: String?) -> String {
        // Defers to `AttachmentKind.hexTintColor` (MeeshySDK) — the single
        // source of truth for the attachment palette. Same call used by
        // `PostModels.thumbnailColorForMime`.
        AttachmentKind(mimeType: mimeType ?? "").hexTintColor
    }
}

// MARK: - Preloaded image cache

/// `ImageCacheReader` backed by composer-preloaded images that were persisted
/// to temp `file://` URLs by `StoryReaderRepresentable.persistPreloadedImages`.
///
/// Only a `[String: URL]` is captured — `URL` is `Sendable`, so the struct is
/// trivially `Sendable` and sidesteps the fact that `UIImage` is not. The
/// background image layer calls `cachedImage(for:)` with the media id; we
/// decode the matching temp file lazily on first lookup.
struct PreloadedImageCacheReader: ImageCacheReader {
    let fileURLs: [String: URL]

    func cachedImage(for key: String) async -> UIImage? {
        guard let url = fileURLs[key],
              let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
    }
}
