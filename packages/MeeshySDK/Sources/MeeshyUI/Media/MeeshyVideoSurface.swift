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

    final class _SurfaceUIView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer {
            guard let layer = layer as? AVPlayerLayer else {
                preconditionFailure("MeeshyVideoSurface layer must be AVPlayerLayer")
            }
            return layer
        }
    }
}
