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

// MARK: - Fullscreen Renderer

internal struct _FullscreenRenderer: View {
    let player: MeeshyVideoPlayer

    @State private var avPlayer: AVPlayer?
    @State private var gravity: AVLayerVideoGravity = .resizeAspect
    @State private var saveState: SaveState = .idle
    @State private var watchStartTime: Date?
    @State private var endObserver: NSObjectProtocol?

    enum SaveState { case idle, saving, saved, failed }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let p = avPlayer {
                MeeshyVideoSurface(player: p, gravity: gravity, isMuted: false)
                    .ignoresSafeArea()
                    .onTapGesture(count: 2) {
                        gravity = (gravity == .resizeAspect) ? .resizeAspectFill : .resizeAspect
                        HapticFeedback.light()
                    }
            }
            chromeOverlay
        }
        .onAppear { setup() }
        .onDisappear { teardown() }
    }

    private var chromeOverlay: some View {
        VStack {
            topBar
            Spacer()
            bottomBar
        }
    }

    private var topBar: some View {
        HStack {
            if player.controls.contains(.close) {
                Button { player.onClose?() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.white.opacity(0.8))
                        .padding()
                }
            }
            if player.controls.contains(.author), let author = player.author {
                authorChip(author)
            }
            Spacer()
            if player.controls.contains(.save) { saveButton }
            if player.controls.contains(.share) { shareButton }
        }
    }

    private var bottomBar: some View {
        VStack(spacing: 8) {
            if let caption = player.caption, !caption.isEmpty {
                Text(caption)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
                    .lineLimit(3)
            }
            if let p = avPlayer {
                _OverlayControlsBar(
                    player: p,
                    accentColor: player.accentColor,
                    controls: player.controls.subtracting([.expand, .close, .save, .share, .author]),
                    onExpand: nil
                )
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
    }

    private func authorChip(_ author: MeeshyVideoPlayer.VideoAuthor) -> some View {
        Button {
            author.onTap?()
            HapticFeedback.light()
        } label: {
            HStack(spacing: 6) {
                if let avatarUrl = author.avatarUrl,
                   let url = MeeshyConfig.resolveMediaURL(avatarUrl) {
                    AsyncImage(url: url) { img in
                        img.resizable().aspectRatio(contentMode: .fill)
                    } placeholder: {
                        Circle().fill(Color.white.opacity(0.3))
                    }
                    .frame(width: 24, height: 24)
                    .clipShape(Circle())
                }
                Text(author.displayName)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(.ultraThinMaterial.opacity(0.7)))
            .padding(.leading, 4)
            .padding(.top, 8)
        }
    }

    private var saveButton: some View {
        Button { saveToPhotos() } label: {
            Group {
                switch saveState {
                case .idle:   Image(systemName: "arrow.down.to.line")
                case .saving: ProgressView().tint(.white)
                case .saved:  Image(systemName: "checkmark")
                case .failed: Image(systemName: "xmark")
                }
            }
            .font(.system(size: 18, weight: .semibold))
            .foregroundColor(.white.opacity(0.9))
            .frame(width: 40, height: 40)
            .background(Circle().fill(Color.white.opacity(0.2)))
            .padding(.trailing, 8)
            .padding(.top, 8)
        }
        .disabled(saveState == .saving || saveState == .saved)
    }

    private var shareButton: some View {
        Button {
            HapticFeedback.light()
            // Share is delegated to the host. Reuse onExpand callback to
            // signal "host should present share sheet" without expanding ABI.
            player.onExpand?()
        } label: {
            Image(systemName: "square.and.arrow.up")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.white.opacity(0.9))
                .frame(width: 40, height: 40)
                .background(Circle().fill(Color.white.opacity(0.2)))
                .padding(.trailing, 12)
                .padding(.top, 8)
        }
    }

    private func setup() {
        guard let url = MeeshyConfig.resolveMediaURL(player.attachment.fileUrl) else { return }
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = player.performance.preferredForwardBufferDuration
        let p = AVPlayer(playerItem: item)
        p.automaticallyWaitsToMinimizeStalling = player.performance.waitsToMinimizeStalling
        avPlayer = p
        watchStartTime = Date()
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item, queue: .main
        ) { _ in
            // Watch report fires asynchronously via teardown() on disappear.
        }
        p.playImmediately(atRate: 1.0)
    }

    private func teardown() {
        avPlayer?.pause()
        if let obs = endObserver { NotificationCenter.default.removeObserver(obs); endObserver = nil }
        reportWatch(complete: false)
        avPlayer = nil
        watchStartTime = nil
    }

    private func reportWatch(complete: Bool) {
        guard let start = watchStartTime, let p = avPlayer else { return }
        let watched = Date().timeIntervalSince(start)
        guard complete || watched >= 3 else { return }
        let currentSec = p.currentTime().seconds
        let totalSec = p.currentItem?.duration.seconds ?? 0
        let attId = player.attachment.id
        Task {
            let body = AttachmentStatusBody(
                action: "watched",
                playPositionMs: Int((currentSec.isNaN ? 0 : currentSec) * 1000),
                durationMs: Int((totalSec.isNaN || totalSec.isInfinite ? 0 : totalSec) * 1000),
                complete: complete
            )
            let _: APIResponse<[String: String]>? = try? await APIClient.shared.post(
                endpoint: "/attachments/\(attId)/status", body: body
            )
        }
    }

    private func saveToPhotos() {
        guard let url = MeeshyConfig.resolveMediaURL(player.attachment.fileUrl) else { return }
        saveState = .saving
        HapticFeedback.light()
        Task {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("save_\(UUID().uuidString).mp4")
                try data.write(to: tmp)
                let ok = await PhotoLibraryManager.shared.saveVideo(at: tmp)
                try? FileManager.default.removeItem(at: tmp)
                await MainActor.run {
                    saveState = ok ? .saved : .failed
                    if ok {
                        HapticFeedback.success()
                        player.onSaveSuccess?()
                    } else {
                        HapticFeedback.error()
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        saveState = .idle
                    }
                }
            } catch {
                await MainActor.run {
                    saveState = .failed
                    HapticFeedback.error()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saveState = .idle }
                }
            }
        }
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
