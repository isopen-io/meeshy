import SwiftUI
import UIKit
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

    // MARK: - Primary init

    public init(story: StoryItem,
                preferredLanguage: String? = nil,
                preferredLanguages: [String] = [],
                preferredContentLanguages: [String]? = nil,
                preloadedImages: [String: UIImage] = [:],
                preloadedVideoURLs: [String: URL] = [:],
                preloadedAudioURLs: [String: URL] = [:],
                mute: Bool = false,
                onCompletion: (@Sendable () -> Void)? = nil,
                onContentReady: (() -> Void)? = nil) {
        self.storyItem = story
        // `preferredContentLanguages` is the legacy label; it takes priority over
        // `preferredLanguages` when provided so existing call-sites compile unchanged.
        let effective = preferredContentLanguages ?? preferredLanguages
        let chain: [String] = effective.isEmpty
            ? (preferredLanguage.map { [$0] } ?? [])
            : effective
        self.preferredLanguages = chain
        self.mute = mute
        self.onCompletion = onCompletion
        self.onContentReady = onContentReady
        // preloadedImages / preloadedVideoURLs / preloadedAudioURLs are accepted for
        // call-site backward-compat but intentionally unused — the new canvas resolves
        // media from StoryItem.media and StoryReaderContext.postMediaURLResolver.
    }

    // MARK: - UIViewRepresentable

    public func makeUIView(context: Context) -> StoryCanvasUIView {
        let slide = storyItem.toRenderableSlide(preferredLanguages: preferredLanguages)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        let mediaList = storyItem.media
        let completion = onCompletion
        let contentReady = onContentReady
        let resolver: @Sendable (String) -> URL? = { postId in
            mediaList.first { $0.id == postId }
                     .flatMap { $0.url.flatMap(URL.init(string:)) }
        }
        view.onContentReady = { contentReady?() }
        view.setReaderContext(StoryReaderContext(
            preferredLanguages: preferredLanguages,
            mute: mute,
            onCompletion: completion,
            postMediaURLResolver: resolver,
            imageCache: nil
        ))
        return view
    }

    public func updateUIView(_ view: StoryCanvasUIView, context: Context) {
        let newSlide = storyItem.toRenderableSlide(preferredLanguages: preferredLanguages)
        if newSlide.id != view.slide.id || newSlide.content != view.slide.content {
            view.slide = newSlide
        }
    }
}

// MARK: - Convenience inits

extension StoryReaderRepresentable {

    /// Construct from a `RepostContent` (feed embed, repost preview).
    /// Synthesizes a `StoryItem` from the repost's media + effects.
    public init(repost: RepostContent,
                preferredContentLanguages: [String]? = nil,
                mute: Bool = false,
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
                  onCompletion: onCompletion,
                  onContentReady: nil)
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
                  onContentReady: nil)
    }

    // MARK: - Private helpers

    private static func thumbnailColor(for mimeType: String?) -> String {
        guard let mime = mimeType else { return "4ECDC4" }
        if mime.hasPrefix("video/") { return "FF6B6B" }
        if mime.hasPrefix("audio/") { return "9B59B6" }
        if mime.hasPrefix("application/") { return "F8B500" }
        return "4ECDC4"
    }
}
