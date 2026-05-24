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

// MARK: - Inline Renderer

internal struct _InlineRenderer: View {
    let player: MeeshyVideoPlayer

    @State private var avPlayer: AVPlayer?
    @State private var hasStartedPlayback = false
    @State private var showControls = true
    @State private var controlsTimer: Timer?
    @State private var statusObserver: NSKeyValueObservation?
    @StateObject private var controller = VideoPlaybackController()
    @ObservedObject private var sharedManager = SharedAVPlayerManager.shared

    private var isUsingSharedManager: Bool { player.performance.sharedPlayer }
    private var effectivePlayer: AVPlayer? {
        if isUsingSharedManager {
            return sharedManager.player
        }
        return avPlayer
    }
    private var isThisActive: Bool {
        if isUsingSharedManager {
            return sharedManager.activeURL == player.attachment.fileUrl
        }
        return hasStartedPlayback
    }

    var body: some View {
        ZStack {
            Color.black
            if let p = effectivePlayer, isThisActive {
                MeeshyVideoSurface(player: p, gravity: .resizeAspect, isMuted: false)
                    .onTapGesture { toggleControls() }
                if showControls {
                    VStack {
                        Spacer()
                        _OverlayControlsBar(
                            player: p,
                            accentColor: player.accentColor,
                            controls: player.controls,
                            onExpand: player.onExpand
                        )
                        .padding(.bottom, 10)
                    }
                    .transition(.opacity)
                }
            } else {
                MeeshyVideoThumbnail(
                    attachment: player.attachment,
                    accentColor: player.accentColor,
                    showPlayBadge: false,
                    showDurationBadge: player.controls.contains(.duration)
                )
                playButton
            }
        }
        .aspectRatio(player.attachment.videoAspectRatio ?? (16.0/9.0), contentMode: .fit)
        .applyVideoFrame(player.frame)
        .onAppear { preloadIfNeeded() }
        .onDisappear { teardown() }
        .animation(.easeInOut(duration: 0.2), value: showControls)
        .animation(.easeInOut(duration: 0.15), value: isThisActive)
    }

    private var playButton: some View {
        Button(action: handlePlayTap) {
            ZStack {
                Circle().fill(.ultraThinMaterial).frame(width: 64, height: 64)
                Circle().fill(Color(hex: player.accentColor).opacity(0.55)).frame(width: 56, height: 56)
                playButtonContent
                downloadProgressRing
            }
            .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
        }
        .accessibilityLabel(playButtonAccessibilityLabel)
        .disabled(isDownloading)
    }

    @ViewBuilder
    private var playButtonContent: some View {
        switch player.availability {
        case .ready:
            Image(systemName: "play.fill")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(.white)
                .offset(x: 2)
        case .needsDownload:
            VStack(spacing: 2) {
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.white)
                if player.attachment.fileSize > 0 {
                    Text(formatSize(Int64(player.attachment.fileSize)))
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.9))
                }
            }
        case .downloading(let progress):
            VStack(spacing: 2) {
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white.opacity(0.6))
                if progress > 0 {
                    Text("\(Int(progress * 100))%")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                } else {
                    ProgressView().tint(.white).scaleEffect(0.6)
                }
            }
        }
    }

    @ViewBuilder
    private var downloadProgressRing: some View {
        if case .downloading(let progress) = player.availability {
            Circle()
                .trim(from: 0, to: progress > 0 ? progress : 0.05)
                .stroke(Color.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: 60, height: 60)
                .animation(.linear(duration: 0.2), value: progress)
        }
    }

    private var isDownloading: Bool {
        if case .downloading = player.availability { return true }
        return false
    }

    private var playButtonAccessibilityLabel: String {
        switch player.availability {
        case .ready:         return String(localized: "media.video.play", defaultValue: "Lire la video", bundle: .module)
        case .needsDownload: return String(localized: "media.video.download", defaultValue: "Telecharger la video", bundle: .module)
        case .downloading:   return String(localized: "media.video.downloading", defaultValue: "Telechargement en cours", bundle: .module)
        }
    }

    private func formatSize(_ bytes: Int64) -> String {
        let kb = Double(bytes) / 1024
        if kb < 1 { return "\(bytes)B" }
        if kb < 1024 { return String(format: "%.0fKB", kb) }
        return String(format: "%.1fMB", kb / 1024)
    }

    private func handlePlayTap() {
        switch player.availability {
        case .ready:
            startPlayback()
        case .needsDownload:
            player.onDownload?()
            HapticFeedback.light()
        case .downloading:
            break
        }
    }

    private func startPlayback() {
        HapticFeedback.light()
        if isUsingSharedManager {
            sharedManager.attachmentId = player.attachment.id
            sharedManager.load(urlString: player.attachment.fileUrl)
            sharedManager.play()
            hasStartedPlayback = true
        } else {
            preloadIfNeeded()
            avPlayer?.playImmediately(atRate: 1.0)
            hasStartedPlayback = true
        }
        scheduleControlsHide()
    }

    private func preloadIfNeeded() {
        guard !isUsingSharedManager,
              avPlayer == nil,
              player.performance.preloadOnAppear || hasStartedPlayback,
              let url = MeeshyConfig.resolveMediaURL(player.attachment.fileUrl) else { return }
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = player.performance.preferredForwardBufferDuration
        let p = AVPlayer(playerItem: item)
        p.automaticallyWaitsToMinimizeStalling = player.performance.waitsToMinimizeStalling
        avPlayer = p
    }

    private func teardown() {
        controlsTimer?.invalidate(); controlsTimer = nil
        statusObserver?.invalidate(); statusObserver = nil
        if isUsingSharedManager {
            if sharedManager.activeURL == player.attachment.fileUrl {
                sharedManager.pause()
            }
        } else {
            avPlayer?.pause()
            avPlayer = nil
        }
    }

    private func toggleControls() {
        showControls.toggle()
        if showControls { scheduleControlsHide() }
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

// MARK: - Mini Renderer (Task 9 — stub here)

internal struct _MiniRenderer: View {
    let player: MeeshyVideoPlayer

    var body: some View {
        MeeshyVideoThumbnail(
            attachment: player.attachment,
            accentColor: player.accentColor,
            showPlayBadge: true,
            showDurationBadge: player.controls.contains(.duration),
            cornerRadius: player.frame.cornerRadius,
            onTap: player.onExpand
        )
        .aspectRatio(player.attachment.videoAspectRatio ?? 1.0, contentMode: .fit)
        .applyVideoFrame(player.frame)
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
