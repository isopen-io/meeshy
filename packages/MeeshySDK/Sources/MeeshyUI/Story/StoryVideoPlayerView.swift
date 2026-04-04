import SwiftUI
import AVFoundation
import AVKit

// MARK: - Story Video Player View

/// High-performance video player using AVPlayerLayer directly (not SwiftUI VideoPlayer).
/// Features:
/// - Poster frame displayed instantly while player buffers
/// - AVPlayerLooper for seamless looping
/// - Preroll for instant playback on play()
/// - Seamless poster -> video transition (opacity fade)
/// - Uses cached prerolled player from StoryMediaLoader when available
struct StoryVideoPlayerView: View {
    let url: URL
    var posterImage: UIImage?
    var preroll: Bool = true
    var loop: Bool = true
    var autoplay: Bool = false
    var muted: Bool = false

    @State private var isPlayerReady = false
    @State private var player: AVQueuePlayer?
    @State private var looper: AVPlayerLooper?
    @State private var observeTask: Task<Void, Never>?

    var body: some View {
        ZStack {
            // Video layer (underneath)
            if let player {
                _AVPlayerLayerView(player: player)
                    .opacity(isPlayerReady ? 1 : 0)
            }

            // Poster frame (on top, fades out when player ready)
            if let posterImage, !isPlayerReady {
                Image(uiImage: posterImage)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity)
            }
        }
        .clipped()
        .onAppear { setupPlayer() }
        .onDisappear { teardownPlayer() }
        .onChange(of: muted) { _, newValue in
            player?.isMuted = newValue
        }
    }

    // MARK: - Player Lifecycle

    private func setupPlayer() {
        // Try to use a prerolled player from cache (zero-latency path)
        if let cached = StoryMediaLoader.shared.cachedPlayer(for: url) {
            let queuePlayer: AVQueuePlayer
            if let queue = cached as? AVQueuePlayer {
                queuePlayer = queue
            } else {
                // Cached player is a plain AVPlayer — wrap in queue for looping
                let item = AVPlayerItem(url: url)
                item.preferredForwardBufferDuration = 2.0
                queuePlayer = AVQueuePlayer(playerItem: item)
            }
            queuePlayer.isMuted = muted
            self.player = queuePlayer

            if loop, let currentItem = queuePlayer.currentItem {
                self.looper = AVPlayerLooper(player: queuePlayer, templateItem: currentItem)
            }

            // Already prerolled — ready immediately
            withAnimation(.easeIn(duration: 0.15)) {
                isPlayerReady = true
            }
            if autoplay { queuePlayer.play() }
            return
        }

        // Fallback: create new player
        let asset = AVURLAsset(url: url)
        let item = AVPlayerItem(asset: asset)
        item.preferredForwardBufferDuration = 2.0

        let queuePlayer = AVQueuePlayer(playerItem: item)
        queuePlayer.isMuted = muted
        self.player = queuePlayer

        if loop {
            self.looper = AVPlayerLooper(player: queuePlayer, templateItem: item)
        }

        // Observe readiness via Task (stored for cancellation)
        observeTask = Task { @MainActor in
            // KVO observation on status
            for await status in item.publisher(for: \.status).values {
                if status == .readyToPlay, !isPlayerReady {
                    withAnimation(.easeIn(duration: 0.15)) {
                        isPlayerReady = true
                    }
                    if autoplay { queuePlayer.play() }
                    break
                }
            }
        }

        if preroll, item.status == .readyToPlay {
            // Only preroll if already ready — otherwise the KVO observer handles it
            queuePlayer.preroll(atRate: 1.0) { finished in
                guard finished else { return }
                Task { @MainActor in
                    if !isPlayerReady {
                        withAnimation(.easeIn(duration: 0.15)) {
                            isPlayerReady = true
                        }
                        if autoplay { queuePlayer.play() }
                    }
                }
            }
        }
    }

    private func teardownPlayer() {
        observeTask?.cancel()
        observeTask = nil
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        looper = nil
        player = nil
        isPlayerReady = false
    }
}

// MARK: - AVPlayerLayer UIView Wrapper

/// Minimal UIViewRepresentable for AVPlayerLayer — gives direct GPU-composited video rendering.
private struct _AVPlayerLayerView: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> _PlayerUIView {
        let view = _PlayerUIView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: _PlayerUIView, context: Context) {
        uiView.playerLayer.player = player
    }
}

private class _PlayerUIView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

// MARK: - Play/Pause Control Extension

extension StoryVideoPlayerView {

    /// Returns a version with external player control.
    func playing(_ isPlaying: Bool) -> some View {
        self.onChange(of: isPlaying) { _, shouldPlay in
            if shouldPlay {
                player?.play()
            } else {
                player?.pause()
            }
        }
    }
}
