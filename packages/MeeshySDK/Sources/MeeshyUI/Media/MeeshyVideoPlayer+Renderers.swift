import SwiftUI
import AVFoundation
import MeeshySDK

// MARK: - Flat Renderer

/// Renders a `.flat` style player : no chrome, autoplay + loop + muted.
/// Used for SwiftUI previews of story foreground/background hors canvas.
/// In the canvas itself, `MeeshyVideoCanvasLayer` is used directly.
internal struct _FlatRenderer: View {
    let player: MeeshyVideoPlayer

    @State private var avPlayer: AVQueuePlayer?
    @State private var looper: AVPlayerLooper?
    @State private var aspectRatio: CGFloat?

    var body: some View {
        ZStack {
            Color.black
            if let p = avPlayer {
                MeeshyVideoSurface(player: p, gravity: .resizeAspectFill, isMuted: true)
            }
        }
        .aspectRatio(player.frame.maxAspectRatio == nil ? aspectRatio : nil, contentMode: .fit)
        .applyVideoFrame(player.frame)
        .onAppear { setup() }
        .onDisappear { teardown() }
    }

    private func setup() {
        guard avPlayer == nil,
              let url = MeeshyConfig.resolveMediaURL(player.attachment.fileUrl) else { return }
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = player.performance.preferredForwardBufferDuration
        let queue = AVQueuePlayer(playerItem: item)
        queue.isMuted = true
        queue.automaticallyWaitsToMinimizeStalling = player.performance.waitsToMinimizeStalling
        looper = AVPlayerLooper(player: queue, templateItem: item)
        avPlayer = queue
        aspectRatio = player.attachment.videoAspectRatio
        queue.playImmediately(atRate: 1.0)
    }

    private func teardown() {
        looper?.disableLooping()
        looper = nil
        avPlayer?.pause()
        avPlayer = nil
    }
}

// MARK: - Inline Renderer (Task 8 — stub here)

internal struct _InlineRenderer: View {
    let player: MeeshyVideoPlayer
    var body: some View {
        Color.gray // Implemented in Task 8
    }
}

// MARK: - Mini Renderer (Task 9 — stub here)

internal struct _MiniRenderer: View {
    let player: MeeshyVideoPlayer
    var body: some View {
        Color.gray // Implemented in Task 9
    }
}

// MARK: - Fullscreen Renderer (Task 10 — stub here)

internal struct _FullscreenRenderer: View {
    let player: MeeshyVideoPlayer
    var body: some View {
        Color.gray // Implemented in Task 10
    }
}

// MARK: - Frame Modifier Helper

internal extension View {
    /// Applies the `Frame` parameters : max height, corner radius, border.
    /// Aspect ratio is applied separately by each renderer because the
    /// effective ratio depends on the cap.
    @ViewBuilder
    func applyVideoFrame(_ frame: MeeshyVideoPlayer.Frame) -> some View {
        self.modifier(_VideoFrameModifier(frame: frame))
    }
}

internal struct _VideoFrameModifier: ViewModifier {
    let frame: MeeshyVideoPlayer.Frame

    func body(content: Content) -> some View {
        content
            .frame(maxHeight: frame.maxHeight)
            .clipShape(RoundedRectangle(cornerRadius: frame.cornerRadius))
            .overlay(
                Group {
                    if let border = frame.border {
                        RoundedRectangle(cornerRadius: frame.cornerRadius)
                            .stroke(border.color, lineWidth: border.width)
                    }
                }
            )
    }
}
