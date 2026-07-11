import Foundation
import QuartzCore
import CoreMedia
import Metal
import PencilKit
import UIKit
import MeeshySDK

// MARK: - RenderMode

public enum RenderMode: Sendable {
    /// All items always visible. Gestures active. ProMotion 120 Hz.
    case edit
    /// Items respect timing windows (startTime, duration, fadeIn/fadeOut). 60 Hz.
    case play
}

// `Equatable` conformance is provided in a `nonisolated` extension so the
// synthesised `==` is callable from the compositor's worker-thread context
// (`StoryRendererCache.invalidateIfNeeded`) without crossing actor boundaries.
// Under MeeshyUI's `defaultIsolation(MainActor)`, the default synthesised
// conformance would otherwise be MainActor-isolated.
extension RenderMode: Equatable {
    public nonisolated static func == (lhs: RenderMode, rhs: RenderMode) -> Bool {
        switch (lhs, rhs) {
        case (.edit, .edit), (.play, .play): return true
        default: return false
        }
    }
}

// MARK: - RenderableItem

/// Common contract for any item drawn into the Story canvas.
///
/// Anchor lives in normalized [0,1] space and is a `CGPoint` (not SwiftUI `UnitPoint`)
/// because the storage type lives in the MeeshySDK target which forbids SwiftUI imports
/// (dual-target rule, see packages/MeeshySDK/CLAUDE.md).
public protocol RenderableItem {
    var id: String { get }
    var x: Double { get }
    var y: Double { get }
    var scale: Double { get }
    var rotation: Double { get }
    var zIndex: Int { get }
    var anchor: CGPoint { get }
    var startTime: Double? { get }
    var duration: Double? { get }
    var fadeIn: Double? { get }
    var fadeOut: Double? { get }
}

extension StoryTextObject: RenderableItem {}
extension StoryMediaObject: RenderableItem {}
extension StorySticker: RenderableItem {}

extension RenderableItem {
    /// A static item has no timing windows, no fades, no keyframes — its rendered
    /// representation never changes during a slide, so it's a good rasterization
    /// candidate during `.play`.
    public var isStatic: Bool {
        startTime == nil && duration == nil && fadeIn == nil && fadeOut == nil
    }
}

// MARK: - StoryRenderer

/// Single source of rendering for the Story canvas. Called by:
/// - `StoryCanvasUIView` (live render in composer/viewer)
/// - `StoryAVCompositor` (per-frame export — Phase 4)
/// - Snapshot tests (Phase 0/2)
public enum StoryRenderer {

    /// Renders a slide into a fresh CALayer tree fitting the given canvas geometry, at the given time.
    ///
    /// - Parameters:
    ///   - slide: The slide whose effects will be drawn.
    ///   - geometry: The target canvas dimensions (drives design→render scaling).
    ///   - time: The current playback time (used in `.play` mode for timing windows).
    ///   - mode: `.edit` shows everything, `.play` respects startTime/duration.
    ///   - languages: Preferred languages for Prisme Linguistique text resolution (`.play` only).
    ///     In `.edit` mode, the raw source text is always displayed regardless of this parameter.
    ///     Defaults to `[]` for backward compat with existing call sites.
    ///   - cache: Optional per-export layer-tree cache (`StoryAVCompositor` opt-in).
    ///     When non-nil, item layers whose render signature matches the previous
    ///     frame are reused as-is instead of rebuilt. Defaults to `nil` for the
    ///     live composer/viewer canvas which rebuilds every layer each call.
    ///   - contentsScale: Pixel density applied to the root layer and to the
    ///     persisted-drawing rasterization. Live composer/viewer leaves this at
    ///     the device default (`UIScreen.main.scale`) so the on-screen canvas
    ///     stays crisp. Export callers (`StoryAVCompositor`) MUST pass `1.0` so
    ///     the rendered pixel buffer matches the design-space resolution
    ///     (1080×1920) and does not get upsampled to 3× on devices with a 3×
    ///     screen scale.
    /// - Returns: A root `CALayer` whose sublayers represent the slide's items.
    /// Optional closure that the caller (live composer or AVFoundation compositor)
    /// supplies to feed glass-background text layers a Metal texture snapshot of
    /// the canvas region beneath them. Receives the layer's frame in render
    /// coordinates and returns the cropped backdrop, or `nil` to fall back to the
    /// `CAFilter` blur path inside `StoryGlassBackdropLayer`. See spec
    /// `docs/superpowers/specs/2026-05-12-story-glass-backdrop-snapshot-design.md`.
    public typealias BackdropProvider = (CGRect) -> MTLTexture?

    @MainActor
    public static func render(slide: StorySlide,
                              into geometry: CanvasGeometry,
                              at time: CMTime,
                              mode: RenderMode,
                              languages: [String] = [],
                              resolver: (@Sendable (String) -> URL?)? = nil,
                              imageCache: ImageCacheReader? = nil,
                              cache: StoryRendererCache? = nil,
                              backdropProvider: BackdropProvider? = nil,
                              contentsScale: CGFloat = UIScreen.main.scale,
                              suppressDrawingOverlay: Bool = false) -> CALayer {
        let root = CALayer()
        root.frame = CGRect(origin: .zero, size: geometry.renderSize)
        root.anchorPoint = CGPoint(x: 0, y: 0)
        root.contentsScale = contentsScale

        let allItems = collectItems(from: slide)
        for item in allItems.sorted(by: { $0.zIndex < $1.zIndex }) {
            guard shouldRender(item: item, at: time, mode: mode) else { continue }
            let layer: CALayer
            if let cache {
                // The build closure inherits MainActor isolation from the
                // enclosing @MainActor `render` function (MeeshyUI's
                // defaultIsolation), and `cache.layer(for:...)` is itself
                // MainActor — no actor hop, no Sendable requirement on the
                // CALayer return.
                //
                // Mode `.edit` (canvas composer live) : deux extensions rendent
                // le cache SÛR et CONTINU en édition (impératif user 2026-07-11
                // « manipuler un élément ne doit pas faire sauter les vidéos ») :
                // 1. `contentHash` — empreinte JSON exhaustive de l'élément :
                //    toute mutation à id constant (fontSize, textColor, volume…)
                //    invalide SA layer et elle seule ; les éléments intouchés
                //    (vidéos en lecture !) gardent la leur, AVPlayer compris.
                // 2. `reconfigure` — un changement de GÉOMÉTRIE sur un média
                //    réutilise la `StoryMediaLayer` existante via `configure`
                //    (idempotent côté playback : `attachPlayer` conserve le
                //    player à URL constante) au lieu de la rebâtir.
                // En `.play` (compositor export / reader) les deux restent
                // désactivés — comportement historique, items figés.
                let contentHash: Int? = (mode == .edit) ? editContentHash(for: item) : nil
                let mediaReconfigure: ((any RenderableItem, CALayer) -> CALayer?)? =
                    (mode == .edit)
                    ? { rebuiltItem, existing in
                        guard let media = rebuiltItem as? StoryMediaObject,
                              let mediaLayer = existing as? StoryMediaLayer else { return nil }
                        mediaLayer.configure(with: media,
                                             geometry: geometry,
                                             mode: mode,
                                             resolver: resolver,
                                             imageCache: imageCache)
                        return mediaLayer
                    }
                    : nil
                layer = cache.layer(for: item, at: time.seconds, languages: languages,
                                    contentHash: contentHash,
                                    reconfigure: mediaReconfigure) { rebuiltItem in
                    renderItem(rebuiltItem,
                               into: geometry,
                               at: time,
                               mode: mode,
                               languages: languages,
                               resolver: resolver,
                               imageCache: imageCache)
                }
            } else {
                layer = renderItem(item,
                                   into: geometry,
                                   at: time,
                                   mode: mode,
                                   languages: languages,
                                   resolver: resolver,
                                   imageCache: imageCache)
            }

            // Feed glass-style text layers with a backdrop snapshot when the
            // caller supplies a provider. The provider receives the layer's
            // frame in render space so it can crop its canvas-wide snapshot.
            // Falls back to the `CAFilter` path inside StoryGlassBackdropLayer
            // when provider is nil or returns nil for this region.
            if let provider = backdropProvider,
               let textLayer = layer as? StoryTextLayer,
               let text = item as? StoryTextObject,
               case .glass = text.resolvedBackgroundStyle {
                if let backdrop = provider(layer.frame) {
                    textLayer.setBackdropTexture(backdrop)
                }
            }

            // R14 — crossfade intra-slide (`clipTransitions`) au playback :
            // opacité ABSOLUE posée en POST-PASSE par tick, HORS ItemSignature
            // (l'y intégrer invaliderait le cache à chaque frame de transition
            // → rebuild du layer complet, re-création d'AVPlayer pour les
            // clips vidéo). Pour un média IMPLIQUÉ dans une transition on
            // repose TOUJOURS base × facteur — jamais de multiplication en
            // place (le layer caché garde l'opacité du tick précédent) et le
            // facteur 1.0 hors fenêtre restaure la base. Base fidèle à l'ordre
            // du build : fade envelope (écrase) > opacité keyframes > 1.
            //
            // C1 — la même post-passe couvre les médias foreground porteurs
            // d'une enveloppe fadeIn/fadeOut SANS clipTransition : l'enveloppe
            // n'entre pas dans l'ItemSignature (même raison que le facteur de
            // transition), donc l'appliquer seulement au build figerait
            // l'opacité du tick de construction sur le layer caché.
            if mode == .play, let media = item as? StoryMediaObject {
                let transitions = slide.effects.clipTransitions ?? []
                let isTransitioning = transitions.contains {
                    $0.fromClipId == media.id || $0.toClipId == media.id
                }
                let fade = fadeOpacity(item: media, at: time.seconds)
                if isTransitioning || fade != nil {
                    let factor: Float = isTransitioning
                        ? ReaderTransitionResolver.opacity(
                            for: media,
                            transitions: transitions,
                            currentTime: Float(time.seconds)
                        )
                        : 1.0
                    let kfOverrides = applyKeyframes(
                        keyframes: media.keyframes ?? [],
                        at: time.seconds,
                        startTime: media.startTime ?? 0
                    )
                    let base = fade ?? kfOverrides.opacity ?? 1.0
                    layer.opacity = Float(base * Double(factor))
                }
            }

            // A cached layer might still be attached to the previous frame's
            // root layer. addSublayer auto-detaches before re-attaching, so
            // this is safe and cheap (CALayer parenting is O(1) bookkeeping).
            root.addSublayer(layer)
        }

        // Phase 3 Task 3.4 — render persisted PKDrawing as a single overlay
        // layer above the items (zPosition 9999). The drawing is authored on
        // the design canvas (1080×1920) and projected to the render size by
        // PKDrawing.image(from:scale:).
        //
        // `suppressDrawingOverlay` est levé par le composer quand le
        // `DrawingOverlayView` (PKCanvasView SwiftUI) est actif : sinon on
        // rend DEUX dessins simultanément — celui du modèle persisté ici, et
        // celui live du PKCanvasView au-dessus, désalignés car dans des
        // coordinate spaces différents (bounds SwiftUI vs design 1080x1920).
        // Symptôme user-reporté 2026-05-27 : "écrit en double sur le canvas
        // et c'est la version miniature (= persistée) qui est préservée, pas
        // là où j'ai écrit (= live overlay)".
        // Bridge dessin (refonte 2026-05-30) : on privilégie le format moderne
        // `drawingStrokes` (traits éditables) rasterisé par `StoryStrokeRasterizer`,
        // et on retombe sur le legacy `drawingData` (PKDrawing) seulement quand aucun
        // trait moderne n'est présent (stories publiées avant la refonte non encore
        // migrées en base — la migration au decode peuple `drawingStrokes`, donc ce
        // fallback ne sert qu'aux payloads jamais re-décodés côté client).
        if !suppressDrawingOverlay,
           let drawingImage = bakedDrawingImage(for: slide.effects, scale: contentsScale) {
            let drawingLayer = CALayer()
            drawingLayer.frame = CGRect(origin: .zero, size: geometry.renderSize)
            drawingLayer.contents = drawingImage.cgImage
            drawingLayer.contentsScale = contentsScale
            drawingLayer.zPosition = 9999
            root.addSublayer(drawingLayer)
        }

        return root
    }

    // MARK: - Private

    /// Empreinte de contenu exhaustive d'un élément pour le cache de layers en
    /// mode `.edit` : hash de l'encodage JSON stable (`.sortedKeys`) du type
    /// concret. Capture TOUT champ Codable — y compris ceux que l'ancienne
    /// `ItemSignature` ignorait par contrat (fontSize, textColor,
    /// backgroundStyle, volume, zIndex…). Un échec d'encodage (impossible en
    /// pratique pour ces structs Codable) retourne un hash unique par appel
    /// pour forcer le rebuild plutôt que servir une layer périmée.
    @MainActor
    private static func editContentHash(for item: any RenderableItem) -> Int {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data: Data?
        if let text = item as? StoryTextObject {
            data = try? encoder.encode(text)
        } else if let media = item as? StoryMediaObject {
            data = try? encoder.encode(media)
        } else if let sticker = item as? StorySticker {
            data = try? encoder.encode(sticker)
        } else {
            data = nil
        }
        guard let data else {
            var fallback = Hasher()
            fallback.combine(UUID())
            return fallback.finalize()
        }
        var hasher = Hasher()
        hasher.combine(data)
        return hasher.finalize()
    }

    /// Bake du dessin d'un slide en image (espace design 1080×1920). Privilégie
    /// `drawingStrokes` (moderne, rasterisé) ; fallback `drawingData` (legacy PKDrawing).
    /// Retourne `nil` si le slide n'a aucun dessin.
    private static func bakedDrawingImage(for effects: StoryEffects, scale: CGFloat) -> UIImage? {
        if let strokes = effects.drawingStrokes, !strokes.isEmpty {
            return StoryStrokeRasterizer.image(strokes: strokes,
                                               designSize: CanvasGeometry.designSize,
                                               scale: scale)
        }
        if let data = effects.drawingData, let drawing = try? PKDrawing(data: data) {
            return drawing.image(
                from: CGRect(origin: .zero, size: CanvasGeometry.designSize),
                scale: scale
            )
        }
        return nil
    }

    private static func collectItems(from slide: StorySlide) -> [any RenderableItem] {
        var items: [any RenderableItem] = []
        items.append(contentsOf: slide.effects.textObjects)
        // Les medias `isBackground == true` sont pris en charge par le
        // `StoryBackgroundLayer` (fill du canvas via `resizeAspectFill`). On
        // les filtre ici sinon ils étaient rendus DEUX FOIS : une en bg layer
        // (fond plein) ET une comme item de premier plan centré (effet "image
        // au centre du noir" décrit par l'utilisateur).
        let foregroundMedias = (slide.effects.mediaObjects ?? []).filter { $0.isBackground == false }
        items.append(contentsOf: foregroundMedias)
        items.append(contentsOf: slide.effects.stickerObjects ?? [])
        return items
    }

    @MainActor
    private static func shouldRender(item: any RenderableItem, at time: CMTime, mode: RenderMode) -> Bool {
        guard mode == .play else { return true }
        let t = CMTimeGetSeconds(time)
        let start = item.startTime ?? 0
        let end = (item.duration.map { start + $0 }) ?? .infinity
        // Reduce Motion compliance: this gate is intentionally a sharp on/off
        // visibility check (not an animated fade). The smooth fade interpolation
        // lives in `fadeOpacity(item:at:)` applied in `renderItem` — that
        // computes a snapshot opacity at the current frame, not a continuous
        // CAAnimation, so it is already "reduce-motion safe": opacity changes
        // are tied to the playhead, not to a runtime-animated transition.
        return t >= start && t < end
    }

    @MainActor
    private static func renderItem(_ item: any RenderableItem,
                                   into geometry: CanvasGeometry,
                                   at time: CMTime,
                                   mode: RenderMode,
                                   languages: [String] = [],
                                   resolver: (@Sendable (String) -> URL?)? = nil,
                                   imageCache: ImageCacheReader? = nil) -> CALayer {
        if let media = item as? StoryMediaObject {
            let layer = StoryMediaLayer()
            layer.configure(with: media,
                            geometry: geometry,
                            mode: mode,
                            resolver: resolver,
                            imageCache: imageCache)
            // Keyframe overrides for media objects (position, scale, opacity)
            if mode == .play, let kfs = media.keyframes, !kfs.isEmpty {
                applyKeyframeOverrides(kfs,
                                       startTime: media.startTime ?? 0,
                                       at: time.seconds,
                                       geometry: geometry,
                                       into: layer)
            }
            return layer
        }
        if let text = item as? StoryTextObject {
            let layer = StoryTextLayer()
            // Prisme Linguistique: in .play mode resolve the preferred-language
            // translation; in .edit mode always show the raw source text so the
            // author edits the original, not a translated copy.
            let displayText = (mode == .play)
                ? text.resolvedText(preferredLanguages: languages)
                : text.text
            var displayObj = text
            displayObj.text = displayText
            layer.configure(with: displayObj, geometry: geometry, mode: mode)
            // Snapshot fadeIn/fadeOut envelope at the current playhead. Applied
            // before keyframe overrides so that an explicit keyframe `opacity`
            // wins over the fade envelope (keyframes are authored explicitly,
            // fade is the default envelope).
            if mode == .play {
                applyFadeOpacity(item: text, at: time.seconds, into: layer)
            }
            // Keyframe overrides for text objects (position, scale, opacity)
            if mode == .play, let kfs = text.keyframes, !kfs.isEmpty {
                applyKeyframeOverrides(kfs,
                                       startTime: text.startTime ?? 0,
                                       at: time.seconds,
                                       geometry: geometry,
                                       into: layer)
            }
            return layer
        }
        if let sticker = item as? StorySticker {
            let layer = StoryStickerLayer()
            layer.configure(with: sticker, geometry: geometry, mode: mode)
            // Snapshot fadeIn/fadeOut envelope at the current playhead.
            // StorySticker has no `keyframes` field (per StoryModels.swift),
            // so fades are the only animation channel for stickers.
            if mode == .play {
                applyFadeOpacity(item: sticker, at: time.seconds, into: layer)
            }
            return layer
        }
        // Unknown RenderableItem type — bare placeholder.
        let layer = CALayer()
        layer.zPosition = CGFloat(item.zIndex)
        layer.name = item.id
        return layer
    }

    /// Applies position/scale/opacity from keyframe interpolation onto an already-configured layer.
    ///
    /// Converts the normalized [0,1] keyframe x/y into design-space coordinates then
    /// projects through `geometry` to render-space coordinates, matching the same
    /// coordinate pipeline used by the individual layer `configure()` methods.
    @MainActor
    private static func applyKeyframeOverrides(_ keyframes: [StoryKeyframe],
                                               startTime: Double,
                                               at currentTime: Double,
                                               geometry: CanvasGeometry,
                                               into layer: CALayer) {
        let overrides = applyKeyframes(keyframes: keyframes, at: currentTime, startTime: startTime)
        if let pos = overrides.position {
            let designX = geometry.designLength(forNormalized: pos.x)
            let designY = geometry.designHeightLength(forNormalized: pos.y)
            layer.position = geometry.render(CGPoint(x: designX, y: designY))
        }
        if let s = overrides.scale {
            let existing = layer.transform
            let sx = Float(s)
            layer.transform = CATransform3DScale(existing, CGFloat(sx), CGFloat(sx), 1)
        }
        if let o = overrides.opacity {
            layer.opacity = Float(o)
        }
    }

    /// Writes the fade-envelope opacity computed by `fadeOpacity(item:at:)`
    /// into the given layer. No-op when no fade is configured (avoids touching
    /// `layer.opacity` so default `1.0` is preserved). Live preview path —
    /// pure snapshot at `currentTime`, no `CAAnimation` is attached.
    @MainActor
    private static func applyFadeOpacity(item: any RenderableItem,
                                         at currentTime: Double,
                                         into layer: CALayer) {
        guard let value = fadeOpacity(item: item, at: currentTime) else { return }
        layer.opacity = Float(value)
    }
}

// MARK: - renderBackground

extension StoryRenderer {

    /// Resolves the background `Kind` for a slide, reading SDK model fields.
    ///
    /// Priority order:
    /// 1. Background video media object (`isBackground == true`, kind == .video`)
    /// 2. Background image media object (`isBackground == true`, kind == .image`)
    /// 3. `effects.background` hex color string
    /// 4. Fallback: `.solidColor(.black)`
    public static func renderBackground(slide: StorySlide,
                                        languages: [String]) -> StoryBackgroundLayer.Kind {
        // Video background object
        if let bgVideo = slide.effects.mediaObjects?.first(where: { $0.isBackground && $0.kind == .video }) {
            // En composer édition la vidéo locale n'a pas encore de postMediaId
            // serveur ; on utilise alors directement la `mediaURL` (file://…)
            // que `StoryBackgroundLayer.configure` détecte par préfixe.
            let routingKey = (!bgVideo.postMediaId.isEmpty)
                ? bgVideo.postMediaId
                : (bgVideo.mediaURL ?? "")
            // `mute` reste à `false` au niveau du renderer : c'est l'état
            // initial souhaité (la vidéo de fond porte de l'audio que le
            // viewer DOIT entendre par défaut). Le mute global de la sidebar
            // est ensuite propagé par le canvas via
            // `StoryBackgroundLayer.isMuted` à chaque toggle, donc l'état
            // dynamique reste géré in place sans recréer le layer. Avant cette
            // correction `mute: true` était hardcodé ici, ce qui silenciait
            // toutes les vidéos de fond quels que soient les réglages user.
            // Story background videos ALWAYS loop for the slide's duration —
            // a clip shorter than the slide must repeat, not freeze on its last
            // frame while the progress ring keeps advancing (bug #2 / #6). The
            // former `bgVideo.loop ?? true` was a dead no-op: `loop` became a
            // non-optional `Bool` (default `false`), so `?? true` never applied
            // and the background played exactly once then stopped (~1-2 s).
            return .video(postMediaId: routingKey,
                          looping: true,
                          mute: false,
                          thumbHash: bgVideo.thumbHash)
        }
        // Image background object or slide.mediaURL
        if let bgImage = slide.effects.mediaObjects?.first(where: { $0.isBackground && $0.kind == .image }) {
            // Idem image : si l'élément n'a pas encore de postMediaId distant
            // (sortie PhotosPicker → temp file), on pousse la file URL dans le
            // champ `postMediaId` pour que `StoryBackgroundLayer.configure`
            // puisse la charger directement sans cache lookup.
            let routingKey = (!bgImage.postMediaId.isEmpty)
                ? bgImage.postMediaId
                : (bgImage.mediaURL ?? "")
            return .image(postMediaId: routingKey,
                          thumbHash: slide.effects.thumbHash)
        }
        if let urlString = slide.mediaURL, !urlString.isEmpty {
            // Legacy background (StorySlide.mediaURL, set only for pre-mediaObjects
            // stories). Route the direct URL through the postMediaId field so
            // `StoryBackgroundLayer.configure` resolves it via `directURLIfAny`
            // (file:// / http(s)://) — the same path the isBackground image branch
            // uses for composer file URLs. Passing `slide.id` fed a NON-media key
            // to the resolver (`mediaList.first { $0.id == postId }`, keyed by
            // FeedMedia.id), which never matched → legacy background rendered
            // blank/black (WS5.4 fix a). The modern "unflagged media[0] as static
            // background" case stays a documented deferred limitation (needs a
            // product rule to avoid shadowing the solid-colour fallback).
            return .image(postMediaId: urlString, thumbHash: slide.effects.thumbHash)
        }
        // Hex color OR "gradient:HEX1:HEX2" from effects.background (C11) —
        // parsing via la source unique StoryBackgroundValue.
        if let background = slide.effects.background {
            switch StoryBackgroundValue.parse(background) {
            case .gradient(let a, let b):
                if let c1 = uiColor(fromHex: a), let c2 = uiColor(fromHex: b) {
                    return .gradient(colors: [c1, c2], direction: .topLeftToBottomRight)
                }
            case .hex(let hex):
                if let color = uiColor(fromHex: hex) {
                    return .solidColor(color)
                }
            }
        }
        return .solidColor(.black)
    }

    // MARK: Private helpers

    private static func uiColor(fromHex hex: String) -> UIColor? {
        var s = hex
        if s.hasPrefix("#") { s.removeFirst() }
        guard let v = UInt32(s, radix: 16), s.count == 6 else { return nil }
        let r = CGFloat((v >> 16) & 0xff) / 255
        let g = CGFloat((v >> 8) & 0xff) / 255
        let b = CGFloat(v & 0xff) / 255
        return UIColor(red: r, green: g, blue: b, alpha: 1)
    }
}

// MARK: - applyOpening

extension StoryRenderer {

    /// Shared duration (seconds) of the slide opening AND closing transitions.
    public nonisolated static let slideTransitionDuration: Double = 0.5

    /// Peak scale of the `.zoom` transition (opening settles 1.08 → 1.0,
    /// closing ramps 1.0 → 1.08).
    nonisolated static let zoomTransitionScale: CGFloat = 1.08

    /// Horizontal travel of the `.slide` transition, as a fraction of the
    /// canvas width (opening enters from +travel → 0, closing exits 0 → −travel).
    nonisolated static let slideTransitionTravelFraction: CGFloat = 0.08

    /// Applies a slide-opening animation to `rootLayer` at playback position `elapsed`.
    ///
    /// - `.reveal`: attaches a circular `CAShapeLayer` mask and animates its `path`
    ///   from a 1-pt circle to a circle that fully covers the layer bounds.
    /// - `.fade`: adds a `CABasicAnimation` on `opacity` keyed `"opening-fade"`.
    /// - `.zoom`: animates `sublayerTransform` from a 1.08 scale down to identity,
    ///   keyed `"opening-zoom"`.
    /// - `.slide`: animates `sublayerTransform` from a light horizontal offset
    ///   (+8% of the canvas width) back to identity, keyed `"opening-slide"`.
    /// - `nil`: no-op.
    ///
    /// `.zoom` / `.slide` animate `sublayerTransform` rather than `transform` so
    /// the model-layer `transform` stays identity: `layoutSubviews` re-assigns
    /// `rootLayer.frame` and setting `frame` on a transformed layer corrupts its
    /// geometry.
    ///
    /// Call only when transitioning into `.play` at `elapsed = 0`. The animations use
    /// `fillMode = .forwards` + `isRemovedOnCompletion = false` so the final state
    /// persists after the animation completes.
    @MainActor
    public static func applyOpening(_ effect: StoryTransitionEffect?,
                                    rootLayer: CALayer,
                                    elapsed: Double) {
        guard let effect, elapsed < slideTransitionDuration else { return }
        switch effect {
        case .reveal:
            let mask = CAShapeLayer()
            mask.frame = rootLayer.bounds
            let center = CGPoint(x: rootLayer.bounds.midX, y: rootLayer.bounds.midY)
            let maxRadius = hypot(rootLayer.bounds.width, rootLayer.bounds.height) / 2
            let startPath = UIBezierPath(arcCenter: center, radius: 1,
                                         startAngle: 0, endAngle: .pi * 2,
                                         clockwise: true).cgPath
            let endPath = UIBezierPath(arcCenter: center, radius: maxRadius,
                                       startAngle: 0, endAngle: .pi * 2,
                                       clockwise: true).cgPath
            mask.path = startPath
            rootLayer.mask = mask
            let anim = CABasicAnimation(keyPath: "path")
            anim.fromValue = startPath
            anim.toValue = endPath
            anim.duration = slideTransitionDuration
            anim.fillMode = .forwards
            anim.isRemovedOnCompletion = false
            mask.add(anim, forKey: "opening-reveal")

        case .fade:
            let anim = CABasicAnimation(keyPath: "opacity")
            anim.fromValue = 0
            anim.toValue = 1
            anim.duration = slideTransitionDuration
            anim.fillMode = .forwards
            anim.isRemovedOnCompletion = false
            rootLayer.add(anim, forKey: "opening-fade")

        case .zoom:
            let anim = CABasicAnimation(keyPath: "sublayerTransform")
            anim.fromValue = NSValue(caTransform3D: CATransform3DMakeScale(
                zoomTransitionScale, zoomTransitionScale, 1))
            anim.toValue = NSValue(caTransform3D: CATransform3DIdentity)
            anim.duration = slideTransitionDuration
            anim.fillMode = .forwards
            anim.isRemovedOnCompletion = false
            rootLayer.add(anim, forKey: "opening-zoom")

        case .slide:
            let travel = rootLayer.bounds.width * slideTransitionTravelFraction
            let anim = CABasicAnimation(keyPath: "sublayerTransform")
            anim.fromValue = NSValue(caTransform3D: CATransform3DMakeTranslation(travel, 0, 0))
            anim.toValue = NSValue(caTransform3D: CATransform3DIdentity)
            anim.duration = slideTransitionDuration
            anim.fillMode = .forwards
            anim.isRemovedOnCompletion = false
            rootLayer.add(anim, forKey: "opening-slide")
        }
    }
}

// MARK: - applyClosing

extension StoryRenderer {

    nonisolated static let closingRevealMaskName = "closing-reveal-mask"

    /// Linear exit progress in `[0, 1]` of the slide-closing transition at
    /// `elapsed`: `0` before `totalDuration − slideTransitionDuration`, ramping
    /// to `1` at `totalDuration`. Pure arithmetic — `nonisolated` so tests can
    /// call it without hopping to `@MainActor`.
    public nonisolated static func closingProgress(totalDuration: Double,
                                                   at elapsed: Double) -> Double {
        guard totalDuration.isFinite, totalDuration > 0 else { return 0 }
        let start = totalDuration - slideTransitionDuration
        guard elapsed > start else { return 0 }
        return min(1, (elapsed - start) / slideTransitionDuration)
    }

    /// Applies the slide-closing transition to `rootLayer` as a pure snapshot of
    /// the playhead — the symmetric counterpart of `applyOpening`, but driven by
    /// `render(at:)`-style ticks instead of an autonomous `CAAnimation`. The exit
    /// state is re-derived from `elapsed` on every call, so pauses, stalls and
    /// seeks stay frame-exact and Reduce-Motion-safe (no runtime-animated
    /// transition, opacity/transform are tied to the playhead).
    ///
    /// - `.fade`: root opacity ramps `1 → 0`.
    /// - `.zoom`: `sublayerTransform` scales `1.0 → 1.08` (inverse of the opening).
    /// - `.slide`: sublayers translate `0 → −8%` of the canvas width.
    /// - `.reveal`: a circular mask shrinks from covering the canvas to 1 pt.
    /// - `nil`: no-op.
    ///
    /// Before the closing window every call restores the neutral value for the
    /// configured effect, so a cached/reused root layer never keeps a stale exit
    /// frame after a seek back or a replay. `sublayerTransform` is used instead
    /// of `transform` for the same `layoutSubviews` frame-assignment reason as
    /// the opening.
    @MainActor
    public static func applyClosing(_ effect: StoryTransitionEffect?,
                                    rootLayer: CALayer,
                                    elapsed: Double,
                                    totalDuration: Double) {
        guard let effect else { return }
        let progress = closingProgress(totalDuration: totalDuration, at: elapsed)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        switch effect {
        case .fade:
            rootLayer.opacity = Float(1 - progress)

        case .zoom:
            let scale = 1 + (zoomTransitionScale - 1) * CGFloat(progress)
            rootLayer.sublayerTransform = CATransform3DMakeScale(scale, scale, 1)

        case .slide:
            let travel = rootLayer.bounds.width * slideTransitionTravelFraction
            rootLayer.sublayerTransform = CATransform3DMakeTranslation(
                -travel * CGFloat(progress), 0, 0)

        case .reveal:
            applyClosingReveal(progress: progress, rootLayer: rootLayer)
        }
    }

    /// Restores the neutral root-layer state that `applyClosing` may have
    /// altered (opacity, sublayerTransform, closing mask). Called when a canvas
    /// (re)enters a mode so a replay — or the next slide reusing the same canvas
    /// with a different `closing` — never inherits the previous exit frame. Only
    /// the closing-owned mask is removed; an opening `.reveal` mask is preserved.
    @MainActor
    public static func resetClosing(rootLayer: CALayer) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        rootLayer.opacity = 1
        rootLayer.sublayerTransform = CATransform3DIdentity
        if rootLayer.mask?.name == closingRevealMaskName {
            rootLayer.mask = nil
        }
    }

    @MainActor
    private static func applyClosingReveal(progress: Double, rootLayer: CALayer) {
        guard progress > 0 else {
            if rootLayer.mask?.name == closingRevealMaskName {
                rootLayer.mask = nil
            }
            return
        }
        let mask: CAShapeLayer
        if let existing = rootLayer.mask as? CAShapeLayer,
           existing.name == closingRevealMaskName {
            mask = existing
        } else {
            mask = CAShapeLayer()
            mask.name = closingRevealMaskName
        }
        mask.frame = rootLayer.bounds
        let center = CGPoint(x: rootLayer.bounds.midX, y: rootLayer.bounds.midY)
        let maxRadius = hypot(rootLayer.bounds.width, rootLayer.bounds.height) / 2
        let radius = max(1, maxRadius * (1 - CGFloat(progress)))
        mask.path = UIBezierPath(arcCenter: center, radius: radius,
                                 startAngle: 0, endAngle: .pi * 2,
                                 clockwise: true).cgPath
        if rootLayer.mask !== mask {
            rootLayer.mask = mask
        }
    }
}

// MARK: - clipTransitionOpacity

extension StoryRenderer {

    /// Returns the effective opacity `[0, 1]` for `media` at playback time `at`,
    /// given a list of `StoryClipTransition` entries and the global time at which
    /// the transition window starts (`transitionStart`).
    ///
    /// Only `kind == .crossfade` is handled; other kinds are treated as opaque.
    /// Outside the transition window the function returns `1.0`.
    ///
    /// `nonisolated` — pure arithmetic, no UIKit.
    public nonisolated static func clipTransitionOpacity(for media: StoryMediaObject,
                                                         transitions: [StoryClipTransition],
                                                         transitionStart: Double,
                                                         at time: Double) -> Double {
        for tr in transitions where tr.kind == .crossfade {
            let duration = Double(tr.duration)
            let inWindow = time >= transitionStart && time <= (transitionStart + duration)
            guard inWindow else { continue }
            let progress = (time - transitionStart) / duration
            if media.id == tr.fromClipId { return 1.0 - progress }
            if media.id == tr.toClipId   { return progress }
        }
        return 1.0
    }
}

// MARK: - applyKeyframes

extension StoryRenderer {

    /// Interpolated overrides produced by `applyKeyframes`.
    public struct KeyframeOverrides: Sendable {
        public nonisolated let position: CGPoint?
        public nonisolated let scale: Double?
        public nonisolated let opacity: Double?

        public nonisolated init(position: CGPoint?, scale: Double?, opacity: Double?) {
            self.position = position
            self.scale = scale
            self.opacity = opacity
        }
    }

    /// Returns interpolated overrides at `currentTime` (global seconds) for an
    /// item whose animation clock starts at `startTime`.
    ///
    /// Pure computation — no UIKit access. `nonisolated` so tests can call it
    /// without hopping to `@MainActor`. Delegates per-channel arithmetic to
    /// `KeyframeInterpolator`. Returns `nil` overrides when `keyframes` is empty.
    ///
    /// **Base-position semantics** : when `currentTime` is BEFORE the first
    /// keyframe of a channel, we return `nil` for that channel so the
    /// renderer keeps the layer's authored base position / scale / opacity.
    /// Without this, a single keyframe at relative t=2s would lock the
    /// element to the keyframed value from t=0..2 instead of leaving it at
    /// its base, producing the visual "the text starts somewhere unexpected
    /// then jumps into place" complaint. The behaviour after the first
    /// keyframe is unchanged: interpolation between consecutive keyframes,
    /// then clamp on the last keyframe's value past the end of the track.
    public nonisolated static func applyKeyframes(keyframes: [StoryKeyframe],
                                                  at currentTime: Double,
                                                  startTime: Double = 0) -> KeyframeOverrides {
        guard !keyframes.isEmpty else {
            return KeyframeOverrides(position: nil, scale: nil, opacity: nil)  // nonisolated init
        }
        let local = Float(max(0, currentTime - startTime))

        // Per-channel "before first keyframe" gate. Each animated channel
        // (x, y, scale, opacity) is keyed independently — a text object can
        // animate scale starting at t=1 and opacity starting at t=0 — so we
        // need a per-channel first-keyframe lookup, not a global one.
        let firstX = keyframes.compactMap { kf in kf.x.map { _ in kf.time } }.min()
        let firstY = keyframes.compactMap { kf in kf.y.map { _ in kf.time } }.min()
        let firstScale = keyframes.compactMap { kf in kf.scale.map { _ in kf.time } }.min()
        let firstOpacity = keyframes.compactMap { kf in kf.opacity.map { _ in kf.time } }.min()

        let xTuples: [(time: Float, value: CGFloat, easing: StoryEasing)] = keyframes.compactMap { kf in
            kf.x.map { (kf.time, $0, kf.easing ?? .linear) }
        }
        let yTuples: [(time: Float, value: CGFloat, easing: StoryEasing)] = keyframes.compactMap { kf in
            kf.y.map { (kf.time, $0, kf.easing ?? .linear) }
        }
        let scaleTuples: [(time: Float, value: CGFloat, easing: StoryEasing)] = keyframes.compactMap { kf in
            kf.scale.map { (kf.time, $0, kf.easing ?? .linear) }
        }
        let opacityTuples: [(time: Float, value: CGFloat, easing: StoryEasing)] = keyframes.compactMap { kf in
            kf.opacity.map { (kf.time, $0, kf.easing ?? .linear) }
        }

        // Gate each channel : skip interpolation when the playhead is BEFORE
        // its earliest authored keyframe. The renderer then leaves the layer
        // at its base value for that channel (see doc comment above).
        let xVal: CGFloat? = (firstX.map { local >= $0 } ?? false)
            ? KeyframeInterpolator.interpolate(keyframes: xTuples, at: local) : nil
        let yVal: CGFloat? = (firstY.map { local >= $0 } ?? false)
            ? KeyframeInterpolator.interpolate(keyframes: yTuples, at: local) : nil
        let sVal: CGFloat? = (firstScale.map { local >= $0 } ?? false)
            ? KeyframeInterpolator.interpolate(keyframes: scaleTuples, at: local) : nil
        let oVal: CGFloat? = (firstOpacity.map { local >= $0 } ?? false)
            ? KeyframeInterpolator.interpolate(keyframes: opacityTuples, at: local) : nil

        let pos: CGPoint? = (xVal != nil && yVal != nil) ? CGPoint(x: xVal!, y: yVal!) : nil
        return KeyframeOverrides(
            position: pos,
            scale: sVal.map { Double($0) },
            opacity: oVal.map { Double($0) }
        )
    }
}

// MARK: - fadeOpacity

extension StoryRenderer {

    /// Returns the snapshot opacity in `[0, 1]` produced by the item's `fadeIn` /
    /// `fadeOut` envelope at the given absolute playback time.
    ///
    /// Pure computation — no UIKit access. `nonisolated` so tests can call it
    /// without hopping to `@MainActor`. Mirrors the AVFoundation opacity ramps
    /// applied to video clips in `VideoCompositor.layerInstructionConfig`,
    /// guaranteeing that what the timeline preview displays matches what the
    /// final export produces (WYSIWYG at the playhead).
    ///
    /// Semantics:
    /// - During `[start, start + fadeIn]`: ramps `0 → 1` linearly.
    /// - During `[end - fadeOut, end]`: ramps `1 → 0` linearly (where
    ///   `end = start + duration`).
    /// - Otherwise inside the visibility window: `1.0`.
    /// - Outside the visibility window: returns `nil` (callers should rely on
    ///   `shouldRender` to drop the layer entirely; we do not produce a `0`
    ///   opacity here to keep the snapshot semantics narrow).
    ///
    /// Returns `nil` when no fade envelope is configured (fadeIn == nil &&
    /// fadeOut == nil) so the caller can preserve `CALayer`'s default `1.0`
    /// without touching the property.
    @MainActor public static func fadeOpacity(item: any RenderableItem,
                                              at currentTime: Double) -> Double? {
        let fadeIn = item.fadeIn ?? 0
        let fadeOut = item.fadeOut ?? 0
        guard fadeIn > 0 || fadeOut > 0 else { return nil }

        let start = item.startTime ?? 0
        let duration = item.duration
        let end: Double = duration.map { start + $0 } ?? .infinity

        guard currentTime >= start, currentTime < end else { return nil }

        if fadeIn > 0, currentTime < start + fadeIn {
            let progress = (currentTime - start) / fadeIn
            return max(0, min(1, progress))
        }

        if fadeOut > 0, end.isFinite, currentTime > end - fadeOut {
            let progress = (end - currentTime) / fadeOut
            return max(0, min(1, progress))
        }

        return 1.0
    }
}
