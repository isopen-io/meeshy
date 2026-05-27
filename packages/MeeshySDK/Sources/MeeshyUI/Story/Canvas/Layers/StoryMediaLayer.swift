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
           let cached = synchronousReader.images[cacheKey]?.cgImage {
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
               let cgImage = UIImage(data: data)?.cgImage {
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
            // (1) Fast-path image cache (composer preview / disk-backed reader).
            if let imageCache,
               let cached = await imageCache.cachedImage(for: cacheKey)?.cgImage {
                guard !Task.isCancelled else { return }
                self.contents = cached
                return
            }
            // (2) Network URL through the disk-cache-backed loader.
            guard let url = resolvedURL else { return }
            let loaded = await loader.image(for: url.absoluteString)
            guard !Task.isCancelled,
                  let cgImage = loaded?.cgImage else { return }
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
            attachPlayer(url: immediateLocalURL, mode: mode, loop: media.loop)
            return
        }

        // Cache miss → ThumbHash placeholder pendant le fetch async.
        applyThumbHashPlaceholder(media.thumbHash)

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
        attachPlayer(url: remoteURL, mode: mode, loop: media.loop)

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
                self.attachPlayer(url: localURL, mode: mode, loop: media.loop)
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

    /// Attache (ou réutilise) le `AVPlayer` du layer pour l'URL fournie. Si
    /// un player existe déjà (cas du cache live qui réutilise la layer entre
    /// deux ticks), `replaceCurrentItem(with:)` swap l'asset sans recréer
    /// l'AVPlayer — évite le cold-restart 60 fois par seconde décrit dans
    /// la spec § 2.2 (A.1).
    @MainActor
    private func attachPlayer(url: URL, mode: RenderMode, loop: Bool) {
        let item = AVPlayerItem(url: url)
        // Buffer modéré : 2 s suffit pour la plupart des vidéos courtes sans
        // gaspiller la RAM. Sur 3G/4G lent, peut être ajusté à 4 s.
        item.preferredForwardBufferDuration = 2.0

        if let existing = avPlayerLayer?.player {
            existing.replaceCurrentItem(with: item)
        } else {
            let player = AVPlayer(playerItem: item)
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

        // Volume explicite : l'AVPlayer démarre par défaut à 1.0 mais on le
        // force ici en defensive — certains paths (live composer, cache LRU)
        // re-attachent un player existant via `replaceCurrentItem`, et si le
        // volume avait été baissé à 0 ailleurs, on hérite du silence sans le
        // savoir. Le modèle `StoryMediaObject` porte un champ `volume` à
        // 1.0 par défaut ; on le respecte mais on le ré-applique à chaque
        // attach pour garantir le state determinist.
        if let mediaVolume = media?.volume {
            player.volume = mediaVolume
        } else {
            player.volume = 1.0
        }

        // Defensive : s'assurer que l'`AVAudioSession` est en `.playback` avant
        // de lancer le player. La session est normalement déjà activée par
        // `StoryMediaCoordinator.activate` (sync, depuis `onAppear`) puis
        // re-confirmée par `MediaSessionCoordinator.request(.playback)` (async,
        // depuis `startAudioPlayback`). Mais l'`AVPlayer` peut être attaché
        // entre les deux — auquel cas il joue sous catégorie `.ambient`, donc
        // silencieux en simulator silent mode et sur device avec le switch
        // physique. Forcer la catégorie ici est idempotent et coûte ~0 ms.
        if mode == .play {
            let session = AVAudioSession.sharedInstance()
            if session.category != .playback {
                try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers, .duckOthers])
                try? session.setActive(true)
            }
        }

        switch mode {
        case .play:
            player.play()
        case .edit:
            player.seek(to: .zero)
        }

        if loop {
            player.actionAtItemEnd = .none
            // Retire l'éventuel observer précédent (changement d'item).
            if let token = loopObserver {
                NotificationCenter.default.removeObserver(token)
            }
            loopObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: player.currentItem,
                queue: .main
            ) { [weak player] _ in
                player?.seek(to: .zero)
                player?.play()
            }
        }

        // Fade out du placeholder une fois la lecture lancée. Best-effort —
        // la vidéo peut encore buffer mais l'utilisateur perçoit la transition.
        fadeOutPlaceholder(duration: 0.2)
    }

    // MARK: - ThumbHash placeholder

    @MainActor
    private func applyThumbHashPlaceholder(_ hash: String?) {
        placeholderLayer?.removeFromSuperlayer()
        placeholderLayer = nil
        guard let hash, let img = ThumbHashDecoder.decodeIfAvailable(hash) else { return }
        let placeholder = CALayer()
        placeholder.frame = bounds
        placeholder.contents = img.cgImage
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
            player.replaceCurrentItem(with: nil)
        }
        avPlayerLayer?.player = nil
        avPlayer = nil
        placeholderLayer?.removeFromSuperlayer()
        placeholderLayer = nil
    }
}
