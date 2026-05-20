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
                playButtonContent
            }
            .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
        }
        .accessibilityLabel(accessibilityLabel)
        .disabled(isDownloading)
    }

    private var isDownloading: Bool {
        if case .downloading = availability { return true }
        return false
    }

    @ViewBuilder
    private var playButtonContent: some View {
        switch availability {
        case .ready:
            Image(systemName: "play.fill")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.white)
                .offset(x: 2)
        case .needsDownload:
            VStack(spacing: 1) {
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                if attachment.fileSize > 0 {
                    Text(fmtSize(Int64(attachment.fileSize)))
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.9))
                }
            }
        case .downloading(let progress):
            if progress > 0 {
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 28, height: 28)
                    .animation(.linear(duration: 0.2), value: progress)
            } else {
                ProgressView()
                    .tint(.white)
                    .scaleEffect(0.8)
            }
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
        switch availability {
        case .ready:
            startPlayback()
        case .needsDownload:
            // User action explicit -> trigger DL through the parent's policy-
            // aware downloader. The parent (VideoMediaView, FeedPostCard, etc.)
            // is responsible for instantiating an AttachmentDownloader.
            onDownload?()
            HapticFeedback.light()
        case .downloading:
            break
        }
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
