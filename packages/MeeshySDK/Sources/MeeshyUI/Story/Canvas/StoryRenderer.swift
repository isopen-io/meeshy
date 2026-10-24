import Foundation
import QuartzCore
import CoreMedia
import Metal
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

/// **La pastille de lieu porte ses quatre champs de timing comme ses trois
/// sœurs** (directive porteur 2026-08-31, #4591) — donc la conformité est vide,
/// comme les leurs.
///
/// > Elle fabriquait ici quatre `nil` EN DUR, justifiés par le doc-comment du
/// > modèle qui affirmait « hors timeline par design ». C'était le site le plus
/// > dangereux du cercle : `MeeshyUI` compile en `defaultIsolation(MainActor)`,
/// > donc ces quatre calculées OMBRAIENT les propriétés stockées dans tout le
/// > module. Les champs ajoutés au modèle n'auraient gouverné **aucun pixel** du
/// > canvas, et rien n'aurait rougi — c'est l'isolation, pas la logique, qui a
/// > fini par le dire.
///
/// **Un repli qui rend `nil` sans condition n'est pas une valeur par défaut :
/// c'est une réponse qui empêche la question d'être posée.**
extension StoryLocationObject: RenderableItem {}

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
    ///   - cache: Optional layer-tree cache (`StoryAVCompositor` and the live
    ///     canvas). When non-nil, item layers whose render signature matches the
    ///     previous frame — and the drawing layer — are reused as-is instead of
    ///     rebuilt. `nil` (snapshots, glass capture) rebuilds every layer.
    ///   - contentsScale: Pixel density applied to the root layer and to the
    ///     persisted-drawing rasterization. Live composer/viewer leaves this at
    ///     the ambient trait scale (`StoryCanvasDisplayScale.ambient`); the live
    ///     canvas passes its own `traitCollection.displayScale` so the on-screen
    ///     canvas stays crisp. Export callers (`StoryAVCompositor`) MUST pass `1.0` so
    ///     the rendered pixel buffer matches the design-space resolution
    ///     (1080×1920) and does not get upsampled to 3× on devices with a 3×
    ///     screen scale.
    ///   - reusing: The container to reconcile the item layers into (the live
    ///     canvas's `itemsContainer`, #9865): layers that did not change stay
    ///     attached. `nil` renders into a fresh root.
    /// - Returns: `reusing` when given, otherwise a fresh root `CALayer`; its
    ///   sublayers represent the slide's items.
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
                              playerProvider: (any StoryCarrierPlayerProviding)? = nil,
                              cache: StoryRendererCache? = nil,
                              backdropProvider: BackdropProvider? = nil,
                              mediaFrameProvider: ((StoryMediaObject, CMTime) -> CGImage?)? = nil,
                              contentsScale: CGFloat = StoryCanvasDisplayScale.ambient, imageDecodeTiming: StoryImageDecodeTiming = .immediate,
                              suppressDrawingOverlay: Bool = false,
                              reduceMotion: Bool = UIAccessibility.isReduceMotionEnabled,
                              outOfWindowGhostOpacity: Float? = nil,
                              reusing container: CALayer? = nil) -> CALayer {
        var tree: [CALayer] = []
        for item in collectItems(from: slide).sorted(by: { $0.zIndex < $1.zIndex }) {
            let inWindow = shouldRender(item: item, at: time, mode: mode)
            guard inWindow || outOfWindowGhostOpacity != nil else { continue }
            let layer: CALayer
            let keyframePlan = inWindow ? cache?.coreAnimationPlan(for: item) : nil
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
                let mediaReconfigure = editMediaReconfigure(mode: mode, geometry: geometry, resolver: resolver, imageCache: imageCache,
                                                            playerProvider: playerProvider, contentsScale: contentsScale, imageDecodeTiming: imageDecodeTiming)
                layer = cache.layer(for: item, at: time.seconds, languages: languages,
                                    contentHash: contentHash,
                                    reconfigure: mediaReconfigure) { rebuiltItem in
                    renderItem(rebuiltItem,
                               into: geometry,
                               at: time,
                               mode: mode,
                               languages: languages,
                               resolver: resolver,
                               imageCache: imageCache,
                               playerProvider: playerProvider,
                               contentsScale: contentsScale, imageDecodeTiming: imageDecodeTiming, keyframesByCoreAnimation: keyframePlan != nil)
                }
            } else {
                layer = renderItem(item,
                                   into: geometry,
                                   at: time,
                                   mode: mode,
                                   languages: languages,
                                   resolver: resolver,
                                   imageCache: imageCache,
                                   playerProvider: playerProvider,
                                   contentsScale: contentsScale, imageDecodeTiming: imageDecodeTiming)
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

            // Export overlay video: pose the decoded frame as the media layer's
            // `contents` each tick. The live `AVPlayerLayer` isn't captured by
            // `layer.render(in:)`, and the cache doesn't rebuild the layer per
            // frame (a keyframe-less overlay has a constant signature), so the
            // frame is refreshed HERE — the same out-of-signature post-pass the
            // fade block above uses. nil (outside window / decode failure)
            // clears the contents, matching the live end-of-clip hide.
            if let mediaFrameProvider,
               let media = item as? StoryMediaObject,
               media.kind == .video, !media.isBackground,
               let mediaLayer = layer as? StoryMediaLayer {
                mediaLayer.applyExportFrame(mediaFrameProvider(media, time))
            }

            // C2 (2026-07-25) — MÊME post-passe pour les textes et stickers.
            // `ItemSignature` ne retient que l'opacité des KEYFRAMES
            // (`overrides.opacity ?? 1.0`), jamais l'enveloppe fadeIn/fadeOut :
            // une fois la layer construite au premier tick où sa fenêtre
            // s'ouvre, la signature ne bouge plus, le cache resert la même
            // layer, et l'opacité du tick de CONSTRUCTION reste figée.
            //
            // Bug observé en production (2026-07-25) : un texte à
            // `startTime = 20.006` avec `fadeIn = 0.5` était construit à
            // t ≈ 20.01, donc à (20.01 − 20.006) / 0.5 ≈ 0.02, et restait à
            // 2 % d'opacité pour toute la story — invisible. Le composer n'en
            // souffrait pas : il rend en `.edit`, où la fenêtre temporelle est
            // ignorée et où `contentHash` invalide la layer à chaque mutation.
            //
            // Ordre d'application aligné sur `renderItem` pour ces types :
            // une opacité de keyframe est authored explicitement, elle gagne
            // sur l'enveloppe fade qui n'est qu'un défaut.
            if mode == .play, !(item is StoryMediaObject), let resolved = keyframePlan != nil
                ? fadeOpacity(item: item, at: time.seconds) : resolvedNonMediaOpacity(item: item, at: time.seconds) {
                layer.opacity = Float(resolved)
            }
            if let keyframePlan { playKeyframes(keyframePlan, on: layer, at: time.seconds, geometry: geometry) }

            // #4821 — la POSE d'une décoration animée : une fonction PURE du
            // temps depuis son apparition, réappliquée à chaque tick par la
            // même post-passe que les fondus — donc identique au lecteur (60 Hz)
            // et dans l'export (30 fps), que `layer.render(in:)` ne saurait pas
            // animer autrement. Hors signature du cache, comme le fondu : la
            // transformation ET l'opacité sont reposées en ABSOLU, jamais
            // multipliées en place, sinon une couche réutilisée cumulerait.
            //
            // `reduceMotion` : le lecteur perd le mouvement, pas la décoration.
            // L'export le reçoit à `false` — un fichier ne dépend pas du
            // réglage d'accessibilité de l'appareil qui l'a fabriqué.
            if mode == .play, !reduceMotion,
               let sticker = item as? StorySticker,
               let animation = sticker.animation,
               let stickerLayer = layer as? StoryStickerLayer {
                let pose = animation.pose(at: time.seconds - (sticker.startTime ?? 0))
                stickerLayer.applyAnimationPose(pose, baseRotationDegrees: sticker.rotation)
                let base = resolvedNonMediaOpacity(item: sticker, at: time.seconds) ?? 1.0
                layer.opacity = Float(base * pose.opacity)
            }

            applyGhost(outOfWindowGhostOpacity, inWindow: inWindow, to: layer)
            tree.append(layer)
        }

        // Le dessin persisté, au-dessus des objets. `suppressDrawingOverlay` est
        // levé par le composer quand le `DrawingOverlayView` est actif : sinon
        // deux dessins désalignés à l'écran (bug utilisateur 2026-05-27).
        if let drawing = drawingOverlay(for: slide.effects, geometry: geometry, contentsScale: contentsScale,
                                        cache: cache, suppressed: suppressDrawingOverlay) {
            tree.append(drawing)
        }

        // #9865 — dans un conteneur fourni (le canevas vivant), un arbre
        // inchangé ne touche aucun calque ; sinon racine neuve (export,
        // instantanés, capture du verre).
        let root = container ?? freshRoot(size: geometry.renderSize, contentsScale: contentsScale)
        StoryLayerTree.attach(tree, to: root)
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
    private static let editContentEncoder = { let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]; return e }()
    @MainActor
    private static func editContentHash(for item: any RenderableItem) -> Int {
        let encoder = editContentEncoder
        let data: Data?
        if let text = item as? StoryTextObject {
            data = try? encoder.encode(text)
        } else if let media = item as? StoryMediaObject {
            data = try? encoder.encode(media)
        } else if let sticker = item as? StorySticker {
            data = try? encoder.encode(sticker)
        } else if let location = item as? StoryLocationObject {
            data = try? encoder.encode(location)
        } else {
            data = nil
        }
        guard let data else {
            var fallback = Hasher()
            fallback.combine(UUID())
            return fallback.finalize()
        }
        return contentKey(for: data)
    }

    /// Clé de contenu dérivée de TOUS les octets.
    ///
    /// `hasher.combine(data)` ne convient pas : `Data.hash(into:)` de
    /// Foundation n'échantillonne qu'un PRÉFIXE BORNÉ (~80 octets) plus le
    /// `count`, par souci de performance. Comme le JSON est encodé en
    /// `.sortedKeys`, la position d'un champ y est stable — et tout champ
    /// trié tardivement tombait hors de la fenêtre échantillonnée. Deux
    /// couleurs hex ayant exactement la même longueur, `textColor` (octet
    /// ~135) produisait deux hash IDENTIQUES : le cache servait une calque
    /// périmée et le canvas gardait l'ancienne couleur, alors que `fontSize`
    /// (octet ~50) passait. `combine(bytes:)` couvre l'intégralité du tampon.
    nonisolated static func contentKey(for data: Data) -> Int {
        var hasher = Hasher()
        hasher.combine(data.count)
        data.withUnsafeBytes { hasher.combine(bytes: $0) }
        return hasher.finalize()
    }

    private static func freshRoot(size: CGSize, contentsScale: CGFloat) -> CALayer {
        let root = CALayer()
        root.frame = CGRect(origin: .zero, size: size)
        root.anchorPoint = CGPoint(x: 0, y: 0)
        root.contentsScale = contentsScale
        return root
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
        // Pastilles de lieu : doivent traverser le cycle collectItems → cache
        // pour que `editContentHash` les couvre, sinon le rendu reste figé
        // sur l'ancienne `place`/position après édition (le hash ne change
        // pas donc `StoryLocationLayer` ne se re-dessine pas).
        items.append(contentsOf: slide.locationObjects)
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
                                   imageCache: ImageCacheReader? = nil,
                                   playerProvider: (any StoryCarrierPlayerProviding)? = nil,
                                   contentsScale: CGFloat = StoryCanvasDisplayScale.ambient, imageDecodeTiming: StoryImageDecodeTiming = .immediate, keyframesByCoreAnimation: Bool = false) -> CALayer {
        if let media = item as? StoryMediaObject {
            let layer = StoryMediaLayer()
            layer.configure(with: media,
                            geometry: geometry,
                            mode: mode,
                            resolver: resolver,
                            imageCache: imageCache,
                            playerProvider: playerProvider,
                            renderScale: contentsScale, decodeTiming: imageDecodeTiming)
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
            layer.configure(with: displayObj, geometry: geometry, mode: mode,
                            renderScale: contentsScale)
            // Snapshot fadeIn/fadeOut envelope at the current playhead. Applied
            // before keyframe overrides so that an explicit keyframe `opacity`
            // wins over the fade envelope (keyframes are authored explicitly,
            // fade is the default envelope).
            if mode == .play {
                applyFadeOpacity(item: text, at: time.seconds, into: layer)
            }
            // Keyframe overrides for text objects (position, scale, opacity)
            if mode == .play, !keyframesByCoreAnimation, let kfs = text.keyframes, !kfs.isEmpty {
                applyKeyframeOverrides(kfs,
                                       startTime: text.startTime ?? 0,
                                       at: time.seconds,
                                       geometry: geometry,
                                       into: layer)
            }
            return layer
        }
        if let location = item as? StoryLocationObject {
            let layer = StoryLocationLayer()
            layer.configure(with: location, geometry: geometry, mode: mode,
                            renderScale: contentsScale)
            return layer
        }
        if let sticker = item as? StorySticker {
            let layer = StoryStickerLayer()
            layer.configure(with: sticker, geometry: geometry, mode: mode,
                            renderScale: contentsScale, imageCache: imageCache, resolver: resolver)
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
    /// Clé de routage du fond : ce que `StoryBackgroundLayer.configure` tentera
    /// d'abord comme URL directe, avant de retomber sur le resolver.
    ///
    /// Une URL DISTANTE prime sur le `postMediaId`. L'identifiant n'est pas une
    /// URL : le layer doit le résoudre via le tableau `media[]` du post — et ce
    /// tableau revient vide dès qu'un rattachement média↔post a échoué à la
    /// publication. Constaté en production le 2026-08-01 : deux stories sans
    /// aucun fond, alors que leur objet portait une `mediaURL` parfaitement
    /// servable, jamais essayée parce que le `postMediaId` gagnait d'office.
    ///
    /// Les `file://` sont exclues quand un identifiant existe : les stories
    /// publiées avant `sanitizedForServerPublish()` en portent qui pointent vers
    /// la sandbox de l'AUTEUR, inaccessible à tout autre lecteur. Sans
    /// identifiant en revanche (composer, média pas encore téléversé), la
    /// `file://` locale EST la bonne source — c'est la sandbox de celui qui
    /// regarde.
    nonisolated static func backgroundRoutingKey(postMediaId: String,
                                                 mediaURL: String?) -> String {
        // **Une ADRESSE gagne sur un IDENTIFIANT** (#5419). Ce test ne
        // reconnaissait que `http` : la clé de stockage servie par la
        // passerelle pour une story — `2026/09/<auteur>/<fichier>.mp4` —
        // retombait donc sur le `postMediaId`, que le résolveur de l'hôte ne
        // sait pas résoudre (une story ne porte AUCUN `PostMedia` : son contenu
        // vit dans le canvas). D'où `bg video configure … resolved=nil`,
        // définitif, et une story vidéo qui ne se lit jamais.
        //
        // La règle vit dans `StoryBackgroundLayer.isAddressable` — le même
        // prédicat que celui qui décide, un étage plus bas, si la chaîne part
        // chez `MeeshyConfig.resolveMediaURL`. Deux réponses à une seule
        // question sont ce qui a produit ce défaut.
        //
        // MAIS `isAddressable` reconnaît AUSSI `file://` (#5457) — et un
        // `file://` n'est une adresse UTILISABLE que pour celui qui l'a écrit.
        // Élargir la priorité à `isAddressable` a donc rouvert exactement ce
        // que le paragraphe ci-dessus (et les deux au-dessus) documentent
        // depuis l'origine : une `mediaURL` de sandbox AUTEUR ne doit gagner
        // sur le `postMediaId` que lorsqu'aucun identifiant n'existe — sans
        // quoi une story publiée avant `sanitizedForServerPublish()` retombe
        // sur un chemin `file://` inaccessible à tout autre lecteur. Une
        // adresse RÉSEAU (http/https, clé de stockage) n'a pas ce problème et
        // continue de gagner sans condition.
        if let url = mediaURL, StoryBackgroundLayer.isAddressable(url) {
            let isAuthorSandboxFile = url.hasPrefix("file://")
            if !isAuthorSandboxFile || postMediaId.isEmpty { return url }
        }
        return postMediaId.isEmpty ? (mediaURL ?? "") : postMediaId
    }

    public static func renderBackground(slide: StorySlide,
                                        languages: [String]) -> StoryBackgroundLayer.Kind {
        // Video background object
        if let bgVideo = slide.effects.mediaObjects?.first(where: { $0.isBackground && $0.kind == .video }) {
            // En composer édition la vidéo locale n'a pas encore de postMediaId
            // serveur ; on utilise alors directement la `mediaURL` (file://…)
            // que `StoryBackgroundLayer.configure` détecte par préfixe.
            let routingKey = Self.backgroundRoutingKey(postMediaId: bgVideo.postMediaId,
                                                       mediaURL: bgVideo.mediaURL)
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
            let routingKey = Self.backgroundRoutingKey(postMediaId: bgImage.postMediaId,
                                                       mediaURL: bgImage.mediaURL)
            return .image(postMediaId: routingKey,
                          thumbHash: slide.effects.thumbHash)
        }
        if let urlString = slide.mediaURL, !urlString.isEmpty {
            // TRANSITOIRE — route legacy IMAGE (`StorySlide.mediaURL`, stories
            // d'avant les `mediaObjects` et forme « média seul » servie aux
            // clients sans `X-Canvas-Caps`). La vidéo legacy n'arrive plus ici :
            // `StoryItem.legacyVideoCarrier` la migre en objet de fond. À
            // SUPPRIMER avec lui quand le parc ne lit plus que le canvas v3.
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
