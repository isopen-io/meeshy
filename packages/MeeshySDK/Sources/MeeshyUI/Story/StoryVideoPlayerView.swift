import SwiftUI
import Combine
import AVFoundation
import AVKit

// MARK: - Video Player Coordinator

/// Manages AVPlayer lifecycle outside of SwiftUI's value-type View.
/// Stored as @StateObject to survive view re-evaluations.
@MainActor
final class VideoPlayerCoordinator: ObservableObject {
    @Published var isPlayerReady = false

    private(set) var player: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private var observeTask: Task<Void, Never>?
    private var readyObserver: NSKeyValueObservation?

    var url: URL?
    var posterImage: UIImage?
    var preroll: Bool = true
    var loop: Bool = true
    var autoplay: Bool = false
    var muted: Bool = false

    func setup(url: URL, posterImage: UIImage?, preroll: Bool, loop: Bool, autoplay: Bool, muted: Bool) {
        guard self.url != url else {
            // Same URL — just update mutable flags
            self.muted = muted
            player?.isMuted = muted
            return
        }
        teardown()

        self.url = url
        self.posterImage = posterImage
        self.preroll = preroll
        self.loop = loop
        self.autoplay = autoplay
        self.muted = muted

        // Check for prerolled cached player first (zero-latency path)
        if let cached = StoryMediaLoader.shared.cachedPlayer(for: url),
           let queuePlayer = cached as? AVQueuePlayer {
            configurePlayer(queuePlayer)
            // Already prerolled — ready immediately
            withAnimation(.easeIn(duration: 0.15)) { isPlayerReady = true }
            if autoplay { queuePlayer.play() }
            return
        }

        // Create fresh player
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = 2.0
        let queuePlayer = AVQueuePlayer(playerItem: item)
        configurePlayer(queuePlayer)

        // Observe readiness via KVO (stored to avoid premature dealloc)
        readyObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard item.status == .readyToPlay || item.status == .failed else { return }
            DispatchQueue.main.async { [weak self] in
                self?.readyObserver?.invalidate()
                self?.readyObserver = nil
                guard item.status == .readyToPlay else { return }
                withAnimation(.easeIn(duration: 0.15)) { self?.isPlayerReady = true }
                if self?.autoplay == true { self?.player?.play() }
            }
        }

        if preroll {
            queuePlayer.preroll(atRate: 1.0) { [weak self] finished in
                guard finished else { return }
                Task { @MainActor [weak self] in
                    guard let self, !self.isPlayerReady else { return }
                    withAnimation(.easeIn(duration: 0.15)) { self.isPlayerReady = true }
                    if self.autoplay { self.player?.play() }
                }
            }
        }
    }

    private func configurePlayer(_ queuePlayer: AVQueuePlayer) {
        queuePlayer.isMuted = muted
        self.player = queuePlayer

        if loop, let item = queuePlayer.currentItem {
            looper = AVPlayerLooper(player: queuePlayer, templateItem: item)
        }
    }

    func teardown() {
        readyObserver?.invalidate()
        readyObserver = nil
        observeTask?.cancel()
        observeTask = nil
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        looper?.disableLooping()
        looper = nil
        player = nil
        isPlayerReady = false
        url = nil
    }

    deinit {
        player?.pause()
        looper?.disableLooping()
    }
}

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

    @StateObject private var coordinator = VideoPlayerCoordinator()

    var body: some View {
        ZStack {
            // Video layer (underneath)
            if let player = coordinator.player {
                _AVPlayerLayerView(player: player)
                    .opacity(coordinator.isPlayerReady ? 1 : 0)
            }

            // Poster frame (on top, fades out when player ready)
            if let posterImage, !coordinator.isPlayerReady {
                Image(uiImage: posterImage)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity)
            }
        }
        .clipped()
        .onAppear {
            coordinator.setup(url: url, posterImage: posterImage, preroll: preroll, loop: loop, autoplay: autoplay, muted: muted)
        }
        .onDisappear {
            coordinator.teardown()
        }
        .onChange(of: muted) { _, newValue in
            coordinator.muted = newValue
            coordinator.player?.isMuted = newValue
        }
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
    func playing(_ isPlaying: Bool) -> some View {
        self.onChange(of: isPlaying) { _, shouldPlay in
            if shouldPlay {
                coordinator.player?.play()
            } else {
                coordinator.player?.pause()
            }
        }
    }
}
