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
//
// Plays through `SharedAVPlayerManager` (single active inline at a time).
// While playing the surface fills the bubble area — no `Color.black` letterbox
// underneath because the aspect-ratio constraint matches the video natively
// (height = width × min(1/ratio, maxAspectRatio)). The overlay controls are
// drawn ON the video as a layered top/center/bottom stack (legacy parity
// with `VideoPlayerOverlayControls`).

internal struct _InlineRenderer: View {
    let player: MeeshyVideoPlayer

    @State private var showControls: Bool = true
    @State private var controlsTimer: Timer?
    @ObservedObject private var manager = SharedAVPlayerManager.shared

    /// Aspect ratio DISPLAY (post-rotation) résolu async depuis le
    /// `preferredTransform` de l'AVAsset. iOS stocke les vidéos portrait
    /// shootées au téléphone comme `1280×720` paysage + transform de
    /// rotation 90° ; `attachment.width/height` reflètent le storage
    /// (paysage), pas l'affichage (portrait). Le thumbnail PNG, lui, est
    /// pré-tourné et reflète le display orientation — c'est pourquoi la
    /// bulle thumbnail apparaît portrait alors que `videoAspectRatio` dit
    /// paysage. Cette state aligne le cadre du surface sur la même
    /// orientation que le thumbnail, supprimant le saut entre les états.
    @State private var displayAspectRatio: CGFloat?

    private var isThisActive: Bool {
        manager.activeURL == player.attachment.fileUrl && manager.player != nil
    }

    /// Ratio source-de-vérité unique pour cette bulle. `displayAspectRatio`
    /// async prend précédence dès qu'il est résolu ; sinon fallback sur le
    /// `videoAspectRatio` de l'attachment (storage), puis 16:9.
    private var bubbleAspectRatio: CGFloat {
        displayAspectRatio ?? player.attachment.videoAspectRatio ?? (16.0 / 9.0)
    }

    var body: some View {
        // `.aspectRatio(.fit)` est posé au niveau du ZStack OUTER : c'est la
        // seule contrainte qui drive la taille de la bulle, identique entre
        // les branches thumbnail et active. `Color.black` en premier enfant
        // garantit que le ZStack assert une taille même quand les autres
        // enfants n'ont pas d'intrinsic size (MeeshyVideoSurface est un
        // UIViewRepresentable sans intrinsic, _InlineOverlayControls n'a pas
        // de frame explicite). Le ratio outer + le sizeThatFits override sur
        // MeeshyVideoSurface garantissent que la surface accepte exactement
        // la frame proposée par le ratio, sans retomber sur la naturalSize
        // de l'AVPlayerLayer.
        ZStack {
            Color.black

            if isThisActive, let p = manager.player {
                MeeshyVideoSurface(player: p, gravity: .resizeAspect, isMuted: false)
                    .onTapGesture { toggleControls() }
                if showControls {
                    _InlineOverlayControls(
                        manager: manager,
                        accentColor: player.accentColor,
                        controls: player.controls,
                        onExpand: player.onExpand
                    )
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
        .aspectRatio(bubbleAspectRatio, contentMode: .fit)
        .applyVideoFrame(player.frame)
        .task(id: player.attachment.fileUrl) {
            await resolveDisplayAspectRatio()
        }
        .onDisappear { teardown() }
        .animation(.easeInOut(duration: 0.2), value: showControls)
        .animation(.easeInOut(duration: 0.15), value: isThisActive)
    }

    /// Charge l'AVAsset et applique son `preferredTransform` à la `naturalSize`
    /// pour obtenir l'orientation d'affichage réelle. Couvre le cas iPhone
    /// portrait stocké en paysage + rotation 90°.
    @MainActor
    private func resolveDisplayAspectRatio() async {
        guard displayAspectRatio == nil else { return }
        guard let url = MeeshyConfig.resolveMediaURL(player.attachment.fileUrl) else { return }
        let asset = AVURLAsset(url: url)
        do {
            let tracks = try await asset.loadTracks(withMediaType: .video)
            guard let track = tracks.first else { return }
            let naturalSize = try await track.load(.naturalSize)
            let transform = try await track.load(.preferredTransform)
            let display = naturalSize.applying(transform)
            let w = abs(display.width)
            let h = abs(display.height)
            guard w > 0, h > 0 else { return }
            displayAspectRatio = w / h
        } catch {
            // Le fallback `attachment.videoAspectRatio ?? 16/9` reste actif.
        }
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
        manager.attachmentId = player.attachment.id
        manager.load(urlString: player.attachment.fileUrl)
        manager.play()
        scheduleControlsHide()
    }

    private func teardown() {
        controlsTimer?.invalidate(); controlsTimer = nil
        if manager.activeURL == player.attachment.fileUrl {
            manager.pause()
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

// MARK: - Mini Renderer

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
//
// Routes through `SharedAVPlayerManager` so PIP + global play coordination
// keep working. Legacy parity : filename in top bar, big center play/pause
// + skip ±10s, custom seek bar with thumb + time current/total, speed row,
// swipe-down dismiss (with PIP handoff), pinch-zoom aspect toggle, real
// save and share buttons, availability gate (downloads if not ready).

internal struct _FullscreenRenderer: View {
    let player: MeeshyVideoPlayer

    @State private var showControls: Bool = true
    @State private var controlsTimer: Timer?
    @State private var videoGravity: AVLayerVideoGravity = .resizeAspect
    @State private var saveState: SaveState = .idle
    @State private var dismissOffset: CGFloat = 0
    @State private var watchStartTime: Date?
    @State private var endObserver: NSObjectProtocol?
    @ObservedObject private var manager = SharedAVPlayerManager.shared

    internal enum SaveState { case idle, saving, saved, failed }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            switch player.availability {
            case .ready:
                if isActive {
                    playerContent
                } else {
                    loadingState
                }
            case .needsDownload, .downloading:
                downloadOverlay
            }
        }
        .offset(y: dismissOffset)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: dismissOffset)
        .onAppear { watchStartTime = Date() }
        .onDisappear { onDisappearTeardown() }
        .statusBarHidden(true)
    }

    private var isActive: Bool {
        manager.player != nil && manager.activeURL == player.attachment.fileUrl
    }

    // MARK: Player content (active)

    private var playerContent: some View {
        ZStack {
            if let p = manager.player {
                MeeshyVideoSurface(player: p, gravity: videoGravity, isMuted: false)
                    .ignoresSafeArea()
                    .onTapGesture { toggleControls() }
                    .gesture(swipeDownGesture)
                    .gesture(pinchGesture)
            }
            if showControls {
                _FullscreenOverlayControls(
                    manager: manager,
                    accentColor: player.accentColor,
                    controls: player.controls,
                    fileName: player.fileName,
                    onClose: { closePlayer() },
                    onSave: { saveToPhotos() },
                    onShare: player.onShare,
                    saveState: saveState
                )
                .transition(.opacity)
                authorAndCaptionOverlay
            }
        }
        .animation(.easeInOut(duration: 0.2), value: showControls)
        .onAppear { observeEnd() }
    }

    @ViewBuilder
    private var authorAndCaptionOverlay: some View {
        VStack {
            if player.controls.contains(.author), let author = player.author {
                HStack {
                    authorChip(author)
                        .padding(.top, 56)
                        .padding(.leading, 16)
                    Spacer()
                }
            }
            Spacer()
            if let caption = player.caption, !caption.isEmpty {
                Text(caption)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 16)
                    .padding(.bottom, 140)
                    .lineLimit(4)
            }
        }
        .allowsHitTesting(false)
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
        }
    }

    // MARK: Loading state (ready but manager not loaded yet)

    private var loadingState: some View {
        ProgressView()
            .tint(.white)
            .onAppear {
                manager.attachmentId = player.attachment.id
                manager.load(urlString: player.attachment.fileUrl)
                manager.play()
            }
    }

    // MARK: Download overlay (availability != ready)

    @ViewBuilder
    private var downloadOverlay: some View {
        ZStack {
            if player.attachment.thumbHash != nil ||
               (player.attachment.thumbnailUrl?.isEmpty == false) {
                ProgressiveCachedImage(
                    thumbHash: player.attachment.thumbHash,
                    thumbnailUrl: player.attachment.thumbnailUrl,
                    fullUrl: player.attachment.thumbnailUrl ?? ""
                ) {
                    Color.black
                }
                .aspectRatio(contentMode: .fill)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
                .blur(radius: 18)
                .overlay(Color.black.opacity(0.45))
                .ignoresSafeArea()
            }

            VStack(spacing: 16) {
                Button {
                    player.onDownload?()
                    HapticFeedback.light()
                } label: {
                    ZStack {
                        Circle().fill(.ultraThinMaterial).frame(width: 88, height: 88)
                        Circle().fill(Color(hex: player.accentColor).opacity(0.9)).frame(width: 72, height: 72)
                        downloadOverlayIcon
                    }
                    .shadow(color: .black.opacity(0.5), radius: 12, y: 4)
                }
                .disabled({
                    if case .downloading = player.availability { return true }
                    return false
                }())

                Text(downloadOverlayMessage)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white.opacity(0.85))
                    .multilineTextAlignment(.center)

                Button {
                    closePlayer()
                    HapticFeedback.light()
                } label: {
                    Text(String(localized: "media.video.close", defaultValue: "Fermer", bundle: .module))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white.opacity(0.7))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(Color.white.opacity(0.12)))
                }
                .padding(.top, 8)
            }
        }
    }

    @ViewBuilder
    private var downloadOverlayIcon: some View {
        switch player.availability {
        case .ready:
            EmptyView()
        case .needsDownload:
            Image(systemName: "arrow.down.to.line")
                .font(.system(size: 30, weight: .bold))
                .foregroundColor(.white)
        case .downloading(let progress):
            if progress > 0 {
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 44, height: 44)
                    .animation(.linear(duration: 0.2), value: progress)
            } else {
                ProgressView().tint(.white).scaleEffect(1.2)
            }
        }
    }

    private var downloadOverlayMessage: String {
        switch player.availability {
        case .ready:         return ""
        case .needsDownload: return String(localized: "media.video.downloadToPlay", defaultValue: "Telechargez pour lire la video", bundle: .module)
        case .downloading:   return String(localized: "media.video.downloadingHint", defaultValue: "La lecture demarrera apres le telechargement", bundle: .module)
        }
    }

    // MARK: Gestures

    private var swipeDownGesture: some Gesture {
        DragGesture(minimumDistance: 30)
            .onChanged { value in
                guard value.translation.height > 0 else { return }
                dismissOffset = value.translation.height
            }
            .onEnded { value in
                if value.translation.height > 150 {
                    if manager.isPlaying { manager.startPip() }
                    closePlayer()
                } else {
                    dismissOffset = 0
                }
            }
    }

    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .onEnded { scale in
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    videoGravity = scale > 1 ? .resizeAspectFill : .resizeAspect
                }
                HapticFeedback.light()
            }
    }

    // MARK: Lifecycle

    private func observeEnd() {
        guard endObserver == nil, let item = manager.player?.currentItem else { return }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item, queue: .main
        ) { _ in
            Task { @MainActor in reportWatch(complete: true) }
        }
    }

    private func onDisappearTeardown() {
        controlsTimer?.invalidate(); controlsTimer = nil
        if let obs = endObserver {
            NotificationCenter.default.removeObserver(obs)
            endObserver = nil
        }
        reportWatch(complete: false)
        watchStartTime = nil
    }

    private func closePlayer() {
        player.onClose?()
    }

    private func toggleControls() {
        withAnimation { showControls.toggle() }
        if showControls { scheduleControlsHide() }
    }

    private func scheduleControlsHide() {
        controlsTimer?.invalidate()
        controlsTimer = Timer.scheduledTimer(withTimeInterval: 4.0, repeats: false) { _ in
            Task { @MainActor in
                withAnimation { showControls = false }
            }
        }
    }

    private func reportWatch(complete: Bool) {
        guard let start = watchStartTime else { return }
        let watched = Date().timeIntervalSince(start)
        guard complete || watched >= 3 else { return }
        let currentSec = manager.currentTime
        let totalSec = manager.duration
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
                // Pull from URLSession.download (streams to disk) — avoids
                // double-loading a 200MB file into memory like .data(from:) would.
                let (tempURL, _) = try await URLSession.shared.download(from: url)
                let tempFile = FileManager.default.temporaryDirectory
                    .appendingPathComponent("save_\(UUID().uuidString).mp4")
                try FileManager.default.moveItem(at: tempURL, to: tempFile)
                let ok = await PhotoLibraryManager.shared.saveVideo(at: tempFile)
                try? FileManager.default.removeItem(at: tempFile)
                await MainActor.run {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        saveState = ok ? .saved : .failed
                    }
                    if ok {
                        HapticFeedback.success()
                        player.onSaveSuccess?()
                    } else {
                        HapticFeedback.error()
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation { saveState = .idle }
                    }
                }
            } catch {
                await MainActor.run {
                    withAnimation { saveState = .failed }
                    HapticFeedback.error()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation { saveState = .idle }
                    }
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
