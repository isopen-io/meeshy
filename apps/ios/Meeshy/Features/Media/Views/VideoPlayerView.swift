//
//  VideoPlayerView.swift
//  Meeshy
//
//  Consolidated Video Player with full debugging and optimizations
//  - Memory leak fixes (NotificationCenter observers)
//  - Audio session restoration
//  - Buffering indicators
//  - Consolidated controls
//  - Comprehensive logging for development
//

import SwiftUI
import AVKit

// MARK: - AirPlay Button (AVRoutePickerView wrapper)

struct AirPlayButton: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.tintColor = .white
        view.activeTintColor = .systemBlue
        // Prioritize video routes for AirPlay
        view.prioritizesVideoDevices = true
        return view
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}

// MARK: - AVPlayerViewController Wrapper for PiP Support

struct VideoPlayerControllerRepresentable: UIViewControllerRepresentable {
    let player: AVPlayer
    var allowsPictureInPicture: Bool = true
    var showsPlaybackControls: Bool = false
    @Binding var isPiPActive: Bool
    var onPiPStarted: (() -> Void)?
    var onPiPStopped: (() -> Void)?
    var onPiPToggle: ((AVPlayerViewController) -> Void)?

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.player = player
        controller.allowsPictureInPicturePlayback = allowsPictureInPicture
        controller.showsPlaybackControls = showsPlaybackControls
        controller.delegate = context.coordinator
        controller.videoGravity = .resizeAspect

        // Configure for background audio and auto PiP
        controller.canStartPictureInPictureAutomaticallyFromInline = true

        // Store reference in coordinator for PiP toggle
        context.coordinator.playerViewController = controller

        mediaLogger.info("📹 [PiP] AVPlayerViewController created, PiP allowed: \(allowsPictureInPicture)")
        return controller
    }

    func updateUIViewController(_ uiViewController: AVPlayerViewController, context: Context) {
        if uiViewController.player !== player {
            uiViewController.player = player
            mediaLogger.debug("📹 [PiP] Player updated in AVPlayerViewController")
        }
        uiViewController.allowsPictureInPicturePlayback = allowsPictureInPicture
        uiViewController.showsPlaybackControls = showsPlaybackControls
        context.coordinator.playerViewController = uiViewController
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    @MainActor
    class Coordinator: NSObject, AVPlayerViewControllerDelegate {
        var parent: VideoPlayerControllerRepresentable
        weak var playerViewController: AVPlayerViewController?

        init(_ parent: VideoPlayerControllerRepresentable) {
            self.parent = parent
        }

        nonisolated func playerViewControllerWillStartPictureInPicture(_ playerViewController: AVPlayerViewController) {
            mediaLogger.info("📹 [PiP] Will start Picture-in-Picture")
        }

        nonisolated func playerViewControllerDidStartPictureInPicture(_ playerViewController: AVPlayerViewController) {
            mediaLogger.info("📹 [PiP] Did start Picture-in-Picture")
            Task { @MainActor [weak self] in
                self?.parent.isPiPActive = true
                self?.parent.onPiPStarted?()
            }
        }

        nonisolated func playerViewControllerWillStopPictureInPicture(_ playerViewController: AVPlayerViewController) {
            mediaLogger.info("📹 [PiP] Will stop Picture-in-Picture")
        }

        nonisolated func playerViewControllerDidStopPictureInPicture(_ playerViewController: AVPlayerViewController) {
            mediaLogger.info("📹 [PiP] Did stop Picture-in-Picture")
            Task { @MainActor [weak self] in
                self?.parent.isPiPActive = false
                self?.parent.onPiPStopped?()
            }
        }

        nonisolated func playerViewController(_ playerViewController: AVPlayerViewController, failedToStartPictureInPictureWithError error: Error) {
            mediaLogger.error("📹 [PiP] Failed to start: \(error.localizedDescription)")
        }

        nonisolated func playerViewController(_ playerViewController: AVPlayerViewController, restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void) {
            mediaLogger.info("📹 [PiP] Restore UI requested")
            completionHandler(true)
        }
    }
}

// MARK: - PiP Delegate Handler

@MainActor
class PiPDelegateHandler: NSObject, AVPictureInPictureControllerDelegate {
    var onStart: (() -> Void)?
    var onStop: (() -> Void)?
    var onRestoreUI: ((Bool) -> Void)?

    nonisolated func pictureInPictureControllerWillStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        Task { @MainActor in
            mediaLogger.info("📹 [PiP] Will start")
        }
    }

    nonisolated func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        Task { @MainActor [weak self] in
            mediaLogger.info("📹 [PiP] Did start")
            self?.onStart?()
        }
    }

    nonisolated func pictureInPictureControllerWillStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        Task { @MainActor in
            mediaLogger.info("📹 [PiP] Will stop")
        }
    }

    nonisolated func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        Task { @MainActor [weak self] in
            mediaLogger.info("📹 [PiP] Did stop")
            self?.onStop?()
        }
    }

    nonisolated func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error) {
        Task { @MainActor in
            mediaLogger.error("📹 [PiP] Failed to start: \(error.localizedDescription)")
        }
    }

    nonisolated func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void) {
        // Call completionHandler synchronously to avoid concurrency issues
        completionHandler(true)
        Task { @MainActor [weak self] in
            mediaLogger.info("📹 [PiP] Restore UI requested")
            self?.onRestoreUI?(true)
        }
    }
}

// MARK: - Video Logger (uses global mediaLogger from LoggerGlobal.swift)

// MARK: - Video Player State

enum VideoPlayerState: Equatable {
    case idle
    case loading
    case buffering
    case ready
    case playing
    case paused
    case error(String)

    var isPlayable: Bool {
        switch self {
        case .ready, .playing, .paused:
            return true
        default:
            return false
        }
    }

    var description: String {
        switch self {
        case .idle: return "idle"
        case .loading: return "loading"
        case .buffering: return "buffering"
        case .ready: return "ready"
        case .playing: return "playing"
        case .paused: return "paused"
        case .error(let msg): return "error: \(msg)"
        }
    }
}

// MARK: - Fullscreen Video Player View

struct VideoPlayerView: View {
    @Environment(\.dismiss) private var dismiss

    let url: URL
    /// Conversation ID for PiP restoration (optional)
    let conversationId: String?
    /// Message ID for scroll-to-message on PiP restore (optional)
    let messageId: String?

    @StateObject private var viewModel: VideoPlayerViewModel
    @State private var showControls = true
    @State private var hideControlsTask: Task<Void, Never>?
    @State private var isPiPActive = false

    // PiP support - use AVPlayerViewController's built-in PiP
    @State private var pipController: AVPictureInPictureController?
    @State private var pipDelegateHandler = PiPDelegateHandler()

    // Download and Share states
    @State private var showShareSheet = false
    @State private var isDownloading = false
    @State private var downloadComplete = false

    init(url: URL, conversationId: String? = nil, messageId: String? = nil) {
        self.url = url
        self.conversationId = conversationId
        self.messageId = messageId
        self._viewModel = StateObject(wrappedValue: VideoPlayerViewModel(url: url))
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Main content based on state
            switch viewModel.state {
            case .idle, .loading:
                loadingView
            case .buffering:
                bufferingOverlay
            case .error(let message):
                errorView(message: message)
            case .ready, .playing, .paused:
                videoContent
            }

            // Close button (synced with controls visibility)
            if showControls || viewModel.state != .playing {
                closeButton
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: showControls)
        .onAppear {
            mediaLogger.info("📹 [Fullscreen] View appeared for: \(url.lastPathComponent)")
            viewModel.setupPlayer()

            // Setup PiP delegate callbacks
            pipDelegateHandler.onStart = {
                isPiPActive = true
            }
            pipDelegateHandler.onStop = {
                isPiPActive = false
            }
        }
        .onDisappear {
            mediaLogger.info("📹 [Fullscreen] View disappeared")
            hideControlsTask?.cancel()
            // Only cleanup if PiP is not active
            if !isPiPActive {
                viewModel.cleanup()
            }
        }
        .statusBarHidden(!showControls && viewModel.state == .playing)
        .sheet(isPresented: $showShareSheet) {
            VideoShareSheet(url: url)
        }
    }

    // MARK: - Close Button

    private var closeButton: some View {
        GeometryReader { geometry in
            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 30))
                            .foregroundColor(.white)
                            .shadow(color: .black.opacity(0.6), radius: 4)
                    }
                    .padding(.leading, 16)
                    .padding(.top, geometry.safeAreaInsets.top + 8)

                    Spacer()
                }
                Spacer()
            }
        }
        .zIndex(10)
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
                .tint(.white)
            Text("Chargement de la vidéo...")
                .font(.system(size: 14))
                .foregroundColor(.white.opacity(0.7))

            // Debug info
            Text("URL: \(url.lastPathComponent)")
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.4))
        }
    }

    // MARK: - Buffering Overlay

    private var bufferingOverlay: some View {
        ZStack {
            videoPlayerContent

            VStack {
                Spacer()
                HStack {
                    ProgressView()
                        .tint(.white)
                    Text("Mise en mémoire tampon...")
                        .font(.caption)
                        .foregroundColor(.white)
                }
                .padding(8)
                .background(Capsule().fill(Color.black.opacity(0.6)))
                Spacer()
            }
        }
    }

    // MARK: - Error View

    private func errorView(message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundColor(.orange)
            Text("Impossible de lire la vidéo")
                .font(.headline)
                .foregroundColor(.white)
            Text(message)
                .font(.caption)
                .foregroundColor(.white.opacity(0.7))
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            // Retry button
            Button {
                mediaLogger.info("📹 [Fullscreen] Retry requested")
                viewModel.retry()
            } label: {
                Label("Réessayer", systemImage: "arrow.clockwise")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(Color.blue))
            }
            .padding(.top, 8)

            // Debug info
            VStack(alignment: .leading, spacing: 4) {
                Text("Debug Info:")
                    .font(.system(size: 10, weight: .bold))
                Text("URL: \(url.absoluteString)")
                Text("Scheme: \(url.scheme ?? "nil")")
                Text("isFileURL: \(url.isFileURL)")
            }
            .font(.system(size: 9))
            .foregroundColor(.white.opacity(0.4))
            .padding()
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.1)))
        }
    }

    // MARK: - Video Content

    private var videoContent: some View {
        ZStack {
            videoPlayerContent

            if showControls {
                fullscreenControls
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.2)) {
                showControls.toggle()
            }
            scheduleHideControls()
        }
        .gesture(
            DragGesture(minimumDistance: 50)
                .onEnded { value in
                    // Swipe down to enter PiP
                    if value.translation.height > 100 && abs(value.translation.width) < 100 {
                        mediaLogger.info("📹 [Fullscreen] Swipe down detected - entering PiP")
                        startPiPAndDismiss()
                    }
                }
        )
    }

    private var videoPlayerContent: some View {
        PiPEnabledVideoPlayer(
            player: viewModel.player,
            pipController: $pipController,
            pipDelegate: pipDelegateHandler
        )
        .ignoresSafeArea()
    }

    /// Start PiP and dismiss the fullscreen view
    /// Uses GlobalPiPManager to maintain playback across navigation
    private func startPiPAndDismiss() {
        mediaLogger.info("📹 [Fullscreen] startPiPAndDismiss called, conversation: \(conversationId ?? "nil")")

        // Ensure video is playing
        if viewModel.state == .paused {
            viewModel.togglePlayPause()
        }

        // Transfer playback to GlobalPiPManager
        // This keeps the video playing even when leaving the conversation
        if let player = viewModel.player {
            GlobalPiPManager.shared.takeOverPlayback(
                from: player,
                url: url,
                currentTime: viewModel.currentTime,
                conversationId: conversationId,
                messageId: messageId
            )

            // Clear viewModel's player to prevent double cleanup
            viewModel.transferPlayerToGlobalPiP()

            // Dismiss after a short delay to allow PiP to start
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                dismiss()
            }
        } else {
            mediaLogger.warn("📹 [Fullscreen] No player available for PiP transfer")
            dismiss()
        }
    }

    // MARK: - Fullscreen Controls

    private var fullscreenControls: some View {
        GeometryReader { geometry in
            let safeArea = geometry.safeAreaInsets
            let availableWidth = geometry.size.width - safeArea.leading - safeArea.trailing - 32 // 16px padding each side

            VStack(spacing: 0) {
                Spacer()

                VStack(spacing: 10) {
                    // Progress Bar - respect safe areas
                    VideoProgressBar(
                        progress: viewModel.progressPercentage,
                        bufferedProgress: viewModel.bufferedPercentage,
                        onSeek: { progress in
                            viewModel.seek(to: progress * viewModel.duration)
                        }
                    )
                    .frame(height: 20)

                    // Time Labels
                    HStack {
                        Text(formatTime(viewModel.currentTime))
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundColor(.white)

                        Spacer()

                        Text(formatTime(viewModel.duration))
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundColor(.white)
                    }

                    // Control Buttons - use available width
                    controlButtonsView(availableWidth: availableWidth)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 16 + safeArea.leading)
                .padding(.trailing, safeArea.trailing)
                .padding(.vertical, 10)
                .padding(.bottom, max(safeArea.bottom, 12))
                .background(
                    LinearGradient(
                        gradient: Gradient(colors: [.clear, .black.opacity(0.85)]),
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .ignoresSafeArea()
                )
            }
        }
        .transition(.opacity)
    }

    // MARK: - Control Buttons (Adaptive)

    @ViewBuilder
    private func controlButtonsView(availableWidth: CGFloat) -> some View {
        // Always use 3-row layout for cleaner appearance
        VStack(spacing: 12) {
            // Row 1: Main playback controls (centered)
            HStack(spacing: 0) {
                Spacer()

                HStack(spacing: 28) {
                    // Rewind 10s
                    Button { viewModel.skip(by: -10) } label: {
                        Image(systemName: "gobackward.10")
                            .font(.system(size: 22, weight: .medium))
                            .foregroundColor(.white)
                    }
                    .frame(width: 44, height: 44)

                    // Play/Pause
                    Button { viewModel.togglePlayPause() } label: {
                        Image(systemName: viewModel.state == .playing ? "pause.circle.fill" : "play.circle.fill")
                            .font(.system(size: 52))
                            .foregroundColor(.white)
                    }

                    // Forward 10s
                    Button { viewModel.skip(by: 10) } label: {
                        Image(systemName: "goforward.10")
                            .font(.system(size: 22, weight: .medium))
                            .foregroundColor(.white)
                    }
                    .frame(width: 44, height: 44)
                }

                Spacer()
            }

            // Row 2: Secondary controls (spaced evenly)
            HStack(spacing: 0) {
                // Playback Speed (left)
                Menu {
                    ForEach([0.5, 0.75, 1.0, 1.25, 1.5, 2.0], id: \.self) { speed in
                        Button("\(speed, specifier: "%.2g")x") {
                            viewModel.setPlaybackSpeed(Float(speed))
                        }
                    }
                } label: {
                    Text(String(format: "%.2gx", viewModel.playbackSpeed))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 40, height: 26)
                        .background(Color.white.opacity(0.2))
                        .cornerRadius(5)
                }

                Spacer()

                // Volume
                Button { viewModel.toggleMute() } label: {
                    Image(systemName: viewModel.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        .font(.system(size: 18))
                        .foregroundColor(.white)
                }
                .frame(width: 40, height: 40)

                Spacer()

                // Picture-in-Picture
                Button { togglePictureInPicture() } label: {
                    Image(systemName: isPiPActive ? "pip.exit" : "pip.enter")
                        .font(.system(size: 18))
                        .foregroundColor(.white)
                }
                .frame(width: 40, height: 40)

                Spacer()

                // AirPlay (right)
                AirPlayButton()
                    .frame(width: 26, height: 26)
            }

            // Row 3: Action buttons (Download + Share)
            actionButtonsRow
        }
    }

    // MARK: - Action Buttons Row (Download + Share)

    private var actionButtonsRow: some View {
        HStack(spacing: 40) {
            // Download button
            Button {
                downloadVideo()
            } label: {
                VStack(spacing: 4) {
                    ZStack {
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.system(size: 26))
                            .foregroundColor(.blue)
                            .opacity(isDownloading ? 0 : 1)

                        if isDownloading {
                            ProgressView()
                                .tint(.blue)
                                .scaleEffect(0.8)
                        }

                        if downloadComplete {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 26))
                                .foregroundColor(.green)
                        }
                    }

                    Text("Telecharger")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                }
            }
            .disabled(isDownloading)

            // Share button
            Button {
                hapticFeedback(.medium)
                showShareSheet = true
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "square.and.arrow.up.circle.fill")
                        .font(.system(size: 26))
                        .foregroundColor(.green)

                    Text("Partager")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                }
            }
        }
        .padding(.top, 4)
    }

    // MARK: - Download Video

    private func downloadVideo() {
        guard !isDownloading else { return }

        hapticFeedback(.medium)
        isDownloading = true
        downloadComplete = false

        Task {
            do {
                let cachedURL = try await AttachmentFileCache.shared.downloadAndCache(from: url.absoluteString, type: .video)
                await MainActor.run {
                    isDownloading = false
                    if cachedURL != nil {
                        downloadComplete = true
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                        mediaLogger.info("Video telechargee avec succes: \(url.lastPathComponent)")

                        // Reset the checkmark after 2 seconds
                        Task {
                            try? await Task.sleep(nanoseconds: 2_000_000_000)
                            await MainActor.run {
                                downloadComplete = false
                            }
                        }
                    } else {
                        UINotificationFeedbackGenerator().notificationOccurred(.error)
                        mediaLogger.error("Echec du telechargement: \(url.lastPathComponent)")
                    }
                }
            } catch {
                await MainActor.run {
                    isDownloading = false
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                    mediaLogger.error("Erreur de telechargement: \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - Haptic Feedback

    private func hapticFeedback(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred()
    }

    // MARK: - Helpers

    private func scheduleHideControls() {
        hideControlsTask?.cancel()
        hideControlsTask = Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000) // 3 seconds
            if !Task.isCancelled {
                await MainActor.run {
                    withAnimation {
                        showControls = false
                    }
                }
            }
        }
    }

    private func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite else { return "0:00" }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    /// Toggle Picture-in-Picture mode
    private func togglePictureInPicture() {
        mediaLogger.info("📹 [Fullscreen] Toggle PiP requested, current state: \(isPiPActive)")

        guard let pipController = pipController else {
            mediaLogger.warn("📹 [Fullscreen] No PiP controller available for toggle")
            return
        }

        if isPiPActive {
            pipController.stopPictureInPicture()
        } else {
            if pipController.isPictureInPicturePossible {
                pipController.startPictureInPicture()
            } else {
                mediaLogger.warn("📹 [Fullscreen] PiP not possible at this time")
            }
        }
    }
}

// MARK: - PiP Enabled Video Player (UIKit wrapper with proper PiP support)

struct PiPEnabledVideoPlayer: UIViewRepresentable {
    let player: AVPlayer?
    @Binding var pipController: AVPictureInPictureController?
    let pipDelegate: PiPDelegateHandler

    func makeUIView(context: Context) -> PiPPlayerView {
        let view = PiPPlayerView()
        view.backgroundColor = .black
        view.player = player
        return view
    }

    func updateUIView(_ uiView: PiPPlayerView, context: Context) {
        if uiView.player !== player {
            uiView.player = player
        }

        // Setup PiP controller if player is available and controller not yet created
        if let player = player, pipController == nil {
            DispatchQueue.main.async {
                if let controller = uiView.setupPiPController(delegate: pipDelegate) {
                    self.pipController = controller
                    mediaLogger.info("📹 [PiPPlayer] PiP controller created and stored")
                }
            }
        }
    }

    class PiPPlayerView: UIView {
        private var playerLayer: AVPlayerLayer?
        private var _pipController: AVPictureInPictureController?

        var player: AVPlayer? {
            didSet {
                if let layer = playerLayer {
                    layer.player = player
                } else if let player = player {
                    let layer = AVPlayerLayer(player: player)
                    layer.videoGravity = .resizeAspect
                    self.layer.addSublayer(layer)
                    self.playerLayer = layer
                    setNeedsLayout()
                }
            }
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            playerLayer?.frame = bounds
        }

        func setupPiPController(delegate: AVPictureInPictureControllerDelegate) -> AVPictureInPictureController? {
            guard _pipController == nil else {
                return _pipController
            }

            guard let playerLayer = playerLayer else {
                mediaLogger.warn("📹 [PiPPlayer] No player layer for PiP setup")
                return nil
            }

            guard AVPictureInPictureController.isPictureInPictureSupported() else {
                mediaLogger.warn("📹 [PiPPlayer] PiP not supported on this device")
                return nil
            }

            let controller = AVPictureInPictureController(playerLayer: playerLayer)
            controller?.delegate = delegate
            controller?.canStartPictureInPictureAutomaticallyFromInline = true
            _pipController = controller

            mediaLogger.info("📹 [PiPPlayer] PiP controller created, isPossible: \(controller?.isPictureInPicturePossible ?? false)")

            return controller
        }
    }
}

// MARK: - Video Player ViewModel

@MainActor
final class VideoPlayerViewModel: ObservableObject {
    // MARK: - Properties

    let url: URL
    private(set) var player: AVPlayer?
    private let mediaId: String

    @Published private(set) var state: VideoPlayerState = .idle
    @Published private(set) var currentTime: Double = 0
    @Published private(set) var duration: Double = 0
    @Published private(set) var bufferedTime: Double = 0
    @Published var playbackSpeed: Float = 1.0
    @Published var isMuted = false

    var progressPercentage: Double {
        guard duration > 0 else { return 0 }
        return currentTime / duration
    }

    var bufferedPercentage: Double {
        guard duration > 0 else { return 0 }
        return bufferedTime / duration
    }

    // MARK: - Observers (CRITICAL: Must be cleaned up)

    private var timeObserver: Any?
    private var statusObserver: NSKeyValueObservation?
    private var bufferObserver: NSKeyValueObservation?
    private var playbackBufferEmptyObserver: NSKeyValueObservation?
    private var playbackLikelyToKeepUpObserver: NSKeyValueObservation?
    private var endPlaybackObserver: NSObjectProtocol?  // FIX: Now properly tracked
    private var durationTask: Task<Void, Never>?

    // MARK: - Initialization

    init(url: URL) {
        self.url = url
        self.mediaId = "video_fullscreen_" + url.absoluteString.hashValue.description
        mediaLogger.info("📹 [ViewModel] Init for: \(url.lastPathComponent)")
        mediaLogger.debug("📹 [ViewModel] Full URL: \(url.absoluteString)")
        mediaLogger.debug("📹 [ViewModel] Scheme: \(url.scheme ?? "nil"), isFileURL: \(url.isFileURL)")
    }

    deinit {
        mediaLogger.info("📹 [ViewModel] Deinit")
    }

    // MARK: - Setup

    func setupPlayer() {
        guard state == .idle else {
            mediaLogger.warn("📹 [ViewModel] setupPlayer called but state is: \(self.state.description)")
            return
        }

        state = .loading
        mediaLogger.info("📹 [ViewModel] Setting up player...")

        // Configure audio session
        configureAudioSession()

        // Create asset and player
        let asset = AVURLAsset(url: url)
        mediaLogger.debug("📹 [ViewModel] Created AVURLAsset")

        let playerItem = AVPlayerItem(asset: asset)
        player = AVPlayer(playerItem: playerItem)
        mediaLogger.info("📹 [ViewModel] Player created")

        // Register with MediaPlaybackManager for exclusive playback
        MediaPlaybackManager.shared.register(id: mediaId) { [weak self] in
            Task { @MainActor in
                mediaLogger.info("📹 [ViewModel] Stop callback received from MediaPlaybackManager")
                self?.stopPlayback()
            }
        }

        // Setup all observers
        setupTimeObserver()
        setupStatusObserver(for: playerItem)
        setupBufferObservers(for: playerItem)
        setupEndPlaybackObserver(for: playerItem)

        // Load duration
        loadDuration(from: asset)
    }

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback, options: [.allowAirPlay])
            try session.setActive(true)
            mediaLogger.info("📹 [ViewModel] Audio session configured: category=playback, mode=moviePlayback")
        } catch {
            mediaLogger.error("📹 [ViewModel] Audio session error: \(error.localizedDescription)")
        }
    }

    private func setupTimeObserver() {
        let interval = CMTime(seconds: 0.2, preferredTimescale: 600)  // 200ms for better battery
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self else { return }
            self.currentTime = time.seconds
            MediaPlaybackManager.shared.updatePlaybackTime(id: self.mediaId, time: time.seconds)
        }
        mediaLogger.debug("📹 [ViewModel] Time observer setup (200ms interval)")
    }

    private func setupStatusObserver(for playerItem: AVPlayerItem) {
        statusObserver = playerItem.observe(\.status, options: [.new, .initial]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self = self else { return }

                let statusString: String
                switch item.status {
                case .unknown: statusString = "unknown (0)"
                case .readyToPlay: statusString = "readyToPlay (1)"
                case .failed: statusString = "failed (2)"
                @unknown default: statusString = "unknown default"
                }
                mediaLogger.info("📹 [ViewModel] Player item status: \(statusString)")

                switch item.status {
                case .readyToPlay:
                    if self.state == .loading {
                        self.state = .ready
                        mediaLogger.info("📹 [ViewModel] ✅ Ready to play")
                    }

                case .failed:
                    let errorMessage = self.extractErrorDetails(from: item.error)
                    self.state = .error(errorMessage)
                    mediaLogger.error("📹 [ViewModel] ❌ Failed: \(errorMessage)")

                case .unknown:
                    mediaLogger.debug("📹 [ViewModel] Status still unknown, waiting...")

                @unknown default:
                    break
                }
            }
        }
    }

    private func setupBufferObservers(for playerItem: AVPlayerItem) {
        // Track buffered time ranges
        bufferObserver = playerItem.observe(\.loadedTimeRanges, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self = self else { return }
                if let timeRange = item.loadedTimeRanges.first?.timeRangeValue {
                    let buffered = CMTimeGetSeconds(timeRange.start) + CMTimeGetSeconds(timeRange.duration)
                    self.bufferedTime = buffered
                    mediaLogger.debug("📹 [ViewModel] Buffered: \(String(format: "%.1f", buffered))s")
                }
            }
        }

        // Detect buffer empty (need to buffer)
        playbackBufferEmptyObserver = playerItem.observe(\.isPlaybackBufferEmpty, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self = self else { return }
                if item.isPlaybackBufferEmpty && self.state == .playing {
                    mediaLogger.warn("📹 [ViewModel] ⏳ Buffer empty - buffering...")
                    self.state = .buffering
                }
            }
        }

        // Detect buffer ready
        playbackLikelyToKeepUpObserver = playerItem.observe(\.isPlaybackLikelyToKeepUp, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self = self else { return }
                if item.isPlaybackLikelyToKeepUp && self.state == .buffering {
                    mediaLogger.info("📹 [ViewModel] ✅ Buffer ready - resuming playback")
                    self.state = .playing
                    self.player?.play()
                }
            }
        }

        mediaLogger.debug("📹 [ViewModel] Buffer observers setup")
    }

    private func setupEndPlaybackObserver(for playerItem: AVPlayerItem) {
        // FIX: Properly track the observer for cleanup
        endPlaybackObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                mediaLogger.info("📹 [ViewModel] Playback reached end")
                self?.stopPlayback()
                self?.seek(to: 0)
            }
        }
        mediaLogger.debug("📹 [ViewModel] End playback observer setup")
    }

    private func loadDuration(from asset: AVURLAsset) {
        durationTask = Task {
            do {
                let duration = try await asset.load(.duration)
                let seconds = duration.seconds
                self.duration = seconds.isFinite ? seconds : 0
                mediaLogger.info("📹 [ViewModel] Duration loaded: \(String(format: "%.1f", self.duration))s")

                // Check for saved position from inline player
                if let savedPosition = MediaPlaybackManager.shared.getSavedPosition(for: mediaId) {
                    mediaLogger.info("📹 [ViewModel] Restoring position: \(String(format: "%.1f", savedPosition))s")
                    seek(to: savedPosition)

                    if MediaPlaybackManager.shared.isCurrentlyPlaying(id: mediaId) {
                        player?.play()
                        state = .playing
                    }
                }
            } catch {
                mediaLogger.error("📹 [ViewModel] Duration load error: \(error.localizedDescription)")
            }
        }
    }

    private func extractErrorDetails(from error: Error?) -> String {
        guard let error = error else { return "Erreur inconnue" }

        let nsError = error as NSError
        mediaLogger.error("📹 [ViewModel] Error domain: \(nsError.domain)")
        mediaLogger.error("📹 [ViewModel] Error code: \(nsError.code)")
        mediaLogger.error("📹 [ViewModel] Error userInfo: \(nsError.userInfo)")

        // Check for specific error types
        if nsError.domain == NSURLErrorDomain {
            switch nsError.code {
            case NSURLErrorNotConnectedToInternet:
                return "Pas de connexion internet"
            case NSURLErrorTimedOut:
                return "Délai d'attente dépassé"
            case NSURLErrorCannotFindHost:
                return "Serveur introuvable"
            case NSURLErrorSecureConnectionFailed:
                return "Connexion sécurisée échouée (vérifier ATS)"
            default:
                return "Erreur réseau: \(nsError.code)"
            }
        }

        if nsError.domain == AVFoundationErrorDomain {
            switch nsError.code {
            case AVError.fileFormatNotRecognized.rawValue:
                return "Format vidéo non reconnu"
            case AVError.mediaServicesWereReset.rawValue:
                return "Services média réinitialisés"
            default:
                return "Erreur AVFoundation: \(nsError.code)"
            }
        }

        return error.localizedDescription
    }

    // MARK: - Cleanup (CRITICAL)

    func cleanup() {
        mediaLogger.info("📹 [ViewModel] Cleanup starting...")

        // Cancel ongoing tasks
        durationTask?.cancel()
        durationTask = nil

        // Stop playback
        stopPlayback()

        // Unregister from MediaPlaybackManager
        MediaPlaybackManager.shared.unregister(id: mediaId)

        // Remove time observer
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
            mediaLogger.debug("📹 [ViewModel] Time observer removed")
        }

        // Invalidate KVO observers
        statusObserver?.invalidate()
        statusObserver = nil

        bufferObserver?.invalidate()
        bufferObserver = nil

        playbackBufferEmptyObserver?.invalidate()
        playbackBufferEmptyObserver = nil

        playbackLikelyToKeepUpObserver?.invalidate()
        playbackLikelyToKeepUpObserver = nil

        // FIX: Remove NotificationCenter observer (MEMORY LEAK FIX)
        if let observer = endPlaybackObserver {
            NotificationCenter.default.removeObserver(observer)
            endPlaybackObserver = nil
            mediaLogger.debug("📹 [ViewModel] End playback observer removed")
        }

        // Clear player
        player = nil

        // FIX: Restore audio session
        restoreAudioSession()

        // Reset state
        state = .idle

        mediaLogger.info("📹 [ViewModel] ✅ Cleanup complete")
    }

    private func restoreAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            mediaLogger.info("📹 [ViewModel] Audio session deactivated")
        } catch {
            mediaLogger.warn("📹 [ViewModel] Audio session deactivation warning: \(error.localizedDescription)")
        }
    }

    // MARK: - Controls

    /// Transfer player ownership to GlobalPiPManager (for PiP across navigation)
    /// This prevents cleanup from stopping the video
    func transferPlayerToGlobalPiP() {
        mediaLogger.info("📹 [ViewModel] Transferring player to GlobalPiPManager")

        // Remove observers but don't stop playback
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
        }

        statusObserver?.invalidate()
        statusObserver = nil

        bufferObserver?.invalidate()
        bufferObserver = nil

        playbackBufferEmptyObserver?.invalidate()
        playbackBufferEmptyObserver = nil

        playbackLikelyToKeepUpObserver?.invalidate()
        playbackLikelyToKeepUpObserver = nil

        if let observer = endPlaybackObserver {
            NotificationCenter.default.removeObserver(observer)
            endPlaybackObserver = nil
        }

        durationTask?.cancel()
        durationTask = nil

        // Unregister from MediaPlaybackManager (GlobalPiPManager will re-register)
        MediaPlaybackManager.shared.unregister(id: mediaId)

        // Clear reference without stopping player
        player = nil
        state = .idle

        mediaLogger.info("📹 [ViewModel] Player transferred, observers cleaned up")
    }

    func togglePlayPause() {
        switch state {
        case .ready, .paused:
            startPlayback()
        case .playing:
            pausePlayback()
        case .error:
            retry()
        default:
            mediaLogger.warn("📹 [ViewModel] togglePlayPause ignored in state: \(self.state.description)")
        }
    }

    private func startPlayback() {
        guard MediaPlaybackManager.shared.requestPlay(id: mediaId, currentTime: currentTime) else {
            mediaLogger.warn("📹 [ViewModel] MediaPlaybackManager denied playback")
            return
        }

        player?.play()
        player?.rate = playbackSpeed
        state = .playing
        mediaLogger.info("📹 [ViewModel] ▶️ Started playback at \(String(format: "%.1f", currentTime))s")
    }

    private func pausePlayback() {
        player?.pause()
        state = .paused
        MediaPlaybackManager.shared.notifyPause(id: mediaId, at: currentTime)
        mediaLogger.info("📹 [ViewModel] ⏸️ Paused at \(String(format: "%.1f", currentTime))s")
    }

    private func stopPlayback() {
        player?.pause()
        if state == .playing || state == .buffering {
            state = .paused
        }
        MediaPlaybackManager.shared.notifyStop(id: mediaId)
        mediaLogger.info("📹 [ViewModel] ⏹️ Stopped")
    }

    func seek(to time: Double) {
        let clampedTime = max(0, min(time, duration))
        let cmTime = CMTime(seconds: clampedTime, preferredTimescale: 600)

        player?.seek(to: cmTime, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
            if finished {
                Task { @MainActor in
                    self?.currentTime = clampedTime
                    MediaPlaybackManager.shared.updatePlaybackTime(id: self?.mediaId ?? "", time: clampedTime)
                    mediaLogger.debug("📹 [ViewModel] Seeked to \(String(format: "%.1f", clampedTime))s")
                }
            }
        }
    }

    func skip(by seconds: Double) {
        let newTime = currentTime + seconds
        seek(to: newTime)
    }

    func setPlaybackSpeed(_ speed: Float) {
        playbackSpeed = speed
        if state == .playing {
            player?.rate = speed
        }
        mediaLogger.info("📹 [ViewModel] Speed set to \(speed)x")
    }

    func toggleMute() {
        isMuted.toggle()
        player?.isMuted = isMuted
        mediaLogger.info("📹 [ViewModel] Mute: \(isMuted)")
    }

    func retry() {
        mediaLogger.info("📹 [ViewModel] Retrying...")
        cleanup()
        state = .idle
        setupPlayer()
    }
}

// MARK: - Inline Video Player (for message bubbles)

struct InlineVideoPlayer: View {
    let url: URL
    let thumbnailUrl: String?
    let duration: TimeInterval?
    var onOpenFullscreen: (() -> Void)?

    @StateObject private var viewModel: InlineVideoPlayerViewModel
    @State private var generatedThumbnail: UIImage?
    @State private var isLoadingThumbnail = false
    @State private var showInlineControls = false
    @State private var hideControlsTask: Task<Void, Never>?
    @State private var isDraggingProgress = false
    @State private var videoSize: CGSize = .zero

    // Size constants
    // - Portrait/square videos: 220px → 300px when playing (1.36x)
    // - Landscape 16:9 videos: Stay at 320px (NO enlargement to avoid layout issues)
    // - When video ends: back to normal size
    private let portraitBaseWidth: CGFloat = 220
    private let portraitPlayingWidth: CGFloat = 300
    private let landscapeBaseWidth: CGFloat = 320
    private let landscapePlayingWidth: CGFloat = 320 // Same as base - no enlargement for landscape

    init(url: URL, thumbnailUrl: String? = nil, duration: TimeInterval? = nil, onOpenFullscreen: (() -> Void)? = nil) {
        self.url = url
        self.thumbnailUrl = thumbnailUrl
        self.duration = duration
        self.onOpenFullscreen = onOpenFullscreen
        self._viewModel = StateObject(wrappedValue: InlineVideoPlayerViewModel(url: url))
    }

    /// Determine if video is landscape (16:9 or wider)
    private var isLandscapeVideo: Bool {
        videoAspectRatio >= 1.5 // 16:9 = 1.77, 4:3 = 1.33
    }

    /// Should enlarge: when playing and not ended
    private var shouldEnlarge: Bool {
        viewModel.isCurrentlyPlaying
    }

    /// Current width based on video orientation and playback state
    private var currentWidth: CGFloat {
        if isLandscapeVideo {
            return shouldEnlarge ? landscapePlayingWidth : landscapeBaseWidth
        } else {
            return shouldEnlarge ? portraitPlayingWidth : portraitBaseWidth
        }
    }

    /// Current height calculated from width and aspect ratio
    private var currentHeight: CGFloat {
        currentWidth / videoAspectRatio
    }

    var body: some View {
        videoContent
            .aspectRatio(videoAspectRatio, contentMode: .fit)
            .frame(width: currentWidth, height: currentHeight)
            .background(Color.black)
            .cornerRadius(12)
            .clipped()
            .contentShape(Rectangle())
            .onTapGesture {
                handleTap()
            }
            .animation(.easeInOut(duration: 0.25), value: shouldEnlarge)
            .onAppear {
                mediaLogger.info("📹 [Inline] View appeared for: \(url.lastPathComponent)")
                loadThumbnailIfNeeded()
            }
            .onDisappear {
                mediaLogger.info("📹 [Inline] View disappeared")
                hideControlsTask?.cancel()
                viewModel.cleanup()
            }
    }

    // MARK: - Video Content

    private var videoContent: some View {
        ZStack {
            // Background always visible
            Color.black

            // Thumbnail - only show when NOT started playing
            if !viewModel.hasStarted {
                thumbnailView
                    .transition(.opacity)
            }

            // Video layer - only show when playing
            if viewModel.hasStarted && viewModel.player != nil {
                VideoPlayerLayer(player: viewModel.player)
                    .transition(.opacity)
            }

            // Loading overlay
            if viewModel.state == .loading {
                Color.black.opacity(0.4)
                ProgressView()
                    .tint(.white)
                    .scaleEffect(1.2)
            }

            // Buffering overlay
            if viewModel.state == .buffering {
                Color.black.opacity(0.3)
                ProgressView()
                    .tint(.white)
            }

            // Error overlay
            if case .error(let message) = viewModel.state {
                errorOverlay(message: message)
            }

            // Controls overlay - tap to show/hide when playing
            if viewModel.hasStarted {
                playingControlsOverlay
            } else {
                // Initial state: show play button
                initialPlayOverlay
            }
        }
    }

    // MARK: - Tap Handler

    private func handleTap() {
        if viewModel.hasStarted {
            // Show/hide controls on tap
            withAnimation(.easeInOut(duration: 0.2)) {
                showInlineControls.toggle()
            }
            if showInlineControls {
                scheduleHideControls()
            }
        } else {
            // Start playback on first tap
            mediaLogger.info("📹 [Inline] Starting inline playback")
            viewModel.togglePlayPause()
            showInlineControls = true
            scheduleHideControls()
        }
    }

    private func scheduleHideControls() {
        hideControlsTask?.cancel()
        hideControlsTask = Task {
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if !Task.isCancelled && viewModel.state == .playing && !isDraggingProgress {
                await MainActor.run {
                    withAnimation(.easeOut(duration: 0.3)) {
                        showInlineControls = false
                    }
                }
            }
        }
    }

    // MARK: - Initial Play Overlay (before playback starts)

    private var initialPlayOverlay: some View {
        ZStack {
            // Darken background slightly
            Color.black.opacity(0.2)

            // Large play button
            Image(systemName: "play.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(.white.opacity(0.9))
                .shadow(color: .black.opacity(0.5), radius: 4)

            // Duration badge at bottom right
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    durationBadge
                }
            }
        }
    }

    // MARK: - Playing Controls Overlay

    private var playingControlsOverlay: some View {
        ZStack {
            // Show controls when paused or showInlineControls is true
            if viewModel.state != .playing || showInlineControls {
                // Semi-transparent background
                Color.black.opacity(0.4)
                    .transition(.opacity)

                // Center controls: skip back, play/pause, skip forward
                HStack(spacing: 24) {
                    // Skip back 10s
                    Button {
                        viewModel.skip(by: -10)
                        scheduleHideControls()
                    } label: {
                        Image(systemName: "gobackward.10")
                            .font(.system(size: 20, weight: .medium))
                            .foregroundColor(.white)
                    }
                    .frame(width: 36, height: 36)

                    // Play/Pause
                    Button {
                        viewModel.togglePlayPause()
                        scheduleHideControls()
                    } label: {
                        Image(systemName: viewModel.state == .playing ? "pause.circle.fill" : "play.circle.fill")
                            .font(.system(size: 44))
                            .foregroundColor(.white)
                            .shadow(color: .black.opacity(0.5), radius: 4)
                    }

                    // Skip forward 10s
                    Button {
                        viewModel.skip(by: 10)
                        scheduleHideControls()
                    } label: {
                        Image(systemName: "goforward.10")
                            .font(.system(size: 20, weight: .medium))
                            .foregroundColor(.white)
                    }
                    .frame(width: 36, height: 36)
                }
                .transition(.scale.combined(with: .opacity))
            }

            // Bottom controls: progress bar, time and fullscreen button
            VStack {
                Spacer()

                VStack(spacing: 4) {
                    // Progress bar with fullscreen button
                    HStack(spacing: 8) {
                        // Interactive progress bar
                        inlineProgressBar
                            .frame(height: 30)

                        // Fullscreen button (right of progress bar)
                        if viewModel.state != .playing || showInlineControls {
                            Button {
                                onOpenFullscreen?()
                            } label: {
                                Image(systemName: "arrow.up.left.and.arrow.down.right")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(.white)
                                    .frame(width: 30, height: 30)
                                    .background(Circle().fill(Color.black.opacity(0.5)))
                            }
                            .transition(.opacity)
                        }
                    }
                    .padding(.horizontal, 10)

                    // Time display
                    HStack {
                        Text(formatTime(viewModel.currentTime))
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundColor(.white)

                        Spacer()

                        Text(formatTime(viewModel.duration > 0 ? viewModel.duration : (duration ?? 0)))
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundColor(.white)
                    }
                    .padding(.horizontal, 10)
                }
                .padding(.bottom, 6)
                .background(
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.6)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            }
        }
        .animation(.easeInOut(duration: 0.2), value: showInlineControls)
        .animation(.easeInOut(duration: 0.2), value: viewModel.state)
    }

    // MARK: - Interactive Progress Bar

    private var inlineProgressBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                // Background track - taller for easier manipulation
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color.white.opacity(0.3))
                    .frame(height: isDraggingProgress ? 8 : 6)

                // Buffered progress
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color.white.opacity(0.5))
                    .frame(width: max(0, geo.size.width * viewModel.bufferedPercentage), height: isDraggingProgress ? 8 : 6)

                // Current progress
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color.white)
                    .frame(width: max(0, geo.size.width * viewModel.progressPercentage), height: isDraggingProgress ? 8 : 6)

                // Thumb indicator - larger when dragging
                Circle()
                    .fill(Color.white)
                    .frame(width: isDraggingProgress ? 20 : 14, height: isDraggingProgress ? 20 : 14)
                    .shadow(color: .black.opacity(0.4), radius: 3)
                    .offset(x: max(0, min(geo.size.width - (isDraggingProgress ? 10 : 7), geo.size.width * viewModel.progressPercentage - (isDraggingProgress ? 10 : 7))))
                    .opacity(showInlineControls || viewModel.state != .playing || isDraggingProgress ? 1 : 0)
            }
            .frame(height: 30) // Larger hit area
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        withAnimation(.easeOut(duration: 0.1)) {
                            isDraggingProgress = true
                        }
                        let progress = max(0, min(1, value.location.x / geo.size.width))
                        let targetTime = progress * viewModel.duration
                        viewModel.seek(to: targetTime)
                    }
                    .onEnded { _ in
                        withAnimation(.easeOut(duration: 0.2)) {
                            isDraggingProgress = false
                        }
                        scheduleHideControls()
                    }
            )
            .animation(.easeOut(duration: 0.15), value: isDraggingProgress)
        }
    }

    /// Video aspect ratio - defaults to 16:9 if not determined from thumbnail
    private var videoAspectRatio: CGFloat {
        if let thumb = generatedThumbnail {
            return thumb.size.width / thumb.size.height
        }
        return 16.0 / 9.0  // Default landscape
    }

    // MARK: - Thumbnail View

    @ViewBuilder
    private var thumbnailView: some View {
        ZStack {
            Color.black

            if let thumbnailUrl = thumbnailUrl, !thumbnailUrl.isEmpty {
                CachedAsyncImage(urlString: thumbnailUrl, cacheType: .thumbnail) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    thumbnailPlaceholder
                }
            } else if let generated = generatedThumbnail {
                Image(uiImage: generated)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else if isLoadingThumbnail {
                ProgressView()
                    .tint(.white)
                    .scaleEffect(0.8)
            } else {
                Image(systemName: "video.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.white.opacity(0.5))
            }
        }
    }

    @ViewBuilder
    private var thumbnailPlaceholder: some View {
        if let generated = generatedThumbnail {
            Image(uiImage: generated)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            Color.black
        }
    }

    // MARK: - Error Overlay

    private func errorOverlay(message: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 20))
                .foregroundColor(.orange)
            Text("Erreur")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.white)

            Button {
                viewModel.retry()
            } label: {
                Text("Réessayer")
                    .font(.system(size: 9))
                    .foregroundColor(.blue)
            }
        }
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.black.opacity(0.7)))
    }

    // MARK: - Controls Overlay

    private var controlsOverlay: some View {
        ZStack {
            // Center play icon (static - just indicates it's a video)
            Image(systemName: "play.circle.fill")
                .font(.system(size: 50))
                .foregroundColor(.white.opacity(0.9))
                .shadow(color: .black.opacity(0.5), radius: 4)

            // Duration badge at bottom right
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    durationBadge
                }
            }
        }
    }

    @ViewBuilder
    private var durationBadge: some View {
        let displayDuration = duration ?? viewModel.duration
        if displayDuration > 0 {
            Text(formatTime(displayDuration))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill(Color.black.opacity(0.7)))
                .padding(8)
        }
    }

    // MARK: - Thumbnail Generation

    private func loadThumbnailIfNeeded() {
        guard thumbnailUrl == nil || thumbnailUrl?.isEmpty == true else { return }
        guard !isLoadingThumbnail, generatedThumbnail == nil else { return }

        isLoadingThumbnail = true
        mediaLogger.debug("📹 [Inline] Generating thumbnail...")

        Task {
            // FIX: Use stable cache key
            let cacheKey = "video_thumb_" + url.absoluteString.data(using: .utf8)!.base64EncodedString()

            if let cached = await ImageCacheManager.shared.getImage(for: cacheKey) {
                await MainActor.run {
                    self.generatedThumbnail = cached
                    self.isLoadingThumbnail = false
                }
                mediaLogger.debug("📹 [Inline] Thumbnail loaded from cache")
                return
            }

            do {
                // Generate thumbnail at ~10th frame (0.33s at 30fps) for better preview
                // Fall back to 0s if video is too short
                let thumbnailTime = CMTime(seconds: 0.33, preferredTimescale: 600)
                if let thumbnail = try await VideoCompressor.generateThumbnail(url, at: thumbnailTime) {
                    await ImageCacheManager.shared.cacheImage(thumbnail, for: cacheKey)
                    await MainActor.run {
                        self.generatedThumbnail = thumbnail
                        self.isLoadingThumbnail = false
                    }
                    mediaLogger.info("📹 [Inline] Thumbnail generated successfully at 0.33s")
                } else {
                    // Try at 0s as fallback
                    if let fallbackThumb = try await VideoCompressor.generateThumbnail(url, at: .zero) {
                        await ImageCacheManager.shared.cacheImage(fallbackThumb, for: cacheKey)
                        await MainActor.run {
                            self.generatedThumbnail = fallbackThumb
                            self.isLoadingThumbnail = false
                        }
                        mediaLogger.info("📹 [Inline] Thumbnail generated at 0s (fallback)")
                    } else {
                        await MainActor.run {
                            self.isLoadingThumbnail = false
                        }
                        mediaLogger.warn("📹 [Inline] Thumbnail generation returned nil")
                    }
                }
            } catch {
                mediaLogger.error("📹 [Inline] Thumbnail generation failed: \(error.localizedDescription)")
                await MainActor.run {
                    self.isLoadingThumbnail = false
                }
            }
        }
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        guard seconds.isFinite else { return "0:00" }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Inline Video Player ViewModel

@MainActor
final class InlineVideoPlayerViewModel: ObservableObject {
    // MARK: - Properties

    let url: URL
    private(set) var player: AVPlayer?
    private let mediaId: String

    @Published private(set) var state: VideoPlayerState = .idle
    @Published private(set) var hasStarted = false
    @Published private(set) var currentTime: Double = 0
    @Published private(set) var duration: Double = 0
    @Published private(set) var bufferedTime: Double = 0
    @Published private(set) var didReachEnd = false

    var progressPercentage: Double {
        guard duration > 0 else { return 0 }
        return currentTime / duration
    }

    var bufferedPercentage: Double {
        guard duration > 0 else { return 0 }
        return bufferedTime / duration
    }

    /// True when video is actively playing (not paused, not ended)
    var isCurrentlyPlaying: Bool {
        state == .playing && !didReachEnd
    }

    // MARK: - Observers

    private var timeObserver: Any?
    private var statusObserver: NSKeyValueObservation?
    private var bufferObserver: NSKeyValueObservation?
    private var bufferEmptyObserver: NSKeyValueObservation?
    private var bufferKeepUpObserver: NSKeyValueObservation?
    private var endPlaybackObserver: NSObjectProtocol?
    private var durationTask: Task<Void, Never>?

    // MARK: - Initialization

    init(url: URL) {
        self.url = url
        self.mediaId = "video_inline_" + url.absoluteString.hashValue.description
        mediaLogger.info("📹 [InlineVM] Init for: \(url.lastPathComponent)")
    }

    deinit {
        mediaLogger.info("📹 [InlineVM] Deinit")
    }

    // MARK: - Controls

    func togglePlayPause() {
        switch state {
        case .idle:
            setupAndPlay()
        case .ready, .paused:
            startPlayback()
        case .playing:
            pausePlayback()
        case .loading, .buffering:
            mediaLogger.debug("📹 [InlineVM] Toggle ignored during: \(self.state.description)")
        case .error:
            retry()
        }
    }

    func seek(to time: Double) {
        let clampedTime = max(0, min(time, duration))
        let cmTime = CMTime(seconds: clampedTime, preferredTimescale: 600)

        player?.seek(to: cmTime, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
            if finished {
                Task { @MainActor in
                    self?.currentTime = clampedTime
                    MediaPlaybackManager.shared.updatePlaybackTime(id: self?.mediaId ?? "", time: clampedTime)
                    mediaLogger.debug("📹 [InlineVM] Seeked to \(String(format: "%.1f", clampedTime))s")
                }
            }
        }
    }

    func skip(by seconds: Double) {
        let newTime = currentTime + seconds
        seek(to: newTime)
    }

    private func setupAndPlay() {
        hasStarted = true
        setupPlayer()
    }

    private func setupPlayer() {
        state = .loading
        mediaLogger.info("📹 [InlineVM] Setting up player...")

        // Configure audio session
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            try AVAudioSession.sharedInstance().setActive(true)
            mediaLogger.debug("📹 [InlineVM] Audio session configured")
        } catch {
            mediaLogger.error("📹 [InlineVM] Audio session error: \(error.localizedDescription)")
        }

        let asset = AVURLAsset(url: url)
        let playerItem = AVPlayerItem(asset: asset)
        player = AVPlayer(playerItem: playerItem)

        mediaLogger.info("📹 [InlineVM] Player created")

        // Register with MediaPlaybackManager
        MediaPlaybackManager.shared.register(id: mediaId) { [weak self] in
            Task { @MainActor in
                self?.stopPlayback()
            }
        }

        // Setup observers
        setupTimeObserver()
        setupStatusObserver(for: playerItem)
        setupBufferObservers(for: playerItem)
        setupEndPlaybackObserver(for: playerItem)
        loadDuration(from: asset)
    }

    private func setupTimeObserver() {
        let interval = CMTime(seconds: 0.2, preferredTimescale: 600)
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self else { return }
            self.currentTime = time.seconds
            MediaPlaybackManager.shared.updatePlaybackTime(id: self.mediaId, time: time.seconds)
        }
    }

    private func setupStatusObserver(for playerItem: AVPlayerItem) {
        statusObserver = playerItem.observe(\.status, options: [.new, .initial]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self = self else { return }

                mediaLogger.info("📹 [InlineVM] Status: \(item.status.rawValue)")

                switch item.status {
                case .readyToPlay:
                    if self.state == .loading {
                        self.state = .ready
                        // Auto-play since user already pressed play
                        self.startPlayback()
                    }

                case .failed:
                    let msg = item.error?.localizedDescription ?? "Erreur inconnue"
                    self.state = .error(msg)
                    mediaLogger.error("📹 [InlineVM] Failed: \(msg)")
                    if let error = item.error as NSError? {
                        mediaLogger.error("📹 [InlineVM] Error details - domain: \(error.domain), code: \(error.code)")
                    }

                case .unknown:
                    break

                @unknown default:
                    break
                }
            }
        }
    }

    private func setupBufferObservers(for playerItem: AVPlayerItem) {
        bufferObserver = playerItem.observe(\.loadedTimeRanges, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in
                if let range = item.loadedTimeRanges.first?.timeRangeValue {
                    self?.bufferedTime = CMTimeGetSeconds(range.start) + CMTimeGetSeconds(range.duration)
                }
            }
        }

        bufferEmptyObserver = playerItem.observe(\.isPlaybackBufferEmpty, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in
                if item.isPlaybackBufferEmpty && self?.state == .playing {
                    self?.state = .buffering
                    mediaLogger.debug("📹 [InlineVM] Buffering...")
                }
            }
        }

        bufferKeepUpObserver = playerItem.observe(\.isPlaybackLikelyToKeepUp, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in
                if item.isPlaybackLikelyToKeepUp && self?.state == .buffering {
                    self?.state = .playing
                    self?.player?.play()
                    mediaLogger.debug("📹 [InlineVM] Buffer ready, resuming")
                }
            }
        }
    }

    private func setupEndPlaybackObserver(for playerItem: AVPlayerItem) {
        endPlaybackObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                mediaLogger.info("📹 [InlineVM] Playback ended")
                self?.didReachEnd = true  // Mark as ended for size animation
                self?.stopPlayback()
                self?.player?.seek(to: .zero)
                self?.currentTime = 0
            }
        }
    }

    private func loadDuration(from asset: AVURLAsset) {
        durationTask = Task {
            do {
                let dur = try await asset.load(.duration)
                duration = dur.seconds.isFinite ? dur.seconds : 0
                mediaLogger.info("📹 [InlineVM] Duration: \(String(format: "%.1f", duration))s")
            } catch {
                mediaLogger.error("📹 [InlineVM] Duration error: \(error.localizedDescription)")
            }
        }
    }

    private func startPlayback() {
        guard MediaPlaybackManager.shared.requestPlay(id: mediaId, currentTime: currentTime) else {
            mediaLogger.warn("📹 [InlineVM] Playback denied by MediaPlaybackManager")
            return
        }

        didReachEnd = false  // Reset end flag when replaying
        player?.play()
        state = .playing
        mediaLogger.info("📹 [InlineVM] ▶️ Playing")
    }

    private func pausePlayback() {
        player?.pause()
        state = .paused
        MediaPlaybackManager.shared.notifyPause(id: mediaId, at: currentTime)
        mediaLogger.info("📹 [InlineVM] ⏸️ Paused")
    }

    private func stopPlayback() {
        player?.pause()
        if state == .playing || state == .buffering {
            state = .paused
        }
        MediaPlaybackManager.shared.notifyStop(id: mediaId)
    }

    func retry() {
        mediaLogger.info("📹 [InlineVM] Retrying...")
        cleanup()
        state = .idle
        hasStarted = true
        setupPlayer()
    }

    // MARK: - Cleanup

    func cleanup() {
        mediaLogger.info("📹 [InlineVM] Cleanup...")

        durationTask?.cancel()
        durationTask = nil

        stopPlayback()
        MediaPlaybackManager.shared.unregister(id: mediaId)

        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
        }

        statusObserver?.invalidate()
        statusObserver = nil

        bufferObserver?.invalidate()
        bufferObserver = nil

        bufferEmptyObserver?.invalidate()
        bufferEmptyObserver = nil

        bufferKeepUpObserver?.invalidate()
        bufferKeepUpObserver = nil

        // FIX: Remove NotificationCenter observer
        if let observer = endPlaybackObserver {
            NotificationCenter.default.removeObserver(observer)
            endPlaybackObserver = nil
        }

        player = nil

        // FIX: Restore audio session
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        mediaLogger.info("📹 [InlineVM] Cleanup complete")
    }
}

// MARK: - Video Player Layer (AVPlayerLayer wrapper)

struct VideoPlayerLayer: UIViewRepresentable {
    let player: AVPlayer?

    func makeUIView(context: Context) -> PlayerUIView {
        mediaLogger.debug("📹 [Layer] makeUIView, player: \(player != nil)")
        return PlayerUIView(player: player)
    }

    func updateUIView(_ uiView: PlayerUIView, context: Context) {
        if uiView.playerLayer.player !== player {
            mediaLogger.debug("📹 [Layer] updateUIView, player changed")
            uiView.playerLayer.player = player
        }
    }

    class PlayerUIView: UIView {
        var playerLayer: AVPlayerLayer

        init(player: AVPlayer?) {
            playerLayer = AVPlayerLayer(player: player)
            super.init(frame: .zero)
            playerLayer.videoGravity = .resizeAspectFill
            backgroundColor = .black
            layer.addSublayer(playerLayer)
        }

        required init?(coder: NSCoder) {
            fatalError("init(coder:) has not been implemented")
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            playerLayer.frame = bounds
        }
    }
}

// MARK: - Video Progress Bar (with buffering indicator)

struct VideoProgressBar: View {
    let progress: Double
    var bufferedProgress: Double = 0
    var onSeek: ((Double) -> Void)?

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                // Background track
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.white.opacity(0.2))
                    .frame(height: 8)

                // Buffered indicator
                if bufferedProgress > 0 {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.white.opacity(0.4))
                        .frame(width: max(0, geometry.size.width * bufferedProgress), height: 8)
                }

                // Progress fill
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.white)
                    .frame(width: max(0, geometry.size.width * progress), height: 8)

                // Percentage indicator
                if progress > 0.01 {
                    Text("\(Int(progress * 100))%")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(.black)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(
                            Capsule()
                                .fill(Color.white)
                                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        )
                }
            }
            .frame(height: geometry.size.height)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { value in
                        let newProgress = max(0, min(1, value.location.x / geometry.size.width))
                        onSeek?(newProgress)
                    }
            )
        }
    }
}

// MARK: - Video Share Sheet

struct VideoShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Preview

#Preview("Video Player") {
    VideoPlayerView(url: URL(string: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4")!)
}

#Preview("Inline Player") {
    InlineVideoPlayer(
        url: URL(string: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4")!,
        thumbnailUrl: nil,
        duration: 60
    )
    .padding()
}
