import UIKit
@preconcurrency import AVFoundation
import MeeshySDK
import os

/// Diagnostics du pipeline vidéo de fond des stories — chemin historiquement
/// aveugle (régressions 2026-05-22, 2026-06-09, 2026-06-11 toutes invisibles
/// dans les logs). Couvre : choix de sous-chemin dans `configure(.video)`,
/// résolution cache vs streaming distant, attach du player.
let storyMediaLog = os.Logger(subsystem: "me.meeshy.app", category: "story-media")

/// Visual background of the story canvas (color/gradient/image+thumbHash/video).
/// Lives below `itemsContainer` in `StoryCanvasUIView.rootLayer`.
/// Lifecycle aware: pause/resume video on app background/foreground.
///
/// Uses `nonisolated` inits to interop with `CALayer`'s nonisolated initializers
/// (MeeshyUI module applies `defaultIsolation(MainActor)`).
public final class StoryBackgroundLayer: CALayer {
    public enum Kind: Sendable {
        case solidColor(UIColor)
        case gradient(colors: [UIColor], direction: GradientDirection)
        case image(postMediaId: String, thumbHash: String?)
        case video(postMediaId: String, looping: Bool, mute: Bool, thumbHash: String?)

        /// `true` si le fond est un média VISUEL (image/vidéo) — par opposition à un
        /// fond coloré (solidColor/gradient). Source de vérité du Prisme visuel : aucun
        /// fond coloré (ni letterbox colorée) n'est peint quand `isVisualMedia` est vrai,
        /// le média couvre le canvas (user 2026-06-03). Le fond coloré n'apparaît QUE
        /// sans média de fond visuel (texte, dessin, foreground media, son).
        public nonisolated var isVisualMedia: Bool {
            switch self {
            case .image, .video: return true
            case .solidColor, .gradient: return false
            }
        }
    }

    public enum GradientDirection: Sendable, Equatable {
        case topToBottom, leftToRight, topLeftToBottomRight
    }

    public private(set) nonisolated(unsafe) var kind: Kind = .solidColor(.black)
    public private(set) nonisolated(unsafe) var transform3D: BackgroundTransform = BackgroundTransform()

    /// Reflète l'état mute global du reader (bouton Mute / Son de la sidebar).
    /// Le canvas (`StoryCanvasUIView`) synchronise cette propriété à chaque
    /// `handleComposerMute()` / `handleComposerUnmute()` et au moment du
    /// `setReaderContext` pour propager le toggle au player vidéo de fond
    /// sans recréer la layer. Avant cette propriété, le renderer hardcodait
    /// `mute: true` à l'attach, donc l'audio des vidéos de fond restait
    /// inaccessible quelle que soit l'intention de l'utilisateur.
    @MainActor
    public var isMuted: Bool = false {
        didSet {
            guard oldValue != isMuted else { return }
            avPlayer?.isMuted = isMuted
        }
    }

    /// Volume du média de fond, dans `0...StoryVolume.maxGain`.
    ///
    /// Cette couche forçait `1.0` à l'attache et ne lisait jamais
    /// `StoryMediaObject.volume` : une vidéo de fond couvrait donc la musique
    /// quel que soit le réglage de l'auteur, alors même que l'export
    /// l'appliquait déjà. La valeur est réappliquée à chaque attache, le player
    /// étant recréé au gré du cache LRU.
    @MainActor
    public var volume: Float = 1.0 {
        didSet {
            guard oldValue != volume else { return }
            avPlayer?.volume = volume
        }
    }

    /// Drapeau levé par le canvas (`StoryCanvasUIView`) en mode `.play` pour
    /// autoriser la lecture du player vidéo de fond. Quand un nouveau player
    /// est attaché alors que le canvas est déjà actif (slide change durant
    /// un viewing), on le démarre tout de suite ; sinon (prefetcher en
    /// `.edit`, composer preview), on attache silencieux et on attend
    /// l'activation explicite. Garantie : pas d'audio de vidéo de fond
    /// off-screen ni de lecture « avant son tour ».
    @MainActor
    public var isPlaybackActive: Bool = false {
        didSet {
            guard oldValue != isPlaybackActive else { return }
            if isPlaybackActive {
                alignToTimelineThenPlay()
            } else {
                avPlayer?.pause()
            }
        }
    }

    /// Playhead unifié de la slide (secondes), poussé par le canvas. Sert au
    /// CALAGE timeline de la vidéo de fond quand elle (re)démarre — symétrique au
    /// foreground. Pour une ouverture/scrub à `t>0`, la frame de fond se cale sur
    /// le playhead au lieu de repartir de zéro. JAMAIS appliqué par frame : seul
    /// `alignToTimelineThenPlay()` seek, et uniquement au-delà du seuil de dérive
    /// (resume en place / bascule plein écran = aucun saut).
    @MainActor public var slidePlayheadSeconds: Double = 0

    static let timelineSeekDriftThreshold: Double = 0.30

    nonisolated(unsafe) var contentLayer: CALayer?
    /// Le flou qui habille les bandes d'un média AJUSTÉ — voir
    /// `StoryBackgroundLayer+LetterboxFill.swift`. Stocké ici parce qu'une
    /// extension ne porte pas de propriété.
    nonisolated(unsafe) var letterboxFillLayer: CALayer?
    /// Les sources candidates, RETENUES pour le chemin rapide : lui ne repasse
    /// pas par la branche qui les connaît.
    nonisolated(unsafe) var letterboxFillHashes: [String] = []
    /// Le bitmap de fond DÉJÀ posé — la source la plus fidèle de la bande, et
    /// la seule dont dispose l'atelier : `StoryThumbHashEnricher` ne calcule les
    /// hachages qu'à la PUBLICATION.
    nonisolated(unsafe) var letterboxSourceImage: UIImage?
    /// Le lecteur présente l'image SEULE (#6636) : la bande sort du cadre visible
    /// et ne se peint plus — voir `setLetterboxFillSuppressed(_:)`.
    nonisolated(unsafe) var isLetterboxFillSuppressed = false
    /// Fournisseur du player du média porteur (O16), posé par `configure` depuis
    /// le contexte de LECTURE. `nil` en composition : la couche ouvre le sien.
    nonisolated(unsafe) var playerProvider: (any StoryCarrierPlayerProviding)?
    nonisolated(unsafe) var avPlayer: AVPlayer?
    nonisolated(unsafe) var avPlayerLayer: AVPlayerLayer?
    nonisolated(unsafe) var avPlayerLooper: AVPlayerLooper?
    nonisolated(unsafe) var backgroundLoopObserver: NSObjectProtocol?

    // Même pattern que `StoryMediaLayer.deinit` : sans ce retrait, une layer
    // vidéo-loop libérée sans reconfigure laissait un observer zombie
    // enregistré dans NotificationCenter pour toujours.
    nonisolated deinit {
        if let token = backgroundLoopObserver {
            NotificationCenter.default.removeObserver(token)
        }
    }

    /// `true` quand `configure(kind:)` a stampé `contentLayer.contents` avec
    /// une image FINALE (warm L1 cache hit OU bytes téléchargés via HTTP),
    /// pas juste un placeholder ThumbHash. Lu par
    /// `StoryCanvasUIView.scheduleContentReadyEvaluation(.image)` pour
    /// court-circuiter le KVO observer : quand le NSCache rend la même
    /// instance UIImage entre le warm-hit synchrone et le re-stamp async,
    /// `contents` ne change pas d'identité et l'observer ne fire jamais —
    /// d'où le loader infini à 0% sur les stories image (régression du
    /// commit a60f636b5 / 2026-05-20).
    @MainActor public private(set) var hasFinalContentStamped: Bool = false

    /// Fired exactly when the FINAL background image bitmap is stamped (warm hit
    /// or async download) — NOT for the ThumbHash placeholder. The composer
    /// canvas uses this to re-apply its CoreImage filter overlay once the real
    /// photo lands: in `.play` the image loads asynchronously, so the filter
    /// snapshot taken during the initial layout captured only the blurry
    /// ThumbHash, and the opaque overlay then covered the loaded photo with that
    /// placeholder (« le preview affiche le thumbHash, pas l'image » 2026-06-03).
    @MainActor public var onFinalImageStamped: (() -> Void)?

    /// Fired chaque fois qu'un `AVPlayer` de fond vient d'être attaché —
    /// chemin chaud (fichier local immédiat) comme chemin froid (attach
    /// différé après download). Le canvas s'en sert pour (ré)armer son
    /// observation de readiness vidéo : sans ce signal, un download plus
    /// long que la fenêtre de sondage initiale (~1,5 s) laissait la slide
    /// gelée sur son thumbnail, progression sans frames ni audio
    /// (bug user 2026-06-11).
    @MainActor public var onPlayerAttached: (() -> Void)?

    /// Marks the final bitmap as stamped and notifies `onFinalImageStamped`.
    @MainActor
    private func markFinalContentStamped() {
        hasFinalContentStamped = true
        onFinalImageStamped?()
    }

    /// Active background filter baked into the displayed bitmap (story effects).
    /// The filter is applied to the IMAGE itself at stamp time (not via a
    /// separate overlay) so it renders identically in the composer, the Play
    /// preview, the reader and published stories — and so an in-place image edit
    /// re-filters correctly. Set by `configure(...)`. Applies to image
    /// backgrounds only (text/sticker overlays are intentionally NOT filtered —
    /// standard photo-filter behaviour).
    @MainActor public private(set) var activeFilter: StoryFilter?
    @MainActor public private(set) var activeFilterIntensity: Float = 1.0
    /// Monotonic token from the composer (`loadedImagesVersion`); a change forces
    /// a re-fetch + re-stamp even when the media identity is unchanged, so an
    /// in-place bitmap edit under the same id is reflected on the canvas.
    @MainActor private var lastContentVersion: UInt64 = 0

    /// **La taille à laquelle cette couche a été CONFIGURÉE pour la dernière
    /// fois** — et non celle de son cadre, que l'hôte réécrit avant d'appeler
    /// `configure` (#6904).
    ///
    /// `StoryCanvasUIView.rebuildLayers` pose `backgroundLayer.frame` à la
    /// nouvelle taille douze lignes avant son `configure`. Un diff qui lisait
    /// `self.frame.size` comparait donc la géométrie à ce que son APPELANT
    /// venait d'y écrire : toujours égale, y compris sur la passe où le canvas
    /// venait de changer de cotes. Le fond restait alors peint aux cotes
    /// précédentes, ancré en haut à gauche — mesuré au simulateur sur le plein
    /// écran immersif de la galerie (canvas 378 × 672 conservé dans des bornes
    /// de 402 × 714,67).
    ///
    /// `nil` tant qu'aucune configuration n'a abouti : une couche neuve ne
    /// prétend pas avoir déjà projeté quoi que ce soit.
    @MainActor private var configuredRenderSize: CGSize?

    /// Applies the active filter (if any) to `image`, stamps it into `img.contents`
    /// with the resolved gravity, and marks final content. The single choke point
    /// for every FINAL image stamp (warm hit / composer cache / URL load) so the
    /// filter is baked uniformly. Filtering preserves dimensions, so gravity is
    /// computed from the (filtered) bitmap size.
    @MainActor
    private func stampFinalImage(_ image: UIImage, imageId: String?, on img: CALayer?) {
        let display: UIImage = activeFilter.map {
            StoryFilterProcessor.apply($0, to: image, imageId: imageId, intensity: activeFilterIntensity)
        } ?? image
        Self.withDisabledCAActions {
            // **Le FOND porte l'orientation comme les autres couches**
            // (2026-09-05). Ce site était resté sur `.cgImage` nu au premier
            // passage : le média d'un post-photo est un FOND (`isBackground`),
            // donc c'est ICI qu'il se peint — et pas dans `StoryMediaLayer`,
            // que le correctif avait couvert. Mesuré : la même photo droite en
            // détail, à 180° dans la carte, `EXIF Orientation = 3`.
            //
            // > **Un correctif posé sur « la couche des médias » ne couvre pas
            // > le média qui n'est pas dans cette couche.** Le nom du fichier
            // > décrivait la famille que je croyais viser ; la géographie du
            // > rendu en décide autrement, et le fond a sa propre couche.
            let redresse = CanvasImageOrientation.displayCGImage(display)
            img?.contents = redresse
            if let layer = img, let cg = redresse {
                layer.contentsGravity = StoryBackgroundLayer.resolveImageGravity(
                    naturalSize: CGSize(width: cg.width, height: cg.height),
                    canvasSize: self.bounds.size,
                    override: self.transform3D.videoFitMode)
            }
        }
        noteStampedBackground(display)
        markFinalContentStamped()
    }

    public override nonisolated init() {
        super.init()
        // Clip le contenu interne aux bounds du backgroundLayer pour le
        // pinch/pan "INSIDE the bg" (style Instagram) — sinon scaler le
        // content fait déborder l'image / vidéo au-delà du canvas et le user
        // perçoit "tout le canvas zoom" (bug reporté 2026-05-27).
        self.masksToBounds = true
    }
    public override nonisolated init(layer: Any) {
        super.init(layer: layer)
        self.masksToBounds = true
    }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryBackgroundLayer does not support NSCoder")
    }

}

// MARK: - Configure

extension StoryBackgroundLayer {
    /// Disables implicit CoreAnimation actions for the duration of `block`, so
    /// programmatic `contents`/`videoGravity`/`addSublayer` mutations don't
    /// trigger the default `kCAFadeIn` / opacity animations that cause
    /// 1-frame flashes when the renderer rebuilds layers.
    @MainActor
    static func withDisabledCAActions(_ block: () -> Void) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        block()
        CATransaction.commit()
    }

    /// Applies a user transform to the bg CONTENT (image/video/gradient/color
    /// sublayer) instead of to `self`. The backgroundLayer itself always
    /// covers the full canvas — scaling its content while the layer stays
    /// fixed gives the "zoom inside the bg" UX (Instagram-style), with
    /// `masksToBounds = true` clipping anything that overflows.
    ///
    /// Why not scale `self.transform` ? Because that scales the WHOLE
    /// backgroundLayer relative to the rootLayer parent — the bg overflows
    /// the canvas and the user perceives "everything is zooming" (bug
    /// reported 2026-05-27 in `.background` manipulation layer). Items in
    /// `itemsContainer` (sibling of backgroundLayer) stay in place because
    /// they're not affected by `backgroundLayer.transform`, but the bg
    /// growing past its bounds is what the user sees.
    @MainActor
    public func applyContentTransform(_ t: CATransform3D) {
        Self.withDisabledCAActions {
            // Apply to whichever content sublayer is active. For image and
            // video we scale the content sublayer so the backgroundLayer
            // itself stays put (clipped to canvas bounds via masksToBounds).
            // For solid color (no content sublayer) we fall back to scaling
            // self — visually a no-op because a uniform color fill doesn't
            // change under any affine transform, but it preserves the
            // contract that "applyContentTransform always applies somewhere".
            if let img = contentLayer {
                img.transform = t
                return
            }
            if let pl = avPlayerLayer {
                pl.transform = t
                return
            }
            self.transform = t
        }
    }

    /// Commit le live transform appliqué pendant un geste (pan / pinch /
    /// rotation sur le background) au MODÈLE `transform3D` du layer. Appelé
    /// par `StoryCanvasUIView.handle*.ended` AVANT `slide = updated` pour que
    /// le `configure()` qui suit (déclenché par `slide.didSet → rebuildLayers`)
    /// détecte `nothingChanged` (transform3D == bgTransform construit depuis
    /// le slide mis à jour) et SKIP la reconfiguration des contentLayer
    /// frames — sinon le `contentLayer?.frame = bounds` du chemin reuse-content
    /// sur un sublayer encore transformé produit un glitch visuel au release
    /// ("bg grandi momentanément puis se replace incorrectement", bug
    /// 2026-05-27).
    @MainActor
    public func commitLiveTransform(_ transform: BackgroundTransform) {
        self.transform3D = transform
        // Idempotent : le drag avait déjà posé `img.transform = t` via
        // `applyContentTransform`. Réappliquer ici garantit la cohérence
        // si un caller appelle `commitLiveTransform` sans `applyContentTransform`
        // préalable (ex. tests).
        applyContentTransform(transform.caTransform())
    }

    /// Loads a UIImage from a URL, supporting both `file://` and HTTP(S) (via
    /// CacheCoordinator with NSCache + disk TTL + dedup). Returns `nil` on any
    /// error — the caller decides whether to fallback to another URL or give up.
    /// Lecture ET décodage vivent hors du MainActor : voir
    /// `StoryLayerImageDecoding` (#7010).
    @MainActor
    static func loadImage(from url: URL) async -> UIImage? {
        if url.isFileURL {
            return await StoryLayerImageDecoding.decodedImage(fileAt: url)
        }
        guard let data = try? await CacheCoordinator.shared.images.data(for: url.absoluteString) else {
            return nil
        }
        return await StoryLayerImageDecoding.decodedImage(from: data)
    }

    @MainActor
    public func configure(kind: Kind,
                          transform: BackgroundTransform,
                          geometry: CanvasGeometry,
                          resolver: ((String) -> URL?)?,
                          imageCache: ImageCacheReader?,
                          playerProvider: (any StoryCarrierPlayerProviding)? = nil,
                          letterboxColor: UIColor? = nil,
                          slidePreviewThumbHash: String? = nil,
                          letterboxFillHashes: [String] = [],
                          filter: StoryFilter? = nil,
                          filterIntensity: Float = 1.0,
                          contentVersion: UInt64 = 0) {
        // FAST PATH ANTI-FLASH :
        // `configure(...)` est appelé à CHAQUE `rebuildLayers()` du canvas
        // (i.e. à chaque slide.didSet, drop d'un élément foreground, lancement
        // preview / viewer, etc.). Le clear+rebuild systématique détachait
        // `contentLayer` puis le recréait vide en attendant un `img.contents`
        // async — visible 1-2 frames comme un FLASH NOIR / TRANSPARENT à
        // travers `StoryCanvasUIView`.
        //
        // Quand l'IDENTITÉ du contenu n'a pas changé (même postMediaId pour
        // image / video, même type pour color/gradient), on garde le
        // `contentLayer` existant et on rafraîchit juste frame + transform.
        // Le bitmap déjà affiché reste à l'écran sans interruption.
        self.playerProvider = playerProvider
        let previousContentIdentity = Self.contentIdentity(for: self.kind)
        let nextContentIdentity = Self.contentIdentity(for: kind)

        // NO-OP DIFF (D3): when kind+transform+geometry are all unchanged AND we
        // already have FINAL visible content, skip the entire configure pipeline.
        // This prevents the flash on text keystrokes that trigger rebuildLayers()
        // → configure() with the same parameters as the previous tick.
        //
        // The "final visible content" check is per-kind because a CALayer is
        // created synchronously for `.image` BEFORE the async fetch stamps the
        // bitmap. If we skipped on `contentLayer != nil` alone, an image whose
        // first fetch failed (offline, dead file://, 404) would never re-trigger
        // — the loader would stay stuck at 0% forever (bug pré-existant aggravé
        // par le diff naïf : audio bg + image bg, ThumbHash bloqué à 0%).
        let hasVisibleContent: Bool = {
            switch kind {
            case .solidColor:
                return backgroundColor != nil && backgroundColor != UIColor.clear.cgColor
            case .gradient:
                return contentLayer is CAGradientLayer
            case .image:
                // Le `contentLayer` est créé synchronement mais reste un layer
                // vide tant que l'async load n'a pas stampé `contents`.
                // `hasFinalContentStamped` est armé exclusivement par les
                // chemins qui stampent un bitmap FINAL (warm cache hit ou
                // bytes téléchargés), jamais par le placeholder ThumbHash —
                // donc tant qu'il est false on doit autoriser un re-trigger.
                return hasFinalContentStamped
            case .video:
                // AVPlayer démarre quasi instantanément ; la présence du layer
                // est suffisante pour considérer le contenu prêt.
                return avPlayerLayer != nil
            }
        }()
        let filterUnchanged = (self.activeFilter == filter)
            && (self.activeFilterIntensity == filterIntensity)
            && (self.lastContentVersion == contentVersion)
        let nothingChanged = (previousContentIdentity == nextContentIdentity)
            && (self.transform3D == transform)
            && (self.configuredRenderSize == geometry.renderSize)
            && hasVisibleContent
            && filterUnchanged
        if nothingChanged { return }

        // **Une reconfiguration qui ne sait pas résoudre son NOUVEAU sujet n'a
        // rien à dire sur l'ANCIEN** (directive porteur 2026-09-06 : « quand
        // j'ajoute un média de fond, ça disparaît immédiatement »).
        //
        // ## Ce que la trace montre
        //
        // Le fond est d'abord configuré sur le FICHIER LOCAL et se peint :
        //
        //     bg video configure id=…-60848601514B.mp4  resolved=CCEAFC3C-….mp4
        //     bg video path=local-file
        //     arm video readiness  layerReady=true  itemStatus=1     ← prêt
        //
        // Puis la pré-montée aboutit, le média reçoit son id SERVEUR, et le
        // canvas est reconfiguré sur cette nouvelle identité :
        //
        //     pré-montée aboutie: …  id=6a9d44a3…  adoptée=true
        //     bg video configure  id=6a9d44a3…  resolved=nil         ← ✗
        //     readiness eval  hasPlayer=false hasItem=false
        //
        // Le média n'a pas disparu : **il a changé de nom**, et la couche a
        // suivi le changement sans savoir résoudre le nouveau. Le fond se
        // serait affiché si le téléversement avait duré une seconde de plus.
        //
        // ## Pourquoi les gardes en place ne l'attrapaient pas
        //
        // Les deux branches replient sur une ABSENCE, chacune en supposant que
        // la résolution reviendra : la vidéo laisse la couche transparente
        // (« le resolver peut retourner nil 1-2 frames le temps que le
        // postMediaId soit enregistré côté cache ») et l'image sort par un
        // `guard let uiImage else { return }` muet. Ces replis sont justes pour
        // une attente de deux frames ; ici le `nil` est DÉFINITIF — rien ne
        // reconfigure une troisième fois — et une garde écrite pour un état
        // transitoire tient une absence permanente.
        //
        // > **Attendre n'est pas abandonner.** C'est le pendant, un étage plus
        // > bas, du « ne rien faire n'est pas laisser passer » des gestes de
        // > lecture : une décision juste dont l'hypothèse implicite ne tient
        // > plus.
        //
        // ## Ce que cette garde fait, et ce qu'elle NE fait pas
        //
        // Elle refuse la SEULE reconfiguration nuisible : celle qui change
        // l'identité, ne sait pas résoudre la nouvelle, et détruirait un
        // contenu visible. Détruire est une affirmation ; ici la couche n'en a
        // aucune à faire. Tout le reste passe — même identité, identité
        // résolvable, ou absence de contenu à préserver (auquel cas les replis
        // d'origine gardent leur rôle, y compris le placeholder ThumbHash).
        //
        // Elle ne touche PAS au modèle : `self.kind` n'est pas réécrit, donc
        // la couche continue de peindre ce qu'elle peignait, pendant que le
        // document porte bien le nouvel id — c'est lui, et non cette couche,
        // que la publication relit. Une résolution ultérieure du même id
        // repassera d'elle-même par ce point et sera acceptée.
        if hasVisibleContent,
           previousContentIdentity != nextContentIdentity,
           !Self.canResolve(kind, resolver: resolver) {
            storyMediaLog.info("bg configure IGNORÉE — nouvelle identité non résolvable, fond conservé")
            return
        }

        // Reuse the existing content sublayer ONLY when identity AND filter AND
        // content version are unchanged. A filter switch or an in-place bitmap
        // edit (same id, bumped version) must fall through to a fresh fetch +
        // re-stamp so the baked filter / edited pixels actually update.
        let canReuseContent = (previousContentIdentity == nextContentIdentity)
            && (contentLayer != nil)
            && filterUnchanged

        self.kind = kind
        self.transform3D = transform
        self.activeFilter = filter
        self.activeFilterIntensity = filterIntensity
        self.lastContentVersion = contentVersion
        self.frame = CGRect(origin: .zero, size: geometry.renderSize)
        self.configuredRenderSize = geometry.renderSize

        if canReuseContent {
            // Même contenu visuel : on garde le sublayer en place pour éviter
            // un détachement transitoire. Resync frame (resize du canvas) +
            // transform (pinch / pan utilisateur sur l'image bg) + gravity
            // (changement de videoFitMode via double-tap, sans rebuild).
            //
            // CoreAnimation footgun : assigner `.frame` à un layer dont le
            // `.transform` est non-identité donne des bounds/position INDÉFINIS
            // (le frame setter suppose transform == identité). Pendant un drag
            // du fond, `updateManipulatedItemLayer → applyContentTransform` a
            // posé un transform live sur `contentLayer` SANS mettre à jour
            // `transform3D` ; au `.ended`, ce `rebuildLayers → configure` arrive
            // donc ici avec un sublayer encore transformé. Sans reset préalable,
            // `frame = bounds` corrompait les bounds (÷ scale du drag) et le
            // fond « revenait à sa position initiale » au relâchement, alors que
            // le mini-preview restait correct (piloté par `mediaObjects[bg]`).
            // On remet le transform à l'identité AVANT de réécrire le frame,
            // puis `applyContentTransform` réapplique le transform résolu. Bug
            // exposé quand l'unification BG/FG (2026-05-29) a retiré le seam
            // `commitLiveTransform` qui court-circuitait ce chemin via
            // `nothingChanged`.
            Self.withDisabledCAActions {
                contentLayer?.transform = CATransform3DIdentity
                avPlayerLayer?.transform = CATransform3DIdentity
                contentLayer?.frame = bounds
                avPlayerLayer?.frame = bounds
            }
            // Transform appliqué au CONTENT, pas à self : le backgroundLayer
            // reste fixe (couvre tout le canvas) et seul son contenu zoom /
            // pan dedans (Instagram-style "zoom inside bg").
            applyContentTransform(transform.caTransform())

            // Refresh gravity for the new videoFitMode override. Auto cases
            // (override nil) need the naturalSize to compute — for video,
            // attachBackgroundPlayer's Task already wrote the resolved gravity,
            // so we only override here when the user explicitly chose fit/fill.
            // For image, contentsGravity is already periodically refreshed by
            // the async load Task each time it stamps a new bitmap; here we
            // pick up the override change immediately.
            if let override = transform.videoFitMode {
                let videoGravity: AVLayerVideoGravity = (override == "fit") ? .resizeAspect : .resizeAspectFill
                let imageGravity: CALayerContentsGravity = (override == "fit") ? .resizeAspect : .resizeAspectFill
                Self.withDisabledCAActions {
                    avPlayerLayer?.videoGravity = videoGravity
                    if let img = contentLayer, !(img is CAGradientLayer) {
                        img.contentsGravity = imageGravity
                    }
                    // Letterbox color refresh : same logic as initial paint.
                    if videoGravity == .resizeAspect || imageGravity == .resizeAspect {
                        backgroundColor = letterboxColor?.cgColor ?? UIColor.clear.cgColor
                    }
                }
            }
            // Le double-tap OUVRE ou REFERME les bandes sans rebuild : elles se
            // peignent (ou se retirent) ici, sur le même geste qui change la
            // gravity. Sans cette ligne, basculer en AJUSTÉ laissait la bande
            // nue jusqu'au prochain rebuild — un même geste avec deux résultats,
            // selon un chemin que l'auteur ne voit pas.
            refreshLetterboxFill(hashes: letterboxFillHashes)
            return
        }

        // Clear existing content
        contentLayer?.removeFromSuperlayer()
        letterboxFillLayer?.removeFromSuperlayer()
        letterboxFillLayer = nil
        letterboxSourceImage = nil
        avPlayerLayer?.removeFromSuperlayer()
        avPlayer?.pause()
        if let observer = backgroundLoopObserver {
            NotificationCenter.default.removeObserver(observer)
            backgroundLoopObserver = nil
        }
        avPlayer = nil
        avPlayerLayer = nil
        avPlayerLooper = nil
        contentLayer = nil
        // Reset readiness flag — sera re-armé par les fast-paths (warm hit /
        // HTTP load) en `case .image`. Couleur / gradient n'utilisent pas ce
        // flag (ils ont leur propre chemin `.solidColor` / `.gradient` dans
        // `scheduleContentReadyEvaluation`).
        hasFinalContentStamped = false

        switch kind {
        case .solidColor(let color):
            backgroundColor = color.cgColor
            // Overlay the slide-level thumbHash ON TOP of the solid color so
            // the preview image is visible during loading AND after (until
            // foreground media stamps a real bitmap). User request 2026-05-28:
            // « Je veux le thumbHash ou le thumbnail de la story par dessus
            // la couleur unie et non en dessous ». Without this, color-only
            // stories with a published thumbHash showed only the flat colour
            // and the preview was confined to the letterbox bands via
            // `storyBlurredBackdrop`.
            stampSlidePreviewThumbHashLayerIfAvailable(slidePreviewThumbHash)
        case .gradient(let colors, let direction):
            backgroundColor = nil
            let g = CAGradientLayer()
            g.frame = bounds
            g.colors = colors.map { $0.cgColor }
            switch direction {
            case .topToBottom:
                g.startPoint = CGPoint(x: 0.5, y: 0); g.endPoint = CGPoint(x: 0.5, y: 1)
            case .leftToRight:
                g.startPoint = CGPoint(x: 0, y: 0.5); g.endPoint = CGPoint(x: 1, y: 0.5)
            case .topLeftToBottomRight:
                g.startPoint = .zero; g.endPoint = CGPoint(x: 1, y: 1)
            }
            addSublayer(g)
            contentLayer = g
            // Same overlay logic as solidColor — gradient bg + thumbHash on top.
            stampSlidePreviewThumbHashLayerIfAvailable(slidePreviewThumbHash)
        case .image(let postMediaId, let thumbHash):
            let img = CALayer()
            img.frame = bounds
            // Initial fallback gravity, refined when UIImage loads (warm cache or async)
            img.contentsGravity = {
                if let o = self.transform3D.videoFitMode {
                    return o == "fit" ? .resizeAspect : .resizeAspectFill
                }
                return .resizeAspectFill
            }()
            img.masksToBounds = true
            addSublayer(img)
            contentLayer = img

            // Composer in-place edits live in `loadedImages` keyed by the media
            // object id, but the bg routing key (postMediaId) is the file://
            // mediaURL. Derive the id from the temp filename ({id}.jpg) so an
            // edited bitmap is surfaced — parity with StoryMediaLayer's media.id
            // fallback. Used for the synchronous prime AND the async lookup below.
            let directURLForWarm = Self.directURLIfAny(from: postMediaId)
            let composerKey = directURLForWarm?.deletingPathExtension().lastPathComponent
            let stampId = composerKey ?? postMediaId
            var hasVisual = false

            // (0) SYNCHRONOUS composer-cache prime — an edited bitmap written by
            // `MeeshyImageEditorView` onAccept (loadedImages[id]) wins over the
            // on-disk file:// (which still holds the ORIGINAL). This is what makes
            // an image edit appear live on the canvas; the filter is baked via
            // `stampFinalImage` so the canvas shows the edited+filtered bitmap.
            if let synchronousReader = imageCache as? ComposerImageCacheReader,
               let edited = (composerKey.flatMap { synchronousReader.images[$0] }) ?? synchronousReader.images[postMediaId] {
                stampFinalImage(edited, imageId: stampId, on: img)
                hasVisual = true
            }

            // (1) Warm NSCache hit (revisited story) → stamp directly (filtered),
            // no ThumbHash placeholder flash.
            let warmURL: URL? = directURLForWarm ?? resolver?(postMediaId)
            if !hasVisual, let warm = warmURL,
               let warmImage = CacheCoordinator.warmedImage(for: warm.absoluteString) {
                stampFinalImage(warmImage, imageId: stampId, on: img)
                hasVisual = true
            }

            // Synchronous thumbHash placeholder (si pas de hit cache chaud).
            if !hasVisual,
               let hash = thumbHash,
               let placeholderImage = ThumbHashDecoder.decodeIfAvailable(hash) {
                Self.withDisabledCAActions {
                    img.contents = CanvasImageOrientation.displayCGImage(placeholderImage)
                }
                hasVisual = true
            }

            // Toujours `.clear` : le parent (`StoryCanvasUIView` lui-même
            // déjà `.clear`, qui laisse voir le composer ou le viewer
            // derrière) porte le fond cinéma. Avant ce changement on posait
            // un `.black` cgColor en fallback "aucun visuel" ; pendant les
            // transitions (slide change, rebuildLayers pendant un edit /
            // validation d'élément) cette couche flashait NOIR ~1 frame
            // avant que le bitmap réel arrive — exactement le scintillement
            // décrit par l'utilisateur. Garder `.clear` rend la couche
            // muette pendant la latence d'async ; le parent reste visible.
            backgroundColor = letterboxColor?.cgColor ?? UIColor.clear.cgColor

            // Charge le bitmap réel par-dessus le placeholder thumbHash.
            // Trois sources, dans l'ordre : (1) cache image fourni par le
            // reader (preview composer via `PreloadedImageCacheReader`, ou un
            // cache disque), (2) URL directe embarquée dans `postMediaId`
            // (file:// du composer après PhotosPicker, ou URL distante),
            // (3) resolver `postMediaId` distant → URL → cache global.
            //
            // BUGFIX : le chemin (3) était auparavant imbriqué dans un
            // `if let imageCache` — or le viewer en ligne passe `imageCache: nil`
            // (seul le preview en fournit un). Résultat : une story publiée
            // dont le background référence un `postMediaId` distant ne chargeait
            // jamais son image (rectangle noir + loader infini, le timer ne
            // démarrant jamais car `onContentReady` ne se déclenchait pas). Le
            // chemin (3) est désormais gardé par le `resolver` seul, et passe
            // par `CacheCoordinator.shared.images` (NSCache → disque TTL 1 an →
            // réseau, requêtes dédupliquées) : une slide déjà vue — ou
            // préchauffée par le prefetcher — s'affiche sans re-télécharger.
            let directURL = Self.directURLIfAny(from: postMediaId)
            let imageCacheReader = imageCache
            let urlResolver = resolver
            if directURL != nil || imageCacheReader != nil || urlResolver != nil {
                Task { @MainActor [weak self, weak img] in
                    // (1) Composer/disk cache — try the media-id key first (edited
                    // bitmap), then the routing key (published / disk). Filtered via
                    // stampFinalImage so the baked filter survives the async path.
                    if let imageCacheReader {
                        var cached: UIImage? = nil
                        if let key = composerKey { cached = await imageCacheReader.cachedImage(for: key) }
                        if cached == nil { cached = await imageCacheReader.cachedImage(for: postMediaId) }
                        if let cached {
                            self?.stampFinalImage(cached, imageId: stampId, on: img)
                            return
                        }
                    }
                    // (2) URL directe embarquée, sinon (3) resolver distant.
                    // Stories publiées avant le `sanitizedForServerPublish()`
                    // peuvent contenir un `file://` mediaURL pointant vers la
                    // sandbox de l'auteur, inaccessible côté lecteur. Plus
                    // largement, n'importe quelle erreur sur l'URL primaire
                    // (404, timeout, network error, fichier supprimé...) doit
                    // déclencher un fallback sur l'URL canonique CDN obtenue
                    // via le postMediaId (resolver) — c'est la vérité serveur,
                    // toujours valide tant que le post existe.
                    let primary = directURL ?? urlResolver?(postMediaId)
                    guard let url = primary else { return }

                    var loadedImage: UIImage? = await Self.loadImage(from: url)
                    if loadedImage == nil,
                       let fallback = urlResolver?(postMediaId),
                       fallback != url {
                        loadedImage = await Self.loadImage(from: fallback)
                    }

                    guard let uiImage = loadedImage else { return }
                    self?.stampFinalImage(uiImage, imageId: stampId, on: img)
                }
                break
            }
        case .video(let postMediaId, let looping, let mute, let thumbHash):
            // Édition composer : même fallback URL directe qu'en image.
            let resolvedURL: URL? = {
                if let direct = Self.directURLIfAny(from: postMediaId) { return direct }
                return resolver?(postMediaId)
            }()
            storyMediaLog.info("bg video configure id=\(postMediaId.suffix(24), privacy: .public) resolved=\(resolvedURL?.absoluteString.suffix(40) ?? "nil", privacy: .public)")
            guard let remoteURL = resolvedURL else {
                // Pas d'URL : on laisse le layer transparent, le parent
                // (composer / viewer) porte le fond. Évite un flash noir
                // pendant qu'une vidéo de fond async se résout (le
                // resolver peut retourner nil 1-2 frames le temps que le
                // postMediaId soit enregistré côté cache).
                backgroundColor = letterboxColor?.cgColor ?? UIColor.clear.cgColor
                break
            }

            // Fast-path : URL locale immédiate ou cache disk hit → AVPlayer
            // direct, sans placeholder noir ni ThumbHash (la première frame
            // de la vidéo est rendue très vite).
            if remoteURL.isFileURL {
                storyMediaLog.info("bg video path=local-file")
                backgroundColor = letterboxColor?.cgColor ?? UIColor.clear.cgColor
                attachBackgroundPlayer(url: remoteURL, looping: looping, mute: mute,
                                       fitOverride: self.transform3D.videoFitMode)
                break
            }
            if let local = CacheCoordinator.videoLocalFileURL(for: remoteURL.absoluteString) {
                storyMediaLog.info("bg video path=disk-hit")
                backgroundColor = letterboxColor?.cgColor ?? UIColor.clear.cgColor
                attachBackgroundPlayer(url: local, looping: looping, mute: mute,
                                       fitOverride: self.transform3D.videoFitMode)
                break
            }
            storyMediaLog.info("bg video path=cache-miss → stream remote + cache bg")

            // Cache miss : placeholder ThumbHash dans un sublayer si dispo,
            // sinon on garde le layer transparent (le parent porte le fond
            // cinéma — ne JAMAIS forcer un `.black` ici, ça provoque le
            // flash NOIR transitoire pendant les rebuildLayers).
            if let hash = thumbHash,
               let placeholderImage = ThumbHashDecoder.decodeIfAvailable(hash) {
                let placeholder = CALayer()
                placeholder.frame = bounds
                placeholder.contents = CanvasImageOrientation.displayCGImage(placeholderImage)
                placeholder.contentsGravity = .resizeAspectFill
                placeholder.masksToBounds = true
                addSublayer(placeholder)
                contentLayer = placeholder
            }
            backgroundColor = letterboxColor?.cgColor ?? UIColor.clear.cgColor

            // Stream l'URL distante IMMÉDIATEMENT : `AVPlayer` fait du
            // progressive/range loading (l'endpoint sert `Accept-Ranges: bytes`
            // / 206), donc la 1ère frame arrive en ~centaines de ms quelle que
            // soit la taille du fichier. L'AVPlayerLayer s'ajoute par-dessus le
            // placeholder ThumbHash, qui disparaît visuellement quand la vidéo
            // joue. Bloquer sur un download INTÉGRAL (`videoLocalFileURLAwait`)
            // rendait les grosses stories injouables sur réseau device
            // (cellulaire/wifi) : un clip de 30+ Mo ne finissait pas de descendre
            // avant l'auto-advance de la slide → la vidéo n'apparaissait jamais
            // (ne marchait que sur le réseau rapide du simulateur, et le failsafe
            // 2s faisait avancer la barre sur le flou). Régression 2026-05-20
            // (f917d30b94) ; on restaure le streaming d'avant.
            let fitOverride = self.transform3D.videoFitMode
            attachBackgroundPlayer(url: remoteURL, looping: looping, mute: mute,
                                   fitOverride: fitOverride)
            // Peuple le cache disque HORS du chemin de lecture pour qu'une
            // revisite joue depuis un fichier local. Détaché + priorité utility
            // pour ne jamais concurrencer le stream live.
            let cacheKey = remoteURL.absoluteString
            Task.detached(priority: .utility) {
                _ = try? await CacheCoordinator.shared.video.data(for: cacheKey)
            }
        }

        // **Le remplissage de bande se pose ICI, une seule fois pour les cinq
        // branches** — jamais dans chacune. `insertSublayer(at: 0)` le range
        // sous tout ce que le `switch` vient d'ajouter, quel que soit l'ordre,
        // et une pose par branche aurait divergé au premier `case` ajouté.
        refreshLetterboxFill(hashes: letterboxFillHashes)

        // Transform appliqué au CONTENT — voir `applyContentTransform`.
        applyContentTransform(transform.caTransform())
    }

    /// Stamps the slide-level thumbHash as a sublayer ON TOP of the current
    /// solid color / gradient bg. Used by the `.solidColor` and `.gradient`
    /// cases of `configure(...)` so color-only stories that ship a published
    /// preview show that preview rather than just the flat tint
    /// (user spec 2026-05-28 « thumbnail par dessus la couleur unie »).
    /// No-op when the hash is nil, empty, or fails to decode.
    private func stampSlidePreviewThumbHashLayerIfAvailable(_ thumbHash: String?) {
        guard let hash = thumbHash, !hash.isEmpty,
              let placeholderImage = ThumbHashDecoder.decodeIfAvailable(hash)?.cgImage else {
            return
        }
        let preview = CALayer()
        preview.frame = bounds
        preview.contents = placeholderImage
        preview.contentsGravity = .resizeAspectFill
        preview.masksToBounds = true
        addSublayer(preview)
        contentLayer = preview
    }
}
