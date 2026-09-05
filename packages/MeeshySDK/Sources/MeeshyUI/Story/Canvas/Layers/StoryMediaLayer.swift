import Foundation
import QuartzCore
import AVFoundation
import UIKit
import os
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

    /// **Les OCTETS, et pas seulement l'image** (#4925).
    ///
    /// `image(for:)` rend une `UIImage`, c'est-à-dire UNE image : pour un GIF ou
    /// un APNG, l'animation est déjà perdue à ce niveau, avant qu'aucune vue ne
    /// puisse la demander. C'est ce maillon — et lui seul — qui faisait qu'un
    /// sticker animé arrivait figé jusqu'au canvas, quel que soit le soin mis
    /// en aval.
    ///
    /// Le repli par défaut rend `nil`, et il est une DÉCLARATION, pas une
    /// commodité : **un chargeur qui ne sert pas d'octets ne peut pas animer**,
    /// et le dire explicitement vaut mieux qu'obliger chaque bouchon de test à
    /// implémenter une méthode dont il n'a que faire. Le conformeur de
    /// PRODUCTION, lui, doit la servir — `StoryStickerAnimatedBytesGuardTests`
    /// le vérifie, sans quoi le repli s'appliquerait partout en silence et la
    /// feature n'existerait nulle part.
    nonisolated func data(for urlString: String) async -> Data?
}

public extension StoryMediaImageLoading {
    nonisolated func data(for urlString: String) async -> Data? { nil }
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

    /// Les octets bruts, servis par la MÊME pile que `image(for:)` — L1 NSCache,
    /// L2 disque, réseau. Aucun second chemin de téléchargement : ce serait une
    /// jumelle du cache, avec sa propre politique et ses propres ratés.
    public nonisolated func data(for urlString: String) async -> Data? {
        try? await CacheCoordinator.shared.images.data(for: urlString)
    }
}

/// Référence faible transportable dans un bloc `@Sendable` — ici celui de
/// l'observer `AVPlayerItemDidPlayToEndTime`, qui doit masquer le layer sans le
/// retenir (`layer → observer → layer` serait un cycle).
///
/// Une variable locale `weak var` faisait le même travail, mais le compilateur
/// la signalait « never mutated; consider changing to 'let' constant » — un
/// conseil inapplicable : `weak let` est refusé (« 'weak' must be a mutable
/// variable, because it may change at runtime »). La boîte porte la mutabilité
/// que `weak` exige et se capture, elle, comme une constante.
///
/// NOTE — NON GÉNÉRIQUE délibérément, comme `WeakBox`/`FeedStoreWeakBox`
/// côté app : la forme générique a fait tomber l'optimiseur Swift 6.3.2
/// (`EarlyPerfInliner`) sur le `deinit` synthétisé en Release
/// `-O -whole-module-optimization`. Un autre call site = une autre copie typée.
private final class StoryMediaLayerWeakBox: @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    nonisolated(unsafe) weak var value: StoryMediaLayer?
    nonisolated init(_ value: StoryMediaLayer) { self.value = value }
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
public final class StoryMediaLayer: CALayer {
    public private(set) nonisolated(unsafe) var media: StoryMediaObject?
    public private(set) nonisolated(unsafe) weak var avPlayer: AVPlayer?
    public private(set) nonisolated(unsafe) var avPlayerLayer: AVPlayerLayer?

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "media")

    /// Fenêtre de rognage NON destructive du média foreground courant — `nil`
    /// tant que la durée réelle de la source n'a pas été chargée (le fichier
    /// vient d'être attaché) OU quand le média n'a jamais été rogné.
    /// `attachPlayer` la remet à `nil` à chaque nouvel item ; `startLoadingTrimWindow`
    /// la peuple de façon asynchrone une fois `AVAsset.load(.duration)` résolu,
    /// via le résolveur UNIQUE `StoryMediaObject.trimBounds(sourceDuration:)`
    /// (voir `MediaTrimRule.swift`) — jamais une seconde logique de résolution
    /// ici. `nil` se comporte comme "source entière" : c'est le repli qui
    /// garantit qu'une fenêtre pas encore connue ne fige jamais l'image ni ne
    /// coupe le son, elle joue seulement depuis le début le temps que la
    /// vraie fenêtre arrive (rattrapée par `alignToTimelineThenPlay` dès que
    /// `applyResolvedTrimBounds` la pose, via le même seuil de dérive que le
    /// calage timeline normal).
    private nonisolated(unsafe) var currentTrimBounds: MediaTrimBounds?

    /// Reflète l'état de mute global du reader (bouton sidebar / contexte). Le
    /// canvas synchronise cette propriété sur chaque media layer dès qu'un
    /// `handleComposerMute()` / `handleComposerUnmute()` ou un changement de
    /// `StoryReaderContext.mute` est reçu, et `attachPlayer` la consomme pour
    /// stamper `AVPlayer.isMuted` sur un player fraîchement créé. C'est la
    /// brèche qui faisait que la sidebar mute coupait le mixer audio
    /// (foreground chips + voice) mais pas l'audio de la vidéo de fond.
    @MainActor
    public var isMuted: Bool = false {
        didSet {
            guard oldValue != isMuted else { return }
            avPlayer?.isMuted = isMuted
        }
    }

    /// Volume courant de la couche, dans `0...StoryVolume.maxGain`.
    ///
    /// Initialisé depuis `media.volume` au `configure`, puis réécrit à chaque
    /// tick par l'automation du canvas (`applyVolumeAutomation`). C'est cette
    /// propriété — et non `media?.volume` — que `attachPlayer` stampe : relire
    /// le modèle à l'attache écraserait l'automation en cours, exactement
    /// comme le `1.0` codé en dur le faisait sur la couche de fond.
    @MainActor
    public var volume: Float = 1.0 {
        didSet {
            guard oldValue != volume else { return }
            avPlayer?.volume = volume
        }
    }

    /// Drapeau de lecture levé par le canvas (`StoryCanvasUIView`) en mode
    /// `.play` pour autoriser le démarrage de la vidéo foreground — EXACT
    /// pendant du `StoryBackgroundLayer.isPlaybackActive`. Sans ce gate,
    /// `attachPlayer` appelait `play()` inconditionnellement dès que l'URL
    /// était résolue : une vidéo foreground attachée AVANT que la slide soit
    /// prête (« GO » / content-ready) démarrait donc EN AVANCE sur la vidéo de
    /// fond + l'audio, désynchronisant le démarrage (user 2026-06-24). Le
    /// canvas pose ce drapeau au content-ready, en phase avec la vidéo de fond
    /// et le mixer audio ; il est sticky pour qu'une vidéo attachée APRÈS le GO
    /// (octets arrivés plus tard) démarre immédiatement à son tour.
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

    /// Playhead unifié de la slide (secondes), poussé par le canvas à chaque
    /// rebuild + aux transitions de lecture (GO, resume). Sert au CALAGE
    /// timeline : quand la vidéo foreground (re)démarre, on la positionne à
    /// `max(0, slidePlayheadSeconds − startTime)`. Corrige une vidéo arrivée en
    /// retard (réseau) ou une ouverture/scrub à `t > 0`, qui sinon démarraient à
    /// leur frame 0 — décalées du playhead et de l'audio. JAMAIS appliqué par
    /// frame : seul `alignToTimelineThenPlay()` (au démarrage du player) seek, et
    /// uniquement si la dérive dépasse le seuil — un resume en place (long-press)
    /// ou une bascule plein écran ne provoque donc aucun saut.
    @MainActor public var slidePlayheadSeconds: Double = 0

    /// Au-delà de cette dérive (secondes) entre la position du player et la cible
    /// timeline, on seek ; en-deçà on lance la lecture telle quelle (pas de
    /// hoquet sur un resume déjà aligné).
    private static let timelineSeekDriftThreshold: Double = 0.30

    private nonisolated(unsafe) var loopObserver: NSObjectProtocol?

    /// Levé par le canvas composer (`StoryCanvasUIView.playsVideoInEditMode`)
    /// pour que les vidéos foreground JOUENT et bouclent en mode `.edit` (live
    /// preview de l'éditeur). Hors composer (prefetcher hors-écran, défaut),
    /// reste `false` → en `.edit` la vidéo se cale sur sa frame 0 sans jouer,
    /// comme avant. En `.play` (reader/preview) ce drapeau est ignoré : la
    /// lecture y est toujours active et joue une seule fois.
    @MainActor
    public var playsInEditMode: Bool = false {
        didSet {
            guard oldValue != playsInEditMode, playsInEditMode else { return }
            avPlayer?.play()
        }
    }

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

    /// In-flight video load (pré-cache + AVPlayer setup). Annulé à chaque
    /// `configureVideo` pour éviter qu'une URL obsolète stamp la layer après
    /// une re-configure (live composer, scrub).
    private nonisolated(unsafe) var currentVideoLoadTask: Task<Void, Never>?

    /// Génération token incrémenté à chaque `configureVideo` (et à chaque
    /// `tearDownPlayback`). Une `Task` lancée avec la valeur `N` ne touche
    /// plus la layer si le token a depuis incrémenté — protection race entre
    /// `await videoLocalFileURLAwait` et `prune(keepIds:)` → `tearDownPlayback`
    /// → re-`configure(...)` rapide sur le même layer.
    private nonisolated(unsafe) var videoLoadGeneration: UInt64 = 0

    /// Placeholder CALayer affichant le ThumbHash décodé pendant le fetch
    /// vidéo. Retiré avec un fade out 200 ms quand l'AVPlayer est prêt.
    private nonisolated(unsafe) var placeholderLayer: CALayer?

    /// URL actuellement attachée au player. Garde d'idempotence
    /// d'`attachPlayer` : reconfigurer la layer avec la MÊME URL (cache `.edit`
    /// qui réutilise la layer sur un changement de géométrie, rebuild du
    /// canvas composer) ne doit PAS `replaceCurrentItem` ni re-seek — la
    /// lecture en cours continue sans coupure (impératif user 2026-07-11 :
    /// manipuler un élément ne fait pas sauter les vidéos qui jouent).
    private nonisolated(unsafe) var attachedURL: URL?

    /// Fournisseur du player du média porteur (O16), posé par `configure` depuis
    /// le contexte de LECTURE. `nil` en composition : la couche ouvre le sien.
    private nonisolated(unsafe) var playerProvider: (any StoryCarrierPlayerProviding)?

    /// `true` quand le player courant a été PRÊTÉ par le fournisseur : la couche
    /// s'en détache à la fermeture, elle ne le vide jamais — l'item appartient à
    /// la surface qui le porte.
    private nonisolated(unsafe) var playsAProvidedPlayer = false

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryMediaLayer does not support NSCoder")
    }

    // `nonisolated` : ne touche que `loopObserver` (nonisolated(unsafe)). Évite
    // le shim `swift_task_deinitOnExecutorMainActorBackDeploy` qui double-free le
    // TaskLocal scope et abort à la libération (cf. CommandStack/ReaderAudioMixer).
    nonisolated deinit {
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
                          imageCache: ImageCacheReader? = nil,
                          playerProvider: (any StoryCarrierPlayerProviding)? = nil,
                          renderScale: CGFloat = UIScreen.main.scale) {
        self.media = media
        self.playerProvider = playerProvider
        // Niveau de BASE repris du modèle. L'automation du canvas réécrira
        // `volume` au tick suivant si la slide en porte une ; sans cette ligne,
        // une couche fraîchement configurée jouerait à 1.0 et ignorerait le
        // réglage de l'auteur.
        volume = media.volume
        // Un layer fraîchement configuré démarre visible : la disparition d'une
        // vidéo foreground terminée (`.play`) est posée par l'observer de fin,
        // pas héritée d'un état masqué d'une précédente configuration.
        isHidden = false

        // **Le recadrage change les PROPORTIONS de l'objet** (#5085) : un média
        // recadré n'a plus celles de son fichier. S'en tenir à `aspectRatio`
        // peindrait la source entière dans un cadre recadré — l'aperçu
        // mentirait sur le rendu, ce que la loi 6 interdit.
        //
        // Et le recadrage lui-même passe par `contentsRect`, plus bas : un
        // sous-rectangle NORMALISÉ appliqué par le compositeur. C'est la
        // promesse de la planche `4c` au niveau du rendu — « aucun ne
        // ré-encode » — et la seule écriture qui la tienne sans toucher au
        // fichier.
        let effectiveRatio = MediaCropRule.effectiveRatio(
            sourceRatio: media.aspectRatio, crop: media.crop)
        // Design-space frame (1080-référentiel) → render-space via geometry.
        let baseDesignSize = Self.baseMediaDesignSize(aspectRatio: effectiveRatio)
        applyCrop(media.crop)
        let scaledDesignSize = CGSize(
            width: baseDesignSize.width * CGFloat(media.scale),
            height: baseDesignSize.height * CGFloat(media.scale)
        )
        let renderedSize = geometry.render(scaledDesignSize)

        let designCenterX = geometry.designLength(forNormalized: CGFloat(media.x))
        let designCenterY = geometry.designHeightLength(forNormalized: CGFloat(media.y))
        let renderedCenter = geometry.render(CGPoint(x: designCenterX, y: designCenterY))

        bounds = CGRect(origin: .zero, size: renderedSize)
        position = renderedCenter
        anchorPoint = media.anchor
        transform = CATransform3DMakeRotation(CGFloat(media.rotation) * .pi / 180, 0, 0, 1)
        zPosition = CGFloat(media.zIndex)
        contentsScale = renderScale
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
        if shouldRasterize { rasterizationScale = renderScale }
    }

    /// Poses a decoded video frame as this layer's `contents` for the MP4 export
    /// path. A foreground video renders live through an `AVPlayerLayer` sublayer
    /// that `CALayer.render(in:)` does NOT capture, and a `thumbHash` placeholder
    /// sublayer would occlude the frame — so we strip the live sublayers and pose
    /// the frame as the layer's own contents (which `render(in:)` captures).
    /// `resizeAspectFill` mirrors the player's `videoGravity`. Idempotent: after
    /// the first call no sublayers remain to remove.
    @MainActor
    public func applyExportFrame(_ image: CGImage?) {
        sublayers?.forEach { $0.removeFromSuperlayer() }
        avPlayerLayer = nil
        avPlayer?.pause()
        contents = image
        contentsGravity = .resizeAspectFill
    }

    // MARK: - Sizing

    /// Rayon des coins arrondis du média, exprimé en proportion de son petit
    /// côté rendu. Le cadre foreground (`StoryCanvasUIView.applyForegroundFrames`)
    /// pose son `border` sur ce même layer : bordure et image héritent donc
    /// exactement du même arrondi, sans constante dupliquée.
    nonisolated static let cornerRadiusFraction: CGFloat = 0.06

    /// Base design size (in 1080-référentiel pixels) of a media before user `scale`
    /// is layered on. Envelope is 65 % of the short canvas side, fitted to aspect.
    ///
    /// Exposé `internal static` pour que `StoryCanvasUIView.updateManipulatedItemLayer`
    /// puisse appliquer la MÊME convention que `configure` (bounds = base ×
    /// scale, transform = rotation only) — sinon le lightweight gesture
    /// update double-scale en posant `transform = scale × rotation` sur des
    /// bounds déjà × scale (bug "media grossit après rotation puis pan",
    /// 2026-05-27). Aligne avec le pattern déjà appliqué au text scale.
    /// **Le recadrage, posé sur le COMPOSITEUR** (#5085).
    ///
    /// `contentsRect` prend un sous-rectangle normalisé des contenus : c'est
    /// exactement la forme de `MediaCropRect`, et rien n'est ré-encodé — le
    /// fichier reste celui qui est déjà en train de partir.
    ///
    /// Le remettre au cadre ENTIER quand il n'y a pas de recadrage n'est pas
    /// une redite : un calque réutilisé garderait sinon le `contentsRect` de
    /// l'objet qu'il peignait avant, et l'auteur verrait un média recadré
    /// qu'il n'a jamais recadré.
    private func applyCrop(_ crop: MediaCropRect?) {
        guard let crop, !crop.isFull else {
            contentsRect = CGRect(x: 0, y: 0, width: 1, height: 1)
            return
        }
        let borné = MediaCropRule.clamped(crop)
        contentsRect = CGRect(x: borné.x, y: borné.y,
                              width: borné.width, height: borné.height)
    }

    internal static func baseMediaDesignSize(aspectRatio: Double) -> CGSize {
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

    /// Resynchronise l'`AVPlayerLayer` hébergé (et le `cornerRadius`) sur les
    /// `bounds` courants. `configureVideo` ne pose `avPlayerLayer.frame` qu'à la
    /// création, et le fast-path gesture (`StoryCanvasUIView`) mute `bounds`
    /// directement sans recréer le player (réutilisation via `replaceCurrentItem`)
    /// — sans ça la vidéo foreground gardait son ancienne taille pendant que le
    /// cadre/bordure grandissait : elle ne remplissait plus son cadre d'effet à
    /// la bonne proportion (bug resize / player recyclé). `CATransaction` désactive
    /// l'animation implicite pour ne pas introduire de tween par tick en `.play`.
    public override nonisolated func layoutSublayers() {
        super.layoutSublayers()
        let targetRadius = min(bounds.width, bounds.height) * Self.cornerRadiusFraction
        let needsRadius = abs(cornerRadius - targetRadius) > 0.01
        let needsPlayerFrame = avPlayerLayer != nil && avPlayerLayer?.frame != bounds
        guard needsRadius || needsPlayerFrame else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if needsRadius { cornerRadius = targetRadius }
        if needsPlayerFrame { avPlayerLayer?.frame = bounds }
        CATransaction.commit()
    }

    // MARK: - URL resolution

    /// Resolves the playable URL for a foreground media object.
    ///
    /// Order (identical to `StoryReaderContext.postMediaURLResolver`):
    ///  1. `resolver(media.postMediaId)` — preloaded composer-preview asset,
    ///     then the published `StoryItem.media` remote URL.
    ///  2. Fallback `media.mediaURL` — fixtures and the `file://` URL the
    ///     composer edition embeds directly on the object. A `file://` here is
    ///     the AUTHOR's local edition asset: on another viewer's device it points
    ///     into the author's sandbox and never exists. Honouring it would feed a
    ///     dead path to the loader (silent blank foreground, or a video player
    ///     wired to nothing) — the exact "foreground missing on another user's
    ///     story" symptom. So a file URL is only used when it resolves on THIS
    ///     device; otherwise the media is treated as unresolved and the reader's
    ///     content-readiness failsafe takes over.
    @MainActor
    private func resolvedMediaURL(for media: StoryMediaObject,
                                  resolver: (@Sendable (String) -> URL?)?) -> URL? {
        if !media.postMediaId.isEmpty, let resolved = resolver?(media.postMediaId) {
            return resolved
        }
        guard let urlString = media.mediaURL, let url = URL(string: urlString) else {
            return nil
        }
        // The file-existence guard applies ONLY in the READER (a resolver is
        // always provided there). A `file://` that survives a resolver miss is
        // the AUTHOR's local edition path — dead on another viewer's device — so
        // we honour it only when it resolves on THIS device. In the COMPOSER /
        // edit (resolver == nil) the file:// IS the intended local asset (and
        // fixtures use placeholder paths), so it is used as-is.
        if resolver != nil, url.isFileURL {
            return FileManager.default.fileExists(atPath: url.path) ? url : nil
        }
        return url
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
        // Cache key : pour les médias publiés on a un `postMediaId` serveur ;
        // pour les médias composer (PhotosPicker → tmp file) postMediaId reste
        // vide, donc on retombe sur `media.id` (UUID local) qui est exactement
        // la clé utilisée par `viewModel.loadedImages` côté composer. Sans
        // ce fallback, `MeeshyImageEditorView` onAccept écrivait
        // `loadedImages[media.id] = edited` et le `ComposerImageCacheReader`
        // était bien câblé, mais la lookup ici utilisait `""` → cache miss →
        // chemin file:// servait l'ancien bitmap (bug 2026-05-27).
        let cacheKey: String = media.postMediaId.isEmpty ? media.id : media.postMediaId

        // Composer fast-path : si un bitmap in-memory est dans le reader
        // (typiquement après `MeeshyImageEditorView` onAccept), il prime sur
        // le chemin file:// — la version éditée n'a pas été ré-écrite dans
        // le fichier tmp et le file:// servirait l'original obsolète.
        if let imageCache,
           let synchronousReader = imageCache as? ComposerImageCacheReader,
           let cached = CanvasImageOrientation.displayCGImage(synchronousReader.images[cacheKey]) {
            contents = cached
            return
        }

        // Local file:// URLs stay on the synchronous path — they are not
        // blocking in any meaningful sense (no DNS / TCP / TLS) and the
        // composer preview relies on the image being present by the time
        // `configure(with:)` returns. Anything with a network scheme goes
        // through the async cache.
        if let url = resolvedURL, url.isFileURL {
            if let data = try? Data(contentsOf: url),
               let cgImage = CanvasImageOrientation.displayCGImage(UIImage(data: data)) {
                contents = cgImage
            }
            return
        }

        let loader = imageLoader
        // Strong capture de `self` dans la Task. `[weak self]` faisait que la
        // layer se désallouait entre le `await` et le stamp `contents` —
        // `rebuildLayers()` à 60 Hz détache la layer du parent et, à chaque
        // cache miss du `StoryRendererCache`, ARC libère l'ancien layer avant
        // que la Task n'arrive au stamp. Le `guard let self` retournait sans
        // jamais stamper le bitmap → l'image foreground restait invisible.
        // Le cycle Task→self→Task se ferme dès le `return` de la Task :
        // pas de leak persistant.
        currentLoadTask = Task { @MainActor in
            // A configure() that superseded this one (or a teardown) cancels the
            // task before it runs. Bail out *before* awaiting the loader: a
            // cancelled task must never register a fetch continuation it will
            // then abandon — that leaks a suspended load (and hangs any awaiter
            // of `currentLoadTask.value`).
            guard !Task.isCancelled else { return }
            // (1) Fast-path image cache (composer preview / disk-backed reader).
            if let imageCache,
               let cached = CanvasImageOrientation.displayCGImage(await imageCache.cachedImage(for: cacheKey)) {
                guard !Task.isCancelled else { return }
                self.contents = cached
                return
            }
            // (2) Network URL through the disk-cache-backed loader.
            guard let url = resolvedURL else { return }
            let loaded = await loader.image(for: url.absoluteString)
            guard !Task.isCancelled,
                  let cgImage = CanvasImageOrientation.displayCGImage(loaded) else { return }
            self.contents = cgImage
        }
    }

    // MARK: - Video path

    @MainActor
    private func configureVideo(_ media: StoryMediaObject,
                                mode: RenderMode,
                                resolver: (@Sendable (String) -> URL?)?) {
        guard let remoteURL = resolvedMediaURL(for: media, resolver: resolver) else { return }

        // Fast-path cache chaud : si l'URL est déjà locale (file://) OU si le
        // cache disk a déjà le fichier, on attache directement le player SANS
        // afficher de placeholder ThumbHash — évite le flash visuel quand on
        // revisite une story déjà vue / pré-chauffée par le prefetcher.
        if let immediateLocalURL = synchronouslyResolvedLocalVideoURL(remoteURL) {
            currentVideoLoadTask?.cancel()
            videoLoadGeneration &+= 1
            // Pas de placeholder — le bitmap réel est instantané.
            // Loop UNIQUEMENT hors lecture reader : en `.play` une vidéo
            // foreground est un composant de timeline qui joue UNE fois puis
            // disparaît (cf. `attachPlayer`). Seul le composer (`.edit`) boucle.
            attachPlayer(url: immediateLocalURL, mode: mode, loop: mode != .play)
            return
        }

        // Cache miss → ThumbHash placeholder pendant le fetch async — SAUF si
        // ce player joue déjà cette URL distante (reconfiguration in-place du
        // cache `.edit` sur changement de géométrie) : re-poser le placeholder
        // recouvrirait la vidéo en cours de lecture, et `attachPlayer`
        // (idempotent) ne le fadera jamais.
        let isReconfiguringAttachedURL = attachedURL == remoteURL
            && avPlayerLayer?.player?.currentItem != nil
        if !isReconfiguringAttachedURL {
            applyThumbHashPlaceholder(media.thumbHash)
        }

        // Annule le load précédent : un layer recyclé pour un autre média
        // ne doit pas stamp l'ancienne URL une fois résolue.
        currentVideoLoadTask?.cancel()
        videoLoadGeneration &+= 1
        let generation = videoLoadGeneration

        // Attache l'AVPlayer DÈS MAINTENANT avec l'URL distante. Sans ça,
        // toute lecture immédiate (tests, indicateurs UI, accessibilité)
        // verrait `avPlayer == nil` jusqu'à ce que la tâche async ait
        // résolu le cache local. La task de cache continue tourner en
        // arrière-plan et swap vers un fichier local s'il devient
        // disponible — c'est une optimisation, pas une condition
        // préalable à l'existence du player.
        attachPlayer(url: remoteURL, mode: mode, loop: mode != .play)

        currentVideoLoadTask = Task { @MainActor [weak self] in
            // Garantit une URL file:// avant de toucher AVURLAsset — sinon
            // certaines surfaces (export, AVAudioFile) rejettent le HTTPS
            // direct. Le helper retourne `nil` si le fetch échoue.
            let localURL = await CacheCoordinator.videoLocalFileURLAwait(for: remoteURL) ?? remoteURL
            if Task.isCancelled { return }
            guard let self else { return }
            // Race guard : entre l'await et ici, `tearDownPlayback` ou un
            // autre `configureVideo` peuvent avoir incrémenté la génération.
            // Touch la layer SEULEMENT si le token correspond toujours.
            guard self.videoLoadGeneration == generation else { return }
            // Swap UNIQUEMENT si le cache a fourni une vraie URL locale
            // différente — sinon le player déjà attaché continue de jouer
            // l'URL distante sans re-trigger un cold start.
            if localURL != remoteURL {
                self.attachPlayer(url: localURL, mode: mode, loop: mode != .play)
            }
        }
    }

    /// Résout l'URL locale vidéo SANS toucher au réseau ni à une Task. Retourne
    /// `nil` si le cache n'a rien — auquel cas le caller doit afficher un
    /// placeholder et lancer un fetch async.
    private nonisolated func synchronouslyResolvedLocalVideoURL(_ remoteURL: URL) -> URL? {
        if remoteURL.isFileURL { return remoteURL }
        return CacheCoordinator.videoLocalFileURL(for: remoteURL.absoluteString)
    }

    /// Le player que le chemin de LECTURE porte déjà pour ce média, ou `nil` —
    /// auquel cas la couche ouvre le sien (composition, prefetch hors écran).
    @MainActor
    func providedCarrierPlayer() -> AVPlayer? {
        guard let identity = media?.postMediaId, !identity.isEmpty,
              let provided = playerProvider?.player(for: identity),
              provided.currentItem != nil else { return nil }
        return provided
    }

    /// Attache (ou réutilise) le `AVPlayer` du layer pour l'URL fournie. Si
    /// un player existe déjà (cas du cache live qui réutilise la layer entre
    /// deux ticks), `replaceCurrentItem(with:)` swap l'asset sans recréer
    /// l'AVPlayer — évite le cold-restart 60 fois par seconde décrit dans
    /// la spec § 2.2 (A.1).
    @MainActor
    private func attachPlayer(url: URL, mode: RenderMode, loop: Bool) {
        // Idempotence à URL constante : un player vivant qui joue déjà CETTE
        // URL est laissé strictement intact — pas de `replaceCurrentItem`
        // (la lecture repartirait de zéro), pas de seek, pas de ré-armement
        // du loop observer. On re-stampe seulement mute/volume, seuls états
        // susceptibles d'avoir changé entre deux configure d'un même média.
        if attachedURL == url, let existing = avPlayerLayer?.player, existing.currentItem != nil {
            existing.isMuted = isMuted
            // `volume` de la couche, jamais `media?.volume` : le modèle porte
            // le niveau de BASE, la couche porte le niveau COURANT (base +
            // automation + ducking).
            existing.volume = volume
            return
        }
        attachedURL = url

        let item = AVPlayerItem(url: url)
        // Buffer modéré : 2 s suffit pour la plupart des vidéos courtes sans
        // gaspiller la RAM. Sur 3G/4G lent, peut être ajusté à 4 s.
        item.preferredForwardBufferDuration = 2.0

        // Nouvel item ⇒ fenêtre de rognage inconnue jusqu'à preuve du
        // contraire : repli "source entière" pendant le chargement (voir
        // doc de `currentTrimBounds`).
        currentTrimBounds = nil
        startLoadingTrimWindow(for: item)

        if let existing = avPlayerLayer?.player {
            existing.replaceCurrentItem(with: item)
        } else {
            let provided = providedCarrierPlayer()
            playsAProvidedPlayer = provided != nil
            let player = provided ?? AVPlayer(playerItem: item)
            let playerLayer = AVPlayerLayer(player: player)
            playerLayer.frame = bounds
            playerLayer.videoGravity = .resizeAspectFill
            addSublayer(playerLayer)
            avPlayer = player
            avPlayerLayer = playerLayer
        }

        guard let player = avPlayerLayer?.player else { return }

        // Stampe l'état mute courant : si l'utilisateur a déjà tapé Mute dans
        // la sidebar AVANT que la layer attache son `AVPlayer` (cas du switch
        // de slide pendant que le mute est actif), le nouveau player doit
        // démarrer silencieux. Sans ça, on entend ~200ms d'audio vidéo entre
        // l'attach et le prochain `forEachMediaLayer { $0.isMuted = ... }`.
        player.isMuted = isMuted

        // Volume explicite : certains paths (live composer, cache LRU)
        // re-attachent un player existant via `replaceCurrentItem`, et sans
        // ré-application on hériterait d'un niveau posé ailleurs.
        //
        // On stampe la propriété `volume` de la COUCHE, pas `media?.volume` :
        // le modèle ne porte que le niveau de base, tandis que la couche porte
        // le niveau courant (base + automation + ducking). Relire le modèle ici
        // annulerait l'automation à chaque ré-attache.
        player.volume = volume

        // Defensive : s'assurer que l'`AVAudioSession` est en `.playback` avant
        // de lancer le player. La session est normalement déjà activée par
        // `StoryMediaCoordinator.activate` (sync, depuis `onAppear`) puis
        // re-confirmée par `MediaSessionCoordinator.request(.playback)` (async,
        // depuis `startAudioPlayback`). Mais l'`AVPlayer` peut être attaché
        // entre les deux — auquel cas il joue sous catégorie `.ambient`, donc
        // silencieux en simulator silent mode et sur device avec le switch
        // physique. Forcer la catégorie ici est idempotent et coûte ~0 ms.
        if (mode == .play || playsInEditMode), AVAudioSession.sharedInstance().category != .playback {
            // Pose la session de lecture via la source UNIQUE (call-aware) : idempotent,
            // no-op pendant un appel (micro de l'appel préservé). Couvre aussi le
            // composer live preview (`.edit` + `playsInEditMode`) → audio des
            // vidéos qui bouclent dans l'éditeur.
            MediaSessionCoordinator.shared.activatePlaybackSync(options: [.mixWithOthers, .duckOthers])
        }

        switch mode {
        case .play:
            // Démarrage GATÉ — symétrique à `StoryBackgroundLayer`. La vidéo
            // foreground ne démarre PAS à l'instant où ses octets arrivent (ce
            // qui la faisait jouer en avance sur la vidéo de fond + le mixer
            // audio) : elle attend le « GO » du canvas (content-ready), propagé
            // via `isPlaybackActive`. Un layer attaché APRÈS le GO voit déjà le
            // drapeau levé et démarre immédiatement à son tour — calé sur le
            // playhead (rattrapage d'une arrivée tardive / ouverture à t>0).
            if isPlaybackActive { alignToTimelineThenPlay() }
        case .edit:
            player.seek(to: .zero)
            // Composer live preview : la vidéo joue (et boucle, cf. `loop`
            // ci-dessous) tant que `playsInEditMode` est levé par le canvas.
            if playsInEditMode { player.play() }
        }

        // Retire l'éventuel observer de fin précédent (changement d'item /
        // reconfigure d'un layer recyclé) avant d'en réarmer un.
        if let token = loopObserver {
            NotificationCenter.default.removeObserver(token)
            loopObserver = nil
        }
        if loop {
            // Composer (`.edit`) : la vidéo reboucle indéfiniment pour la
            // prévisualisation live — comme le fond.
            player.actionAtItemEnd = .none
            // `self` capturé via la boîte faible `@unchecked Sendable` — même
            // raison que l'observer non-loop ci-dessous (nonisolated donc non
            // Sendable). Lue au moment du BOUCLAGE, jamais à l'armement : la
            // fenêtre peut encore être `nil` (durée pas chargée) quand cet
            // observer est posé et résolue quelques secondes plus tard, bien
            // avant que la vidéo n'atteigne sa fin. Boucler sur `.zero`
            // rejouerait la portion COUPÉE en tête de chaque itération.
            let weakSelfForLoop = StoryMediaLayerWeakBox(self)
            loopObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: player.currentItem,
                queue: .main
            ) { [weak player] _ in
                let restart = weakSelfForLoop.value?.currentTrimBounds?.start ?? 0
                player?.seek(to: CMTime(seconds: restart, preferredTimescale: 600))
                player?.play()
            }
        } else {
            // Reader / preview (`.play`) : une vidéo foreground est un composant
            // de timeline. Elle joue UNE seule fois puis s'arrête et DISPARAÎT
            // du canvas (le layer se masque), tout comme les autres composants
            // foreground apparaissent/disparaissent selon leur fenêtre. Seule la
            // vidéo de FOND boucle pour remplir la durée de la slide.
            player.actionAtItemEnd = .pause
            // `self` (StoryMediaLayer) est `nonisolated` donc non-Sendable : on le
            // capture via une boîte faible `@unchecked Sendable` pour satisfaire le
            // contrôle Sendable du bloc `@Sendable` de l'observer. Sûr car le bloc
            // fire toujours sur `queue: .main` — mêmes garanties main-thread que
            // les accès `isHidden`/`CATransaction` qui suivent.
            let weakSelf = StoryMediaLayerWeakBox(self)
            loopObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: player.currentItem,
                queue: .main
            ) { [weak player] _ in
                player?.pause()
                // Masque sans animation implicite (le rebuild 60 Hz réutilise
                // ce même layer via le StoryRendererCache, donc l'état masqué
                // persiste jusqu'au changement de slide).
                CATransaction.begin()
                CATransaction.setDisableActions(true)
                weakSelf.value?.isHidden = true
                CATransaction.commit()
            }
        }

        // Fade out du placeholder une fois la lecture lancée. Best-effort —
        // la vidéo peut encore buffer mais l'utilisateur perçoit la transition.
        fadeOutPlaceholder(duration: 0.2)
    }

    /// Cale le player foreground sur le playhead unifié de la slide puis lance
    /// la lecture. `seek` UNIQUEMENT si la dérive entre la position courante et
    /// la cible (`max(0, slidePlayheadSeconds − startTime)`) dépasse le seuil :
    /// un resume en place (long-press) ou un démarrage déjà aligné ne provoque
    /// aucun saut. Une vidéo arrivée en retard (réseau) ou une ouverture à `t>0`
    /// est en revanche recalée pour rester en phase avec le reste de la slide.
    /// Thin public seam (WS3.3) routing a canvas « GO » through the single
    /// drift-aware start path. A no-op unless `isPlaybackActive` (the slide is
    /// past content-ready), so the canvas can call it on every foreground media
    /// layer without re-checking each layer's state. Replaces the raw
    /// `forEachAVPlayer { $0.play() }` at GO, which bypassed timeline alignment
    /// and could flash frame 0 on an open-at-t>0. Idempotent: `play()` is a
    /// no-op when already playing and the seek only fires past the drift seuil.
    @MainActor
    public func startAlignedIfActive() {
        guard isPlaybackActive else { return }
        alignToTimelineThenPlay()
    }

    /// Scrub de preview timeline : pause puis cale le player sur le playhead
    /// unifié (`max(0, slidePlayheadSeconds − startTime)`, décalé dans la
    /// fenêtre de rognage courante — cf. `trimmedSeekTarget`) avec une
    /// tolérance large — un seek frame-accurate à la cadence du scrub gèle
    /// sur la décompression GOP. Le seek fire à chaque appel (pas de seuil de
    /// dérive) : en pause, la frame affichée DOIT suivre le doigt.
    @MainActor
    public func alignPausedToSlidePlayhead() {
        guard let player = avPlayer else { return }
        player.pause()
        let target = Self.trimmedSeekTarget(
            bounds: currentTrimBounds,
            slidePlayheadSeconds: slidePlayheadSeconds,
            mediaStartTime: media?.startTime ?? 0
        )
        let tolerance = CMTime(seconds: 0.05, preferredTimescale: 600)
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600),
                    toleranceBefore: tolerance, toleranceAfter: tolerance)
    }

    @MainActor
    private func alignToTimelineThenPlay() {
        guard let player = avPlayer else { return }
        let target = Self.trimmedSeekTarget(
            bounds: currentTrimBounds,
            slidePlayheadSeconds: slidePlayheadSeconds,
            mediaStartTime: media?.startTime ?? 0
        )
        let current = player.currentTime().seconds
        if Self.shouldSeekToAlign(current: current, target: target) {
            player.seek(to: CMTime(seconds: target, preferredTimescale: 600),
                        toleranceBefore: .zero, toleranceAfter: .zero)
        }
        player.play()
    }

    /// Pure drift decision (WS3.3 / F4): the aligned start seeks the foreground
    /// player ONLY when the gap between the current position and the timeline
    /// `target` exceeds `timelineSeekDriftThreshold`. A resume-in-place
    /// (long-press) or an already-aligned start stays put (no jump); a video that
    /// arrived late (network) or an open-at-`t>0` is recaled. Non-finite inputs
    /// never seek. Extracted (non-private) so the seek trigger is unit-testable
    /// without a decodable `AVAsset` — `AVPlayer` seek movement on a fixture mp4
    /// is not observable.
    static func shouldSeekToAlign(current: Double, target: Double) -> Bool {
        guard target.isFinite, current.isFinite else { return false }
        return abs(current - target) > timelineSeekDriftThreshold
    }

    /// Position de seek DANS LA SOURCE pour un playhead de slide donné, la
    /// fenêtre de rognage repliée dedans. `bounds == nil` (rognage jamais
    /// déclaré, ou pas encore chargé) rend exactement `max(0, slidePlayheadSeconds
    /// − mediaStartTime)` — le calcul d'aujourd'hui, bit à bit : c'est le repli
    /// "source entière" qui garantit qu'un média non rogné ne change jamais de
    /// comportement. Une fois `bounds` connu, l'origine du média glisse de `0`
    /// à `bounds.start` et la cible ne dépasse jamais `bounds.end` — un resume
    /// tardif ou une dérive réseau ne rejoue donc jamais la portion coupée.
    /// Pure et statique : éprouvable sans `AVAsset` ni simulateur, comme
    /// `shouldSeekToAlign` ci-dessus.
    static func trimmedSeekTarget(bounds: MediaTrimBounds?,
                                  slidePlayheadSeconds: Double,
                                  mediaStartTime: Double) -> Double {
        let elapsedInMedia = max(0, slidePlayheadSeconds - mediaStartTime)
        guard let bounds else { return elapsedInMedia }
        return min(bounds.start + elapsedInMedia, bounds.end)
    }

    /// Charge la durée réelle de la source PUIS résout la fenêtre de rognage —
    /// jamais l'inverse. `MediaTrimRule.resolved` (via `StoryMediaObject.trimBounds`)
    /// a besoin de la durée VRAIE pour rejeter des bornes vieillies (fichier
    /// remplacé, plus court qu'au moment du rognage) ; tant qu'elle n'est pas
    /// connue, `currentTrimBounds` reste `nil` et la couche joue la source
    /// entière — jamais un silence ni une image figée pendant l'attente.
    ///
    /// `asset.load(.duration)` est asynchrone et ne bloque jamais le thread
    /// principal (contrat explicite : un seek initial synchrone qui attendrait
    /// dessus geler l'affichage de CHAQUE vidéo foreground, rognée ou non).
    /// Sans intention de rognage déclarée (`sourceStart`/`sourceEnd` tous deux
    /// `nil`), on ne charge RIEN : c'est le cas de loin le plus fréquent, et le
    /// repli "source entière" est déjà exactement le comportement d'aujourd'hui.
    @MainActor
    private func startLoadingTrimWindow(for item: AVPlayerItem) {
        guard let media, media.sourceStart != nil || media.sourceEnd != nil else { return }
        let generation = videoLoadGeneration
        let asset = item.asset
        Task { @MainActor [weak self] in
            do {
                let cmDuration = try await asset.load(.duration)
                let seconds = CMTimeGetSeconds(cmDuration)
                guard seconds.isFinite, seconds > 0 else { return }
                guard let self,
                      self.videoLoadGeneration == generation,
                      self.avPlayerLayer?.player?.currentItem === item
                else { return }
                self.applyResolvedTrimBounds(media.trimBounds(sourceDuration: seconds), to: item)
            } catch {
                Self.logger.error("StoryMediaLayer trim window: asset.load(.duration) failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Pose la fenêtre résolue sur l'item (`forwardPlaybackEndTime` = borne de
    /// fin — mécanisme non destructif, aucun ré-encodage) puis recale la
    /// lecture en cours si elle a démarré AVANT que la fenêtre ne soit connue
    /// (le repli "source entière" pendant le chargement, cf. `currentTrimBounds`).
    /// `alignToTimelineThenPlay()` ne saute que si la dérive dépasse son seuil —
    /// exactement le comportement qu'on veut ici : une fenêtre dont `start` est
    /// proche de zéro ne provoque aucun à-coup visible.
    @MainActor
    private func applyResolvedTrimBounds(_ bounds: MediaTrimBounds, to item: AVPlayerItem) {
        currentTrimBounds = bounds
        item.forwardPlaybackEndTime = CMTime(seconds: bounds.end, preferredTimescale: 600)
        guard avPlayerLayer?.player?.currentItem === item, isPlaybackActive else { return }
        alignToTimelineThenPlay()
    }

    /// Reprise/pause transitoire sur lifecycle d'app (foreground/background),
    /// EXACT pendant du `StoryBackgroundLayer.handleAppLifecycle`. Ne touche
    /// PAS au drapeau d'intention `isPlaybackActive` : un retour foreground ne
    /// relance la vidéo QUE si le canvas l'avait autorisée (slide à l'écran,
    /// non pausée). Sans ce gate, une vidéo foreground d'une slide non visible
    /// (canvas retenu / préempté) rejouait à la réouverture de l'app.
    @MainActor
    public func handleAppLifecycle(active: Bool) {
        guard let player = avPlayer else { return }
        if active {
            guard isPlaybackActive else { return }
            player.play()
        } else {
            player.pause()
        }
    }

    // MARK: - ThumbHash placeholder

    @MainActor
    private func applyThumbHashPlaceholder(_ hash: String?) {
        placeholderLayer?.removeFromSuperlayer()
        placeholderLayer = nil
        guard let hash, let img = ThumbHashDecoder.decodeIfAvailable(hash) else { return }
        let placeholder = CALayer()
        placeholder.frame = bounds
        placeholder.contents = CanvasImageOrientation.displayCGImage(img)
        placeholder.contentsGravity = .resizeAspectFill
        placeholder.masksToBounds = true
        // Insert sous l'AVPlayerLayer (placeholderLayer = z minimum). Si
        // l'AVPlayerLayer existe déjà, on insert juste en-dessous.
        if let pl = avPlayerLayer {
            insertSublayer(placeholder, below: pl)
        } else {
            addSublayer(placeholder)
        }
        placeholderLayer = placeholder
    }

    @MainActor
    private func fadeOutPlaceholder(duration: TimeInterval) {
        guard let layer = placeholderLayer else { return }
        CATransaction.begin()
        CATransaction.setAnimationDuration(duration)
        CATransaction.setCompletionBlock { [weak self] in
            self?.placeholderLayer?.removeFromSuperlayer()
            self?.placeholderLayer = nil
        }
        layer.opacity = 0
        CATransaction.commit()
    }

    // MARK: - Teardown

    /// Libère les ressources AVFoundation du layer (player + item + observer)
    /// sans démonter le layer lui-même. Appelé par `StoryRendererCache.prune`
    /// quand le layer est évincé du cache mais aussi sécuritaire à appeler
    /// avant de relâcher la dernière référence forte.
    @MainActor
    public func tearDownPlayback() {
        // Incrémente le token avant cancel : si une Task post-await arrive
        // entre le cancel et le check `videoLoadGeneration == generation`,
        // elle voit un token différent et s'auto-écarte. Verrou solide vs
        // race entre `await videoLocalFileURLAwait` et tearDown.
        videoLoadGeneration &+= 1
        currentVideoLoadTask?.cancel()
        currentVideoLoadTask = nil
        currentLoadTask?.cancel()
        currentLoadTask = nil
        if let token = loopObserver {
            NotificationCenter.default.removeObserver(token)
            loopObserver = nil
        }
        if let player = avPlayerLayer?.player {
            player.pause()
            if !playsAProvidedPlayer {
                player.replaceCurrentItem(with: nil)
            }
        }
        playsAProvidedPlayer = false
        avPlayerLayer?.player = nil
        avPlayer = nil
        attachedURL = nil
        currentTrimBounds = nil
        placeholderLayer?.removeFromSuperlayer()
        placeholderLayer = nil
    }
}
