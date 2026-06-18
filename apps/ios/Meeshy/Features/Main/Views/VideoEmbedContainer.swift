import SwiftUI
import MeeshySDK
import MeeshyUI

/// Orchestre la façade embed vidéo : vignette → (au tap) player WKWebView.
/// Single-active + call-aware via la coordination existante :
///  - `start()` est gardé par `MediaSessionCoordinator.isCallActive` (pas de lecture pendant un appel).
///  - `PlaybackCoordinator.willStartPlaying(external:)` coupe audio / autres externes / vidéo native.
///  - À l'arrivée d'un appel, `CallManager` appelle `PlaybackCoordinator.stopAll()` qui invoque notre `stop()`.
@MainActor
final class VideoEmbedModel: ObservableObject, StoppablePlayer {

    enum Phase: Equatable { case idle, loading, playing, paused }

    @Published private(set) var phase: Phase = .idle
    let controller = YouTubeEmbedController()

    private var registered = false

    func start() {
        guard phase == .idle else { return }
        guard !MediaSessionCoordinator.shared.isCallActive else { return }
        if !registered {
            PlaybackCoordinator.shared.registerExternal(self)
            registered = true
        }
        PlaybackCoordinator.shared.willStartPlaying(external: self)
        MediaSessionCoordinator.shared.activatePlaybackSync(options: [.duckOthers])
        phase = .loading
    }

    func onState(_ state: YouTubeEmbedPlayerView.State) {
        switch state {
        case .ready:
            controller.play()
        case .playing:
            phase = .playing
        case .paused:
            if phase != .idle { phase = .paused }
        case .ended:
            stop()
        }
    }

    /// StoppablePlayer — appelé par le coordinateur quand un autre média démarre ou sur appel.
    func stop() {
        controller.pause()
        if phase != .idle {
            phase = .idle
            MediaSessionCoordinator.shared.deactivatePlaybackSync()
        }
    }

    /// onDisappear (cellules recyclées en messages, scroll-off en feed/détail).
    func teardown() {
        stop()
        if registered {
            PlaybackCoordinator.shared.unregisterExternal(self)
            registered = false
        }
    }
}

struct VideoEmbedContainer: View {
    let video: EmbeddedVideo
    let accent: Color

    @StateObject private var model = VideoEmbedModel()
    @State private var showFullscreen = false
    @State private var fullscreenStart = 0

    init(video: EmbeddedVideo, accent: Color) {
        self.video = video
        self.accent = accent
    }

    var body: some View {
        Group {
            if model.phase == .idle {
                VideoEmbedThumbnail(
                    thumbnailURLString: video.thumbnailURL().absoluteString,
                    providerLabel: "YouTube",
                    accent: accent
                ) { model.start() }
            } else {
                ZStack(alignment: .topTrailing) {
                    YouTubeEmbedPlayerView(
                        videoId: video.videoId,
                        startSeconds: video.startSeconds ?? 0,
                        controller: model.controller,
                        onStateChange: { state in model.onState(state) }
                    )
                    .aspectRatio(16.0 / 9.0, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                    Button {
                        model.controller.currentTime { seconds in
                            fullscreenStart = seconds
                            model.controller.pause()
                            showFullscreen = true
                        }
                    } label: {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                            .padding(8)
                            .background(.black.opacity(0.5), in: Circle())
                    }
                    .padding(8)
                    .accessibilityLabel("Plein écran")
                }
            }
        }
        .onDisappear { model.teardown() }
        .fullScreenCover(isPresented: $showFullscreen) {
            YouTubeFullscreenView(video: video, startSeconds: fullscreenStart) {
                showFullscreen = false
            }
        }
    }
}

private struct YouTubeFullscreenView: View {
    let video: EmbeddedVideo
    let startSeconds: Int
    let onClose: () -> Void

    @StateObject private var model = VideoEmbedModel()

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()
            YouTubeEmbedPlayerView(
                videoId: video.videoId,
                startSeconds: startSeconds,
                controller: model.controller,
                onStateChange: { state in model.onState(state) }
            )
            .aspectRatio(16.0 / 9.0, contentMode: .fit)

            Button(action: { model.teardown(); onClose() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .padding(12)
                    .background(.black.opacity(0.5), in: Circle())
            }
            .padding(16)
            .accessibilityLabel("Fermer")
        }
        .onAppear { model.start() }
        .onDisappear { model.teardown() }
    }
}
