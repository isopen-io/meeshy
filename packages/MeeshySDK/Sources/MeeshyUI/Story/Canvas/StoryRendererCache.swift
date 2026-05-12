import Foundation
import QuartzCore
import CoreGraphics
import MeeshySDK

// MARK: - StoryRendererCache

/// Per-export CALayer reuse cache for `StoryRenderer.render`.
///
/// AVFoundation calls `StoryAVCompositor.startRequest` once per export frame
/// (720× for a 12-second 60-fps slide). Without a cache, every call rebuilds
/// the full CALayer tree from scratch: fresh `StoryTextLayer`s lay out text
/// glyphs, fresh `StoryMediaLayer`s instantiate `AVPlayerLayer`, fresh
/// `StoryStickerLayer`s rasterize SF Symbols. Most of that work is identical
/// across consecutive frames because static items don't change state, and even
/// animated items change only via keyframe interpolation.
///
/// This cache keys CALayer instances by an `ItemSignature` (id + interpolated
/// position/scale/rotation/opacity/visibility at `time`). If the signature
/// matches the previous frame's signature for the same item, the previously
/// built layer is returned unchanged. Otherwise a fresh layer is built via
/// the caller-provided closure and stored.
///
/// Lifecycle: one cache per `StoryAVCompositor` instance, automatically scoped
/// to a single export session. Scoping context (slide id / languages / mode)
/// is enforced by `invalidateIfNeeded(slideId:languages:mode:)`, which flushes
/// the cache when any of those change.
///
/// **Isolation**: only `init()` is `nonisolated` so AVFoundation's nonisolated
/// instantiation of `StoryAVCompositor` (which holds this cache as a stored
/// property default value) compiles. All other methods are MainActor-isolated
/// by MeeshyUI's `defaultIsolation(MainActor)` — they are only ever called
/// from inside `StoryAVCompositor.startRequest`'s `MainActor.assumeIsolated`
/// bridge block, which is itself MainActor context.
///
/// **Thread-safety**: marked `@unchecked Sendable` because the stored
/// dictionary is mutable. The cache is accessed strictly from MainActor (one
/// frame at a time, AVFoundation serialises composition requests), so the
/// lack of a lock is sound.
public final class StoryRendererCache: @unchecked Sendable {

    // MARK: ItemSignature

    /// Render-time fingerprint of a `RenderableItem` at a given timestamp.
    /// Value type, `Hashable` + `Sendable`. Two signatures are equal iff the
    /// item would produce a visually identical CALayer at the captured time —
    /// **for an immutable item**.
    ///
    /// **Limitation by design**: the signature captures only spatial / opacity /
    /// visibility state. It does NOT include text content, fontFamily, fontSize,
    /// backgroundStyle, textBg, sticker emoji, or any other display-content
    /// field. The cache is therefore safe ONLY when the item never mutates
    /// across frames — which is the contract for `StoryAVCompositor`'s frozen
    /// per-export `StorySlide`. Reusing a `StoryRendererCache` instance with
    /// the same item id but mutated content would return the stale layer with
    /// the old content. Live composer / preview surfaces MUST NOT share the
    /// compositor's cache — they pass `cache: nil` to `StoryRenderer.render`.
    public struct ItemSignature: Sendable {
        public nonisolated let id: String
        public nonisolated let position: CGPoint
        public nonisolated let scale: Double
        public nonisolated let rotation: Double
        public nonisolated let opacity: Double
        public nonisolated let visible: Bool

        public nonisolated init(id: String,
                                position: CGPoint,
                                scale: Double,
                                rotation: Double,
                                opacity: Double,
                                visible: Bool) {
            self.id = id
            self.position = position
            self.scale = scale
            self.rotation = rotation
            self.opacity = opacity
            self.visible = visible
        }
    }

    // MARK: State

    /// Mutable cache. Stored as a struct-wrapped pair so the dictionary value
    /// is the layer instance + its signature. CALayer is reference-typed so
    /// the same instance can be returned across frames without copying.
    private var layerCache: [String: CachedLayer] = [:]

    private var lastSlideId: String?
    private var lastLanguages: [String] = []
    private var lastMode: RenderMode?

    /// Number of cache hits since the last `invalidate()`. Read by tests to
    /// confirm consecutive frames actually reuse layers.
    public private(set) var cacheHitCount: Int = 0

    /// Number of cache misses (layer rebuilt) since the last `invalidate()`.
    public private(set) var cacheMissCount: Int = 0

    /// Only entry point usable from nonisolated context — every other member
    /// is MainActor by MeeshyUI's default isolation.
    public nonisolated init() {}

    // MARK: Public API

    /// Returns a CALayer for `item` at `time`. If a cached layer exists whose
    /// signature equals the current signature, returns it unchanged; otherwise
    /// invokes `build(item)` to produce a fresh layer and caches it.
    ///
    /// `languages` is accepted for symmetry with `StoryRenderer.render` and
    /// because text item content depends on it — language changes are handled
    /// at a coarser grain via `invalidateIfNeeded(languages:)`, not encoded in
    /// the signature, so a switch from `["fr"]` to `["en"]` between frames in
    /// the same export is impossible by construction.
    public func layer(for item: any RenderableItem,
                      at time: Double,
                      languages: [String],
                      build: (any RenderableItem) -> CALayer) -> CALayer {
        let sig = Self.makeSignature(for: item, at: time)
        if let cached = layerCache[item.id], cached.signature == sig {
            cacheHitCount += 1
            return cached.layer
        }
        let layer = build(item)
        layerCache[item.id] = CachedLayer(signature: sig, layer: layer)
        cacheMissCount += 1
        return layer
    }

    /// Drops every cached layer + counters + scoping context. The next
    /// `layer(for:...)` call rebuilds every item from scratch.
    public func invalidate() {
        layerCache.removeAll()
        lastSlideId = nil
        lastLanguages = []
        lastMode = nil
        cacheHitCount = 0
        cacheMissCount = 0
    }

    /// Invalidates iff the scoping context (slide id / languages / mode)
    /// differs from the previous render call. Returns `true` when invalidation
    /// happened, so callers can log cache flushes.
    ///
    /// This is the single entry point compositors use at the top of each
    /// `startRequest`. For a single export session the context is stable
    /// across all frames, so this is a no-op after the first frame.
    @discardableResult
    public func invalidateIfNeeded(slideId: String,
                                   languages: [String],
                                   mode: RenderMode) -> Bool {
        if lastSlideId == slideId
            && lastLanguages == languages
            && lastMode == mode {
            return false
        }
        invalidate()
        lastSlideId = slideId
        lastLanguages = languages
        lastMode = mode
        return true
    }

    // MARK: - Signature

    /// Builds the signature of `item` at `time`. Pure function — no UIKit,
    /// no AVPlayer, no allocations beyond the returned struct. MainActor by
    /// default because it reads `RenderableItem` properties (the protocol
    /// inherits MainActor isolation from MeeshyUI's default).
    ///
    /// `position` / `scale` / `opacity` reflect keyframe interpolation when
    /// the item has keyframes; otherwise they fall back to the item's static
    /// `x`/`y`/`scale` fields. `opacity` defaults to `1.0` when the item is
    /// fully opaque (no keyframe opacity track). `visible` mirrors the
    /// `shouldRender` decision in `StoryRenderer` (timing window only — fade
    /// in/out is not yet animated, so it does not influence the signature).
    static func makeSignature(for item: any RenderableItem,
                              at time: Double) -> ItemSignature {
        let overrides = StoryRenderer.applyKeyframes(
            keyframes: keyframes(of: item),
            at: time,
            startTime: item.startTime ?? 0
        )

        let posX: Double = overrides.position.map { Double($0.x) } ?? item.x
        let posY: Double = overrides.position.map { Double($0.y) } ?? item.y
        let scl: Double = overrides.scale ?? item.scale
        let rot: Double = item.rotation
        let opacity: Double = overrides.opacity ?? 1.0
        let visible: Bool = isVisible(item: item, at: time)

        return ItemSignature(
            id: item.id,
            position: CGPoint(x: posX, y: posY),
            scale: scl,
            rotation: rot,
            opacity: opacity,
            visible: visible
        )
    }

    /// Returns the keyframes of `item` if it has any, else an empty array.
    /// Only `StoryTextObject` and `StoryMediaObject` carry keyframes today;
    /// `StorySticker` does not.
    private static func keyframes(of item: any RenderableItem) -> [StoryKeyframe] {
        if let text = item as? StoryTextObject { return text.keyframes ?? [] }
        if let media = item as? StoryMediaObject { return media.keyframes ?? [] }
        return []
    }

    /// Mirrors `StoryRenderer.shouldRender`'s timing-window logic for `.play`
    /// mode. We don't gate on `RenderMode` here because the cache is only
    /// active in `.play` (compositor export); `StoryCanvasUIView` does not use
    /// the cache.
    private static func isVisible(item: any RenderableItem, at time: Double) -> Bool {
        let start = item.startTime ?? 0
        let end = (item.duration.map { start + $0 }) ?? .infinity
        return time >= start && time < end
    }
}

// MARK: - CachedLayer

/// Internal struct pairing a CALayer with its signature. Stored in a private
/// dictionary inside the cache. MainActor by MeeshyUI default isolation —
/// only constructed and read inside MainActor cache methods.
fileprivate struct CachedLayer {
    let signature: StoryRendererCache.ItemSignature
    let layer: CALayer
}

// MARK: - Hashable / Equatable (nonisolated)

/// Split the `Hashable` conformance into a `nonisolated` extension so the
/// synthesised `==` and `hash(into:)` are available even from non-MainActor
/// contexts. The signature is a pure value type; equality doesn't need actor
/// isolation. See feedback_meeshyui_default_isolation.md.
extension StoryRendererCache.ItemSignature: Hashable {
    public nonisolated static func == (lhs: StoryRendererCache.ItemSignature,
                                       rhs: StoryRendererCache.ItemSignature) -> Bool {
        return lhs.id == rhs.id
            && lhs.position == rhs.position
            && lhs.scale == rhs.scale
            && lhs.rotation == rhs.rotation
            && lhs.opacity == rhs.opacity
            && lhs.visible == rhs.visible
    }

    public nonisolated func hash(into hasher: inout Hasher) {
        hasher.combine(id)
        hasher.combine(position.x)
        hasher.combine(position.y)
        hasher.combine(scale)
        hasher.combine(rotation)
        hasher.combine(opacity)
        hasher.combine(visible)
    }
}
