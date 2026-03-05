import SwiftUI
import AVFoundation
import MeeshySDK

public struct StoryAudioPlayerView: View {
    @Binding public var audioObject: StoryAudioPlayerObject
    public let url: URL?
    public let isEditing: Bool
    public let onDragEnd: () -> Void

    @State private var isPlaying = false
    @State private var isMuted = false
    @State private var playbackProgress: Double = 0
    @GestureState private var dragOffset = CGSize.zero

    #if os(iOS)
    @State private var player: AVPlayer?
    @State private var playerObserver: Any?
    @State private var endObserver: NSObjectProtocol?
    #endif

    public init(audioObject: Binding<StoryAudioPlayerObject>,
                url: URL? = nil,
                isEditing: Bool = false,
                onDragEnd: @escaping () -> Void = {}) {
        self._audioObject = audioObject
        self.url = url
        self.isEditing = isEditing
        self.onDragEnd = onDragEnd
    }

    public var body: some View {
        GeometryReader { geo in
            playerContent
                .position(
                    x: audioObject.x * geo.size.width + dragOffset.width,
                    y: audioObject.y * geo.size.height + dragOffset.height
                )
                .gesture(isEditing ? dragGesture(geo: geo) : nil)
                .onAppear {
                    if !isEditing { startAutoPlay() }
                }
                .onDisappear { teardownPlayer() }
                .onReceive(NotificationCenter.default.publisher(for: .storyComposerMuteCanvas)) { _ in
                    player?.pause()
                    if isPlaying { isPlaying = false }
                }
                .onReceive(NotificationCenter.default.publisher(for: .storyComposerUnmuteCanvas)) { _ in
                    // Ne pas reprendre automatiquement — l'utilisateur relancera manuellement
                }
                .onReceive(NotificationCenter.default.publisher(for: .timelineDidStartPlaying)) { _ in
                    guard let url else { return }
                    if player == nil {
                        let newPlayer = AVPlayer(url: url)
                        newPlayer.volume = audioObject.volume
                        player = newPlayer
                    }
                    player?.seek(to: .zero)
                    player?.play()
                    isPlaying = true
                }
                .onReceive(NotificationCenter.default.publisher(for: .timelineDidStopPlaying)) { _ in
                    player?.pause()
                    isPlaying = false
                }
        }
    }

    // MARK: - Auto-play (viewer mode)

    private func startAutoPlay() {
        #if os(iOS)
        guard let url else { return }

        if player == nil {
            let newPlayer = AVPlayer(url: url)
            newPlayer.volume = audioObject.volume
            newPlayer.isMuted = isMuted
            player = newPlayer

            let interval = CMTime(seconds: 0.05, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
            playerObserver = newPlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { time in
                guard let duration = newPlayer.currentItem?.duration.seconds,
                      duration > 0 else { return }
                playbackProgress = time.seconds / duration
            }

            let shouldLoop = audioObject.loop ?? false
            endObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: newPlayer.currentItem,
                queue: .main
            ) { [weak newPlayer] _ in
                if shouldLoop {
                    newPlayer?.seek(to: .zero)
                    newPlayer?.play()
                } else {
                    isPlaying = false
                    playbackProgress = 0
                    newPlayer?.seek(to: .zero)
                }
            }
        }

        player?.play()
        isPlaying = true
        #endif
    }

    // MARK: - Teardown

    private func teardownPlayer() {
        #if os(iOS)
        player?.pause()
        if let obs = playerObserver {
            player?.removeTimeObserver(obs)
            playerObserver = nil
        }
        if let obs = endObserver {
            NotificationCenter.default.removeObserver(obs)
            endObserver = nil
        }
        player = nil
        isPlaying = false
        playbackProgress = 0
        #endif
    }

    // MARK: - UI

    private var playerContent: some View {
        HStack(spacing: 8) {
            Button(action: togglePlayback) {
                Image(systemName: buttonIcon)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .contentShape(Circle())
            }
            .accessibilityLabel(buttonAccessibilityLabel)

            waveformView
                .frame(width: 120, height: 32)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
    }

    private var buttonIcon: String {
        if isEditing {
            return isPlaying ? "pause.fill" : "play.fill"
        } else {
            return isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill"
        }
    }

    private var buttonAccessibilityLabel: String {
        if isEditing {
            return isPlaying ? "Pause" : "Lire"
        } else {
            return isMuted ? "Activer le son" : "Couper le son"
        }
    }

    private var waveformView: some View {
        TimelineView(.animation(minimumInterval: 0.05, paused: !isPlaying)) { context in
            Canvas { ctx, size in
                let samples = audioObject.waveformSamples
                guard !samples.isEmpty else { return }
                let barWidth = size.width / CGFloat(samples.count)
                let centerY = size.height / 2
                let t = context.date.timeIntervalSinceReferenceDate

                for (i, sample) in samples.enumerated() {
                    let x = CGFloat(i) * barWidth + barWidth / 2
                    let height = max(2, CGFloat(sample) * size.height * 0.9)

                    let progress = isPlaying ? playbackProgress : 0
                    let isPlayed = Double(i) / Double(samples.count) < progress
                    let alpha: Double = isPlayed ? 1.0 : 0.4

                    let animOffset: CGFloat = isPlaying && isPlayed
                        ? CGFloat(sin(t * 8 + Double(i) * 0.7)) * 2 : 0

                    ctx.fill(
                        Path(CGRect(x: x - barWidth * 0.3,
                                    y: centerY - height / 2 + animOffset,
                                    width: barWidth * 0.6,
                                    height: height)),
                        with: .color(.white.opacity(alpha))
                    )
                }
            }
        }
    }

    private func dragGesture(geo: GeometryProxy) -> some Gesture {
        DragGesture()
            .updating($dragOffset) { value, state, _ in state = value.translation }
            .onEnded { value in
                audioObject.x = min(1, max(0, audioObject.x + value.translation.width / geo.size.width))
                audioObject.y = min(1, max(0, audioObject.y + value.translation.height / geo.size.height))
                onDragEnd()
            }
    }

    // MARK: - Toggle

    private func togglePlayback() {
        #if os(iOS)
        if isEditing {
            // Mode éditeur : play/pause
            guard let url else { return }

            if player == nil {
                let newPlayer = AVPlayer(url: url)
                newPlayer.volume = audioObject.volume
                player = newPlayer

                let interval = CMTime(seconds: 0.05, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
                playerObserver = newPlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { time in
                    guard let duration = newPlayer.currentItem?.duration.seconds,
                          duration > 0 else { return }
                    playbackProgress = time.seconds / duration
                }

                endObserver = NotificationCenter.default.addObserver(
                    forName: .AVPlayerItemDidPlayToEndTime,
                    object: newPlayer.currentItem,
                    queue: .main
                ) { [weak newPlayer] _ in
                    isPlaying = false
                    playbackProgress = 0
                    newPlayer?.seek(to: .zero)
                }
            }

            isPlaying.toggle()
            if isPlaying {
                StoryMediaCoordinator.shared.activate {
                    NotificationCenter.default.post(name: .storyComposerMuteCanvas, object: nil)
                }
                Task { try? await MediaSessionCoordinator.shared.request(role: .playback) }
                player?.play()
            } else {
                player?.pause()
            }
        } else {
            // Mode viewer : mute/unmute uniquement
            isMuted.toggle()
            player?.isMuted = isMuted
        }
        #endif
    }
}
