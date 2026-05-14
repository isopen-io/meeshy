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
        case video(postMediaId: String, looping: Bool, mute: Bool)
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
            backgroundColor = UIColor.black.cgColor
            let img = CALayer()
            img.frame = bounds
            img.contentsGravity = .resizeAspectFill
            img.masksToBounds = true
            addSublayer(img)
            contentLayer = img

            // Synchronous thumbHash placeholder (if any)
            if let hash = thumbHash,
               let placeholderImage = ThumbHashDecoder.decodeIfAvailable(hash) {
                img.contents = placeholderImage.cgImage
            }

            // Composer édition : si `postMediaId` est en réalité une URL
            // (file:// vers le temp .jpg posé par le composer après PhotosPicker,
            // ou bien une URL distante), on la charge directement sans passer
            // par le couple resolver/imageCache (qui est nil en édition). Sans
            // ce shortcut le slide affichait un rectangle noir car la pipe
            // attend un `postMediaId` distant et un cache fourni par le reader.
            if let directURL = Self.directURLIfAny(from: postMediaId) {
                Task { @MainActor [weak img] in
                    if directURL.isFileURL {
                        if let data = try? Data(contentsOf: directURL),
                           let uiImage = UIImage(data: data) {
                            img?.contents = uiImage.cgImage
                        }
                    } else if let (data, _) = try? await URLSession.shared.data(from: directURL),
                              let uiImage = UIImage(data: data) {
                        img?.contents = uiImage.cgImage
                    }
                }
                break
            }

            // Async swap to cached / network image
            if let cache = imageCache, let resolver = resolver {
                Task { @MainActor [weak img] in
                    if let cached = await cache.cachedImage(for: postMediaId) {
                        img?.contents = cached.cgImage
                        return
                    }
                    if let url = resolver(postMediaId),
                       let (data, _) = try? await URLSession.shared.data(from: url),
                       let uiImage = UIImage(data: data) {
                        img?.contents = uiImage.cgImage
                    }
                }
            }
        case .video(let postMediaId, let looping, let mute):
            backgroundColor = UIColor.black.cgColor
            // Édition composer : même fallback URL directe qu'en image.
            let resolvedURL: URL? = {
                if let direct = Self.directURLIfAny(from: postMediaId) { return direct }
                return resolver?(postMediaId)
            }()
            guard let url = resolvedURL else { break }
            let item = AVPlayerItem(url: url)
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

        self.transform = transform.caTransform()
    }
}

// MARK: - App Lifecycle

extension StoryBackgroundLayer {
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
