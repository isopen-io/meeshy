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
/// position/scale/rotation/opacity/visibility/languages at `time`). If the
/// signature matches the previous frame's signature for the same item, the
/// previously built layer is returned unchanged. Otherwise a fresh layer is
/// built via the caller-provided closure and stored.
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
    /// visibility state plus the requested `languages` list. It does NOT
    /// include text content, fontFamily, fontSize, backgroundStyle, textBg,
    /// sticker emoji, or any other display-content field. The cache is
    /// therefore safe ONLY when the item never mutates across frames — which
    /// is the contract for `StoryAVCompositor`'s frozen per-export
    /// `StorySlide`. Reusing a `StoryRendererCache` instance with the same
    /// item id but mutated content would return the stale layer with the old
    /// content. Live composer / preview surfaces MUST NOT share the
    /// compositor's cache — they pass `cache: nil` to `StoryRenderer.render`.
    ///
    /// **Languages note**: `languages` is included in the signature so that a
    /// per-frame call to `layer(for:at:languages:build:)` with a different
    /// preferred-language list produces a cache miss and rebuilds the text
    /// layer with the right translation. In practice an export session has a
    /// single language list applied uniformly to every frame
    /// (`invalidateIfNeeded(slideId:languages:mode:)` flushes the whole cache
    /// when the scope changes), but encoding `languages` in the signature is
    /// future-proofing for multilingual export pipelines (e.g. the publish →
    /// exporter wiring) that may issue per-frame language overrides without
    /// flipping the coarse-grained scope. Order is significant — callers MUST
    /// pass languages in a canonical order (highest priority first), which is
    /// already the contract enforced by `resolveUserLanguage()` in shared.
    public struct ItemSignature: Sendable {
        public nonisolated let id: String
        public nonisolated let position: CGPoint
        public nonisolated let scale: Double
        public nonisolated let rotation: Double
        public nonisolated let opacity: Double
        public nonisolated let visible: Bool
        public nonisolated let languages: [String]
        // Content fingerprints — invalident le cache quand le contenu de
        // l'élément change (live composer / canvas reader). Pour le compositor
        // export où l'item est figé pour la session, ces champs restent
        // stables et n'introduisent aucun overhead.
        public nonisolated let mediaPostMediaId: String?
        public nonisolated let textContent: String?
        public nonisolated let stickerEmoji: String?
        /// Empreinte de contenu EXHAUSTIVE (hash de l'encodage JSON complet de
        /// l'élément), fournie par le caller. `nil` pour le compositor export
        /// (items figés — la calculer 60×/s serait du gaspillage) ; non-nil
        /// pour le canvas composer `.edit`, où N'IMPORTE QUEL champ peut muter
        /// à id constant (fontSize, textColor, backgroundStyle, volume…) — la
        /// « Limitation by design » documentée plus haut ne s'applique alors
        /// plus : le cache devient sûr en édition live.
        public nonisolated let contentHash: Int?

        public nonisolated init(id: String,
                                position: CGPoint,
                                scale: Double,
                                rotation: Double,
                                opacity: Double,
                                visible: Bool,
                                languages: [String] = [],
                                mediaPostMediaId: String? = nil,
                                textContent: String? = nil,
                                stickerEmoji: String? = nil,
                                contentHash: Int? = nil) {
            self.id = id
            self.position = position
            self.scale = scale
            self.rotation = rotation
            self.opacity = opacity
            self.visible = visible
            self.languages = languages
            self.mediaPostMediaId = mediaPostMediaId
            self.textContent = textContent
            self.stickerEmoji = stickerEmoji
            self.contentHash = contentHash
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
    private var lastRenderSize: CGSize?

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
    /// `languages` participates in the signature: a call with `["fr"]` and a
    /// subsequent call with `["en"]` for the same item id at the same time
    /// produce different signatures and therefore a cache miss the second
    /// time. This protects future multilingual export pipelines from serving
    /// a stale wrong-language layer when the coarse-grained scope check
    /// (`invalidateIfNeeded(languages:)`) is not flipped between calls.
    /// - Parameters:
    ///   - contentHash: empreinte de contenu exhaustive de l'élément (voir
    ///     `ItemSignature.contentHash`). Passer une valeur en `.edit` rend le
    ///     cache sûr face aux mutations à id constant ; laisser `nil` pour
    ///     l'export (contrat « item figé » historique).
    ///   - reconfigure: sur MISS avec une layer déjà cachée pour cet id, offre
    ///     d'abord la layer existante au caller. Retourner une layer = adoption
    ///     in-place (elle est re-stockée sous la nouvelle signature — chemin
    ///     continuité vidéo : la `StoryMediaLayer` garde son `AVPlayer` à
    ///     travers un changement de géométrie). Retourner `nil` = rebâtir via
    ///     `build`.
    public func layer(for item: any RenderableItem,
                      at time: Double,
                      languages: [String],
                      contentHash: Int? = nil,
                      reconfigure: ((any RenderableItem, CALayer) -> CALayer?)? = nil,
                      build: (any RenderableItem) -> CALayer) -> CALayer {
        let sig = Self.makeSignature(for: item, at: time, languages: languages,
                                     contentHash: contentHash)
        if let cached = layerCache[item.id], cached.signature == sig {
            cacheHitCount += 1
            return cached.layer
        }
        if let cached = layerCache[item.id],
           let adopted = reconfigure?(item, cached.layer) {
            layerCache[item.id] = CachedLayer(signature: sig, layer: adopted)
            cacheMissCount += 1
            return adopted
        }
        let layer = build(item)
        layerCache[item.id] = CachedLayer(signature: sig, layer: layer)
        cacheMissCount += 1
        return layer
    }

    /// Retire toutes les entrées dont `id` n'apparaît pas dans `keepIds`.
    /// Pour un `StoryMediaLayer` retenu (vidéo), pause l'AVPlayer et coupe
    /// la `currentItem` avant le retrait pour libérer proprement les
    /// ressources AVFoundation (sinon le player continue de buffer en
    /// arrière-plan jusqu'au prochain GC).
    ///
    /// Appelé en fin de `rebuildLayers()` côté canvas live pour éviter que
    /// le cache accumule des layers fantômes après suppression d'un élément.
    public func prune(keepIds: Set<String>) {
        let staleIds = layerCache.keys.filter { !keepIds.contains($0) }
        for id in staleIds {
            if let cached = layerCache[id], let media = cached.layer as? StoryMediaLayer {
                media.tearDownPlayback()
            }
            layerCache.removeValue(forKey: id)
        }
    }

    /// Drops every cached layer + counters + scoping context. The next
    /// `layer(for:...)` call rebuilds every item from scratch. Pour chaque
    /// `StoryMediaLayer` libère son AVPlayer avant de drop la référence —
    /// nécessaire pour ne pas laisser un player bufferer en arrière-plan.
    public func invalidate() {
        for cached in layerCache.values {
            if let media = cached.layer as? StoryMediaLayer {
                media.tearDownPlayback()
            }
        }
        layerCache.removeAll()
        lastSlideId = nil
        lastLanguages = []
        lastMode = nil
        lastRenderSize = nil
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
    /// `renderSize` participe au scope quand il est fourni : les layers cachées
    /// sont projetées en render-space (bounds/position en pixels écran), donc
    /// un resize du canvas (fond 16:9 imposé, rotation, split view) doit
    /// flusher — sinon les layers réutilisées gardent la projection de
    /// l'ancienne taille. `nil` (défaut) = non scopé, contrat historique du
    /// compositor export dont la taille est fixe pour la session.
    @discardableResult
    public func invalidateIfNeeded(slideId: String,
                                   languages: [String],
                                   mode: RenderMode,
                                   renderSize: CGSize? = nil) -> Bool {
        if lastSlideId == slideId
            && lastLanguages == languages
            && lastMode == mode
            && (renderSize == nil || lastRenderSize == renderSize) {
            return false
        }
        invalidate()
        lastSlideId = slideId
        lastLanguages = languages
        lastMode = mode
        lastRenderSize = renderSize
        return true
    }

    // MARK: - Signature

    /// Builds the signature of `item` at `time` for the given `languages`.
    /// Pure function — no UIKit, no AVPlayer, no allocations beyond the
    /// returned struct. MainActor by default because it reads
    /// `RenderableItem` properties (the protocol inherits MainActor isolation
    /// from MeeshyUI's default).
    ///
    /// `position` / `scale` / `opacity` reflect keyframe interpolation when
    /// the item has keyframes; otherwise they fall back to the item's static
    /// `x`/`y`/`scale` fields. `opacity` defaults to `1.0` when the item is
    /// fully opaque (no keyframe opacity track). `visible` mirrors the
    /// `shouldRender` decision in `StoryRenderer` (timing window only — fade
    /// in/out is not yet animated, so it does not influence the signature).
    /// `languages` is carried verbatim into the signature so a switch from
    /// `["fr"]` to `["en"]` between two `layer(for:...)` calls produces a
    /// cache miss instead of returning the previous wrong-language layer.
    static func makeSignature(for item: any RenderableItem,
                              at time: Double,
                              languages: [String],
                              contentHash: Int? = nil) -> ItemSignature {
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

        // Empreinte de contenu — n'a d'effet que pour le canvas live, où le
        // model peut muter à id constant. Le compositor export ne mute pas
        // l'item, ces champs restent identiques d'une frame à l'autre.
        var mediaPostMediaId: String?
        var textContent: String?
        var stickerEmoji: String?
        if let media = item as? StoryMediaObject {
            mediaPostMediaId = media.postMediaId
        } else if let text = item as? StoryTextObject {
            textContent = text.text
        } else if let sticker = item as? StorySticker {
            stickerEmoji = sticker.emoji
        }

        return ItemSignature(
            id: item.id,
            position: CGPoint(x: posX, y: posY),
            scale: scl,
            rotation: rot,
            opacity: opacity,
            visible: visible,
            languages: languages,
            mediaPostMediaId: mediaPostMediaId,
            textContent: textContent,
            stickerEmoji: stickerEmoji,
            contentHash: contentHash
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
            && lhs.languages == rhs.languages
            && lhs.mediaPostMediaId == rhs.mediaPostMediaId
            && lhs.textContent == rhs.textContent
            && lhs.stickerEmoji == rhs.stickerEmoji
            && lhs.contentHash == rhs.contentHash
    }

    public nonisolated func hash(into hasher: inout Hasher) {
        hasher.combine(id)
        hasher.combine(position.x)
        hasher.combine(position.y)
        hasher.combine(scale)
        hasher.combine(rotation)
        hasher.combine(opacity)
        hasher.combine(visible)
        hasher.combine(languages)
        hasher.combine(mediaPostMediaId)
        hasher.combine(textContent)
        hasher.combine(stickerEmoji)
        hasher.combine(contentHash)
    }
}
