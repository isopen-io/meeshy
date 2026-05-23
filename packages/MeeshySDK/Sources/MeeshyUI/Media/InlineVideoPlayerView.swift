import SwiftUI
import Combine
import AVKit
import MeeshySDK

// MARK: - AVPlayerLayer View (UIViewRepresentable)

private struct AVPlayerLayerView: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerUIView {
        let view = PlayerUIView()
        view.playerLayer.videoGravity = .resizeAspect
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
    public let availability: VideoAvailability
    public let onDownload: (() -> Void)?
    public var onExpandFullscreen: (() -> Void)?

    @ObservedObject private var manager = SharedAVPlayerManager.shared
    @State private var isActive = false
    @State private var showControls = true
    @State private var controlsTimer: Timer?

    private var isThisPlayerActive: Bool {
        isActive && manager.activeURL == attachment.fileUrl
    }

    private var videoAspectRatio: CGFloat {
        guard let w = attachment.width, let h = attachment.height, w > 0, h > 0 else {
            return 16.0 / 9.0
        }
        return CGFloat(w) / CGFloat(h)
    }

    public init(
        attachment: MeeshyMessageAttachment,
        accentColor: String,
        availability: VideoAvailability = .ready,
        onDownload: (() -> Void)? = nil,
        onExpandFullscreen: (() -> Void)? = nil
    ) {
        self.attachment = attachment
        self.accentColor = accentColor
        self.availability = availability
        self.onDownload = onDownload
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
        .aspectRatio(videoAspectRatio, contentMode: .fit)
        .frame(maxHeight: 400)
        .background(Color.black)
        .clipped()
        .contentShape(Rectangle())
        .animation(.easeInOut(duration: 0.2), value: showControls)
        .animation(.easeInOut(duration: 0.25), value: isThisPlayerActive)
    }

    // MARK: - Thumbnail Layer

    @ViewBuilder
    private var thumbnailLayer: some View {
        let thumbUrl = attachment.thumbnailUrl ?? ""

        if !thumbUrl.isEmpty || attachment.thumbHash != nil {
            ProgressiveCachedImage(
                thumbHash: attachment.thumbHash,
                thumbnailUrl: attachment.thumbnailUrl,
                fullUrl: attachment.thumbnailUrl ?? attachment.fileUrl
            ) {
                Color(hex: attachment.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fit)
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
            handlePlayTap()
        } label: {
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 56, height: 56)
                Circle()
                    .fill(Color(hex: accentColor).opacity(0.85))
                    .frame(width: 48, height: 48)
                // Always render the play icon as the primary affordance.
                Image(systemName: "play.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                    .offset(x: 2)
                // Overlay the download state on top — a small badge for
                // needsDownload, a progress ring for downloading. The play
                // tap streams the video regardless of cache state (AVPlayer
                // can buffer over the network), so the badge is an
                // *additional* signal, not a replacement of the play icon.
                downloadStateOverlay
            }
            .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
        }
        .accessibilityLabel(accessibilityLabel)
    }

    @ViewBuilder
    private var downloadStateOverlay: some View {
        switch availability {
        case .ready:
            EmptyView()
        case .needsDownload:
            // Bottom-right corner badge: download glyph + size hint.
            VStack(spacing: 0) {
                Spacer()
                HStack(spacing: 0) {
                    Spacer()
                    HStack(spacing: 2) {
                        Image(systemName: "arrow.down.to.line")
                            .font(.system(size: 9, weight: .bold))
                        if attachment.fileSize > 0 {
                            Text(fmtSize(Int64(attachment.fileSize)))
                                .font(.system(size: 8, weight: .semibold, design: .monospaced))
                        }
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color.black.opacity(0.6)))
                }
            }
            .frame(width: 56, height: 56)
            .offset(x: 4, y: 4)
        case .downloading(let progress):
            Circle()
                .trim(from: 0, to: progress > 0 ? progress : 0.05)
                .stroke(Color.white, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: 52, height: 52)
                .animation(.linear(duration: 0.2), value: progress)
        }
    }

    private var accessibilityLabel: String {
        switch availability {
        case .ready:         return String(localized: "media.video.play", defaultValue: "Lire la video", bundle: .module)
        case .needsDownload: return String(localized: "media.video.download", defaultValue: "Telecharger la video", bundle: .module)
        case .downloading:   return String(localized: "media.video.downloading", defaultValue: "Telechargement en cours", bundle: .module)
        }
    }

    private func fmtSize(_ bytes: Int64) -> String {
        let kb = Double(bytes) / 1024
        if kb < 1 { return "\(bytes)B" }
        if kb < 1024 { return String(format: "%.0fKB", kb) }
        return String(format: "%.1fMB", kb / 1024)
    }

    // MARK: - Playback Actions

    private func handlePlayTap() {
        // Always start inline playback. AVPlayer streams over the network
        // when the file isn't cached; the download badge stays visible until
        // the cached copy is complete. Tapping the play button while
        // .needsDownload also kicks off the parent's downloader so the
        // viewer ends up with an offline copy after the playback session.
        if case .needsDownload = availability {
            onDownload?()
        }
        startPlayback()
    }

    private func startPlayback() {
        isActive = true
        manager.attachmentId = attachment.id
        manager.load(urlString: attachment.fileUrl)
        manager.play()
        scheduleControlsHide()
        HapticFeedback.light()
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
