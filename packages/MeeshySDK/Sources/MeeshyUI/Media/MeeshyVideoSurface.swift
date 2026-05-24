import SwiftUI
import AVFoundation
import UIKit

/// UIViewRepresentable atom hosting an `AVPlayerLayer` directly as the
/// view's layer class. Used as the rendering core of `MeeshyVideoPlayer`.
///
/// Why `layerClass` override : the host UIView's primary layer IS the
/// AVPlayerLayer. No sublayer, no double layout sync, no bounds mismatch.
///
/// `updateUIView` compares by reference — it NEVER recreates the layer
/// across SwiftUI body re-evaluations.
internal struct MeeshyVideoSurface: UIViewRepresentable {
    let player: AVPlayer
    let gravity: AVLayerVideoGravity
    let isMuted: Bool

    func makeUIView(context: Context) -> _SurfaceUIView {
        let view = _SurfaceUIView()
        view.isOpaque = true
        view.playerLayer.videoGravity = gravity
        view.playerLayer.player = player
        player.isMuted = isMuted
        return view
    }

    func updateUIView(_ uiView: _SurfaceUIView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
        if uiView.playerLayer.videoGravity != gravity {
            uiView.playerLayer.videoGravity = gravity
        }
        if player.isMuted != isMuted {
            player.isMuted = isMuted
        }
    }

    /// Force la UIView à accepter le frame proposé par SwiftUI au lieu de
    /// retomber sur la `naturalSize` de l'`AVPlayerLayer`. Sans cet override,
    /// un `.aspectRatio(ratio, .fit)` au-dessus du surface est ignoré dès
    /// qu'un `AVPlayer` est attaché : SwiftUI lit l'intrinsic landscape
    /// `1280×720` de l'asset et écrase la contrainte de ratio portrait,
    /// ce qui aplatissait la bulle vidéo 9:16 en 16:9 au moment du tap-play.
    ///
    /// Si une dimension du proposal est `nil` ou `.infinity`, on renvoie
    /// `nil` pour laisser SwiftUI utiliser l'`intrinsicContentSize`
    /// (`noIntrinsicMetric`) — la UIView accepte alors la frame du parent
    /// sans réintroduire la naturalSize de l'AVPlayerLayer.
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: _SurfaceUIView, context: Context) -> CGSize? {
        guard let w = proposal.width, let h = proposal.height,
              w.isFinite, h.isFinite, w > 0, h > 0 else {
            return nil
        }
        return CGSize(width: w, height: h)
    }

    final class _SurfaceUIView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer {
            guard let layer = layer as? AVPlayerLayer else {
                preconditionFailure("MeeshyVideoSurface layer must be AVPlayerLayer")
            }
            return layer
        }

        /// Pas d'intrinsic content size — la frame doit venir exclusivement
        /// du parent SwiftUI (driven par `.aspectRatio` ou `.frame`).
        override var intrinsicContentSize: CGSize {
            CGSize(width: UIView.noIntrinsicMetric, height: UIView.noIntrinsicMetric)
        }
    }
}
