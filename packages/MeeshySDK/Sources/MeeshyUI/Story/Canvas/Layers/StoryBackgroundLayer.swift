import UIKit
import AVFoundation
import MeeshySDK

/// Affine transform applied to the background layer (zoom + pan + rotation).
/// Mirrors `StoryBackgroundTransform` from the SDK schema, in render-space.
///
/// All members are `nonisolated` so the struct can be used freely from both
/// the MeeshyUI (defaultIsolation MainActor) and nonisolated contexts.
public struct BackgroundTransform: Sendable, Equatable {
    public nonisolated var scale: Double
    public nonisolated var offsetX: Double
    public nonisolated var offsetY: Double
    public nonisolated var rotation: Double  // degrees

    public nonisolated init(scale: Double = 1.0, offsetX: Double = 0,
                            offsetY: Double = 0, rotation: Double = 0) {
        self.scale = scale
        self.offsetX = offsetX
        self.offsetY = offsetY
        self.rotation = rotation
    }

    public nonisolated static let identity = BackgroundTransform()

    public nonisolated func caTransform() -> CATransform3D {
        let r = CGFloat(rotation * .pi / 180)
        var t = CATransform3DIdentity
        t = CATransform3DTranslate(t, CGFloat(offsetX), CGFloat(offsetY), 0)
        t = CATransform3DRotate(t, r, 0, 0, 1)
        t = CATransform3DScale(t, CGFloat(scale), CGFloat(scale), 1)
        return t
    }
}

/// Visual background of the story canvas (color/gradient/image+thumbHash/video).
/// Lives below `itemsContainer` in `StoryCanvasUIView.rootLayer`.
/// Lifecycle aware: pause/resume video on app background/foreground.
///
/// Uses `nonisolated` inits to interop with `CALayer`'s nonisolated initializers
/// (MeeshyUI module applies `defaultIsolation(MainActor)`).
public final class StoryBackgroundLayer: CALayer, @unchecked Sendable {
    public enum Kind: Sendable {
        case solidColor(UIColor)
        case gradient(colors: [UIColor], direction: GradientDirection)
        case image(postMediaId: String, thumbHash: String?)
        case video(postMediaId: String, looping: Bool, mute: Bool, thumbHash: String?)
    }

    public enum GradientDirection: Sendable, Equatable {
        case topToBottom, leftToRight, topLeftToBottomRight
    }

    public private(set) nonisolated(unsafe) var kind: Kind = .solidColor(.black)
    public private(set) nonisolated(unsafe) var transform3D: BackgroundTransform = BackgroundTransform()

    nonisolated(unsafe) var contentLayer: CALayer?
    nonisolated(unsafe) var avPlayer: AVPlayer?
    nonisolated(unsafe) var avPlayerLayer: AVPlayerLayer?
    nonisolated(unsafe) var avPlayerLooper: AVPlayerLooper?

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryBackgroundLayer does not support NSCoder")
    }
}

// MARK: - Configure

extension StoryBackgroundLayer {
    @MainActor
    public func configure(kind: Kind,
                          transform: BackgroundTransform,
                          geometry: CanvasGeometry,
                          resolver: ((String) -> URL?)?,
                          imageCache: ImageCacheReader?) {
        self.kind = kind
        self.transform3D = transform
        self.frame = CGRect(origin: .zero, size: geometry.renderSize)

        // Clear existing content
        contentLayer?.removeFromSuperlayer()
        avPlayerLayer?.removeFromSuperlayer()
        avPlayer?.pause()
        avPlayer = nil
        avPlayerLayer = nil
        avPlayerLooper = nil
        contentLayer = nil

        switch kind {
        case .solidColor(let color):
            backgroundColor = color.cgColor
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
        case .image(let postMediaId, let thumbHash):
            let img = CALayer()
            img.frame = bounds
            img.contentsGravity = .resizeAspectFill
            img.masksToBounds = true
            addSublayer(img)
            contentLayer = img

            // Fast-path cache chaud : si on peut résoudre le bitmap MAINTENANT
            // (sync NSCache via `warmedImage`), on stamp `contents` direct sans
            // afficher de ThumbHash placeholder. Évite le flash placeholder→
            // bitmap réel quand on revisite une story.
            let directURLForWarm = Self.directURLIfAny(from: postMediaId)
            let warmURL: URL? = directURLForWarm ?? resolver?(postMediaId)
            var hasVisual = false
            if let warm = warmURL,
               let cached = CacheCoordinator.warmedImage(for: warm.absoluteString)?.cgImage {
                img.contents = cached
                hasVisual = true
            }

            // Synchronous thumbHash placeholder (si pas de hit cache chaud).
            if !hasVisual,
               let hash = thumbHash,
               let placeholderImage = ThumbHashDecoder.decodeIfAvailable(hash) {
                img.contents = placeholderImage.cgImage
                hasVisual = true
            }

            // backgroundColor noir UNIQUEMENT si aucun visuel placeholder n'est
            // disponible — sinon le ThumbHash ou le bitmap chaud couvre déjà
            // la totalité du frame, le noir serait une couche perdue (parfois
            // visible 1-2 frames pendant un re-layout). Quand un placeholder
            // existe on garde transparent ; sinon noir.
            backgroundColor = hasVisual ? UIColor.clear.cgColor : UIColor.black.cgColor

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
                Task { @MainActor [weak img] in
                    // (1) Fast-path cache (preview / disque).
                    if let imageCacheReader,
                       let cached = await imageCacheReader.cachedImage(for: postMediaId) {
                        img?.contents = cached.cgImage
                        return
                    }
                    // (2) URL directe embarquée, sinon (3) resolver distant.
                    guard let url = directURL ?? urlResolver?(postMediaId) else { return }
                    if url.isFileURL {
                        if let data = try? Data(contentsOf: url),
                           let uiImage = UIImage(data: data) {
                            img?.contents = uiImage.cgImage
                        }
                    } else if let data = try? await CacheCoordinator.shared.images.data(for: url.absoluteString),
                              let uiImage = UIImage(data: data) {
                        img?.contents = uiImage.cgImage
                    }
                }
                break
            }
        case .video(let postMediaId, let looping, let mute, let thumbHash):
            // Édition composer : même fallback URL directe qu'en image.
            let resolvedURL: URL? = {
                if let direct = Self.directURLIfAny(from: postMediaId) { return direct }
                return resolver?(postMediaId)
            }()
            guard let remoteURL = resolvedURL else {
                // No URL at all → black floor (rien à afficher).
                backgroundColor = UIColor.black.cgColor
                break
            }

            // Fast-path : URL locale immédiate ou cache disk hit → AVPlayer
            // direct, sans placeholder noir ni ThumbHash (la première frame
            // de la vidéo est rendue très vite).
            if remoteURL.isFileURL {
                backgroundColor = UIColor.clear.cgColor
                attachBackgroundPlayer(url: remoteURL, looping: looping, mute: mute)
                break
            }
            if let local = CacheCoordinator.videoLocalFileURL(for: remoteURL.absoluteString) {
                backgroundColor = UIColor.clear.cgColor
                attachBackgroundPlayer(url: local, looping: looping, mute: mute)
                break
            }

            // Cache miss : placeholder ThumbHash dans un sublayer si dispo,
            // sinon backgroundColor noir (seulement ici, fallback strict).
            var placeholderApplied = false
            if let hash = thumbHash,
               let placeholderImage = ThumbHashDecoder.decodeIfAvailable(hash) {
                let placeholder = CALayer()
                placeholder.frame = bounds
                placeholder.contents = placeholderImage.cgImage
                placeholder.contentsGravity = .resizeAspectFill
                placeholder.masksToBounds = true
                addSublayer(placeholder)
                contentLayer = placeholder
                placeholderApplied = true
            }
            backgroundColor = placeholderApplied ? UIColor.clear.cgColor : UIColor.black.cgColor

            // Précache async puis play. AVPlayerLayer s'ajoute par-dessus
            // le placeholder, qui disparaît visuellement quand la vidéo joue.
            Task { @MainActor [weak self] in
                let url = await CacheCoordinator.videoLocalFileURLAwait(for: remoteURL) ?? remoteURL
                self?.attachBackgroundPlayer(url: url, looping: looping, mute: mute)
            }
        }

        self.transform = transform.caTransform()
    }
}

// MARK: - App Lifecycle

extension StoryBackgroundLayer {

    /// Attache un AVPlayer pour une URL `file://` locale. Factorisé pour les
    /// deux chemins (cache chaud immédiat / cache froid après fetch async).
    /// Garantit que l'URL passée est un fichier local — les URLs HTTPS doivent
    /// être pré-cachées en amont via `videoLocalFileURLAwait`.
    @MainActor
    func attachBackgroundPlayer(url: URL, looping: Bool, mute: Bool) {
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = 2.0
        if looping {
            let queuePlayer = AVQueuePlayer()
            self.avPlayerLooper = AVPlayerLooper(player: queuePlayer, templateItem: item)
            self.avPlayer = queuePlayer
        } else {
            self.avPlayer = AVPlayer(playerItem: item)
        }
        self.avPlayer?.isMuted = mute
        let pl = AVPlayerLayer(player: avPlayer)
        pl.frame = bounds
        pl.videoGravity = .resizeAspectFill
        addSublayer(pl)
        self.avPlayerLayer = pl
        self.avPlayer?.play()
    }

    @MainActor
    public func handleAppLifecycle(active: Bool) {
        guard let player = avPlayer else { return }
        if active { player.play() } else { player.pause() }
    }

    /// Helper de routage du `postMediaId` en édition composer.
    ///
    /// En édition, `StoryRenderer.renderBackground` peut pousser la `mediaURL`
    /// de l'élément (`file://…` pour un media fraîchement issu de PhotosPicker,
    /// ou une URL distante) dans le champ `postMediaId` de la `Kind`, parce que
    /// le `resolver`/`imageCache` ne sont jamais branchés en édition (ils sont
    /// fournis uniquement par le reader). Cette détection limite la confusion
    /// aux strings parsables en URL avec un scheme connu.
    nonisolated static func directURLIfAny(from candidate: String) -> URL? {
        guard !candidate.isEmpty else { return nil }
        guard candidate.hasPrefix("file://")
                || candidate.hasPrefix("http://")
                || candidate.hasPrefix("https://") else { return nil }
        return URL(string: candidate)
    }
}

// MARK: - ThumbHash Placeholder

/// Decoder seam wired to `UIImage.fromThumbHash(_:)` (Wolt spec, MeeshySDK/Utils).
/// Returns a small `UIImage` (≤ 32 px on the long edge) ready to be assigned as
/// `CALayer.contents`. The hash MUST be base64-encoded; the underlying decoder
/// guards against short/invalid inputs and returns `nil` in that case.
///
/// `nonisolated` so it can be called from `configure(...)` (`@MainActor`) and
/// from background `Task` resolution without crossing actor boundaries — the
/// decoder is pure CPU work over a fresh `[UInt8]` and produces an immutable
/// `UIImage` value. No target size is needed: resampling to the canvas size
/// happens implicitly when the layer assigns `contents` and respects
/// `contentsGravity`. Pre-scaling here would waste CPU and degrade quality on
/// retina displays.
enum ThumbHashDecoder {
    nonisolated static func decodeIfAvailable(_ hash: String) -> UIImage? {
        guard !hash.isEmpty else { return nil }
        return UIImage.fromThumbHash(hash)
    }
}
