import Foundation
import QuartzCore
import AVFoundation
import UIKit
import MeeshySDK

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

    private nonisolated(unsafe) var loopObserver: NSObjectProtocol?

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

    @MainActor
    public func configure(with media: StoryMediaObject,
                          geometry: CanvasGeometry,
                          mode: RenderMode) {
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

        switch media.kind {
        case .image:
            configureImage(media)
        case .video:
            configureVideo(media, mode: mode)
        case .none:
            break
        }
    }

    // MARK: - Sizing

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

    // MARK: - Image path

    @MainActor
    private func configureImage(_ media: StoryMediaObject) {
        // Phase 2 placeholder loader — Phase 3 wires CacheCoordinator + MTKTextureLoader fast path.
        guard let urlString = media.mediaURL,
              let url = URL(string: urlString) else { return }
        if let data = try? Data(contentsOf: url),
           let image = UIImage(data: data)?.cgImage {
            contents = image
            contentsGravity = .resizeAspectFill
            masksToBounds = true
        }
    }

    // MARK: - Video path

    @MainActor
    private func configureVideo(_ media: StoryMediaObject, mode: RenderMode) {
        guard let urlString = media.mediaURL,
              let url = URL(string: urlString) else { return }
        let player = AVPlayer(url: url)
        let playerLayer = AVPlayerLayer(player: player)
        playerLayer.frame = bounds
        playerLayer.videoGravity = .resizeAspectFill
        addSublayer(playerLayer)
        avPlayer = player
        avPlayerLayer = playerLayer

        switch mode {
        case .play:
            player.play()
        case .edit:
            player.seek(to: .zero)
        }

        if media.loop {
            player.actionAtItemEnd = .none
            loopObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: player.currentItem,
                queue: .main
            ) { [weak player] _ in
                player?.seek(to: .zero)
                player?.play()
            }
        }
    }
}
