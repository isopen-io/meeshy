import SwiftUI
import AVKit
import MeeshySDK

// MARK: - AVPlayerLayer View (UIViewRepresentable)

private struct AVPlayerLayerView: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerUIView {
        let view = PlayerUIView()
        view.playerLayer.videoGravity = .resizeAspectFill
        view.playerLayer.player = player
        return view
    }

    func updateUIView(_ uiView: PlayerUIView, context: Context) {
        uiView.updatePlayer(player)
    }

    final class PlayerUIView: UIView {
        let playerLayer = AVPlayerLayer()

        override init(frame: CGRect) {
            super.init(frame: frame)
            layer.addSublayer(playerLayer)
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { fatalError() }

        override func layoutSubviews() {
            super.layoutSubviews()
            playerLayer.frame = bounds
        }

        func updatePlayer(_ player: AVPlayer) {
            guard playerLayer.player !== player else { return }
            playerLayer.player = player
        }
    }
}

// MARK: - Inline Video Player View

public struct InlineVideoPlayerView: View {
    public let attachment: MeeshyMessageAttachment
    public let accentColor: String
    public var onExpandFullscreen: (() -> Void)?

    @ObservedObject private var manager = SharedAVPlayerManager.shared
    @State private var isActive = false
    @State private var showControls = true
    @State private var controlsTimer: Timer?

    private var isThisPlayerActive: Bool {
        isActive && manager.activeURL == attachment.fileUrl
    }

    public init(
        attachment: MeeshyMessageAttachment,
        accentColor: String,
        onExpandFullscreen: (() -> Void)? = nil
    ) {
        self.attachment = attachment
        self.accentColor = accentColor
        self.onExpandFullscreen = onExpandFullscreen
    }

    // MARK: - Body

    public var body: some View {
        ZStack {
            Color.black

            if isThisPlayerActive, let player = manager.player {
                AVPlayerLayerView(player: player)
                    .onTapGesture { toggleControls() }
                    .onDisappear {
                        controlsTimer?.invalidate()
                        controlsTimer = nil
                        if manager.activeURL == attachment.fileUrl {
                            manager.pause()
                        }
                    }

                if showControls {
                    VideoPlayerOverlayControls(
                        manager: manager,
                        accentColor: accentColor,
                        isFullscreen: false,
                        onExpandFullscreen: onExpandFullscreen
                    )
                    .transition(.opacity)
                }
            } else {
                thumbnailLayer

                if let formatted = attachment.durationFormatted {
                    durationBadge(formatted)
                }

                playButton
            }
        }
        .clipped()
        .contentShape(Rectangle())
        .animation(.easeInOut(duration: 0.2), value: showControls)
        .animation(.easeInOut(duration: 0.25), value: isThisPlayerActive)
    }

    // MARK: - Thumbnail Layer

    @ViewBuilder
    private var thumbnailLayer: some View {
        let thumbUrl = attachment.thumbnailUrl ?? ""

        if !thumbUrl.isEmpty {
            CachedAsyncImage(url: thumbUrl) {
                Color(hex: attachment.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fill)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()
        } else if !attachment.fileUrl.isEmpty {
            VideoThumbnailView(
                videoUrlString: attachment.fileUrl,
                accentColor: attachment.thumbnailColor
            )
        } else {
            Color(hex: attachment.thumbnailColor)
        }
    }

    // MARK: - Duration Badge

    private func durationBadge(_ formatted: String) -> some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                Text(formatted)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Color.black.opacity(0.6)))
            }
            .padding(.trailing, 6)
            .padding(.bottom, 28)
        }
    }

    // MARK: - Play Button

    private var playButton: some View {
        Button {
            startPlayback()
        } label: {
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 48, height: 48)
                Circle()
                    .fill(Color(hex: accentColor).opacity(0.85))
                    .frame(width: 42, height: 42)
                Image(systemName: "play.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                    .offset(x: 2)
            }
            .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
        }
    }

    // MARK: - Playback Actions

    private func startPlayback() {
        isActive = true
        manager.load(urlString: attachment.fileUrl)
        manager.play()
        scheduleControlsHide()
        HapticFeedback.light()

        // Download full video to cache in background (respects user data-saving preferences)
        if let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString {
            Task { await MediaCacheManager.shared.conditionalPrefetch(resolved) }
        }
    }

    private func toggleControls() {
        showControls.toggle()
        if showControls {
            scheduleControlsHide()
        }
    }

    private func scheduleControlsHide() {
        controlsTimer?.invalidate()
        controlsTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { _ in
            Task { @MainActor in
                withAnimation { showControls = false }
            }
        }
    }
}
