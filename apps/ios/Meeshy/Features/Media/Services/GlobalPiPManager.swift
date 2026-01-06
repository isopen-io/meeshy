//
//  GlobalPiPManager.swift
//  Meeshy
//
//  Global manager for Picture-in-Picture playback that persists across navigation.
//  Maintains video playback even when leaving conversations.
//  Only stops when another video/audio starts playing or user explicitly closes.
//

import Foundation
import AVFoundation
import AVKit
import Combine
import UIKit

// Uses global mediaLogger from LoggerGlobal.swift

// MARK: - Global PiP Manager

@MainActor
final class GlobalPiPManager: NSObject, ObservableObject {

    // MARK: - Singleton

    static let shared = GlobalPiPManager()

    // MARK: - Published Properties

    @Published private(set) var isActive: Bool = false
    @Published private(set) var isPiPMode: Bool = false
    @Published private(set) var currentURL: URL?
    @Published private(set) var currentTime: Double = 0
    @Published private(set) var duration: Double = 0
    @Published private(set) var isPlaying: Bool = false

    /// Conversation ID associated with the current video (for navigation restoration)
    @Published private(set) var sourceConversationId: String?

    /// Message ID associated with the current video (for scroll-to-message)
    @Published private(set) var sourceMessageId: String?

    // MARK: - Player Components

    private(set) var player: AVPlayer?
    private var playerLayer: AVPlayerLayer?
    private var pipController: AVPictureInPictureController?
    private var pipContainerView: PiPContainerView?

    // MARK: - Observers

    private var timeObserver: Any?
    private var statusObserver: NSKeyValueObservation?
    private var endPlaybackObserver: NSObjectProtocol?
    private var rateObserver: NSKeyValueObservation?

    // MARK: - Media ID for MediaPlaybackManager

    private var mediaId: String = ""

    // MARK: - State flags

    private var isTransferringFromView: Bool = false
    private var shouldRestoreUI: Bool = false

    // MARK: - Restoration callback

    /// Callback invoked when user taps on PiP to restore UI
    /// Returns (conversationId, messageId, currentTime)
    var onRestoreUIRequest: ((_ conversationId: String?, _ messageId: String?, _ currentTime: Double) -> Void)?

    // MARK: - Initialization

    private override init() {
        super.init()
        mediaLogger.info("🎬 [GlobalPiP] Manager initialized")

        // Listen for app lifecycle events
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppWillResignActive),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - App Lifecycle

    @objc private func handleAppWillResignActive() {
        // Auto-start PiP when app goes to background if video is playing
        if isActive && isPlaying && !isPiPMode {
            mediaLogger.info("🎬 [GlobalPiP] App going to background, starting PiP")
            startPiP()
        }
    }

    @objc private func handleAppDidBecomeActive() {
        // App came back - PiP might have been dismissed
        mediaLogger.info("🎬 [GlobalPiP] App became active, isPiPMode=\(isPiPMode), isActive=\(isActive)")
    }

    // MARK: - Public API

    /// Check if manager has an active video that can be displayed
    var hasActiveVideo: Bool {
        return isActive && player != nil && currentURL != nil
    }

    /// Transfer playback to this global manager (from VideoPlayerView)
    /// Used when user swipes down to enter PiP
    /// - Parameters:
    ///   - existingPlayer: The AVPlayer instance to take over
    ///   - url: Video URL
    ///   - currentTime: Current playback position
    ///   - conversationId: Optional conversation ID for navigation restoration
    ///   - messageId: Optional message ID for scroll-to-message
    func takeOverPlayback(
        from existingPlayer: AVPlayer,
        url: URL,
        currentTime: Double,
        conversationId: String? = nil,
        messageId: String? = nil
    ) {
        mediaLogger.info("🎬 [GlobalPiP] Taking over playback from view at \(String(format: "%.1f", currentTime))s, conversation: \(conversationId ?? "nil")")

        isTransferringFromView = true

        // Cleanup any existing state first (but don't stop the player we're taking over)
        cleanupObserversOnly()

        // Take ownership of the player
        self.player = existingPlayer
        self.currentURL = url
        self.currentTime = currentTime
        self.sourceConversationId = conversationId
        self.sourceMessageId = messageId
        self.mediaId = "global_pip_\(url.absoluteString.hashValue)"

        // Get duration from player item
        if let item = existingPlayer.currentItem {
            let dur = item.duration.seconds
            self.duration = dur.isFinite ? dur : 0
        }

        // Configure audio session for background playback
        configureAudioSession()

        // Setup PiP infrastructure
        setupPiPInfrastructure()

        // Setup observers for this player
        setupTimeObserver()
        setupRateObserver()
        if let item = existingPlayer.currentItem {
            setupEndPlaybackObserver(for: item)
        }

        // Register with MediaPlaybackManager
        MediaPlaybackManager.shared.register(id: mediaId) { [weak self] in
            Task { @MainActor in
                mediaLogger.info("🎬 [GlobalPiP] Stop callback from MediaPlaybackManager")
                self?.stop()
            }
        }

        // Request play permission
        _ = MediaPlaybackManager.shared.requestPlay(id: mediaId, currentTime: currentTime)

        isActive = true
        isPlaying = existingPlayer.rate > 0
        isTransferringFromView = false

        // Start PiP after a brief delay to ensure infrastructure is ready
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            self?.startPiP()
        }
    }

    /// Start playing a video URL globally (persists across navigation)
    func playVideo(url: URL, startTime: Double = 0, autoPlay: Bool = true) {
        mediaLogger.info("🎬 [GlobalPiP] Play video: \(url.lastPathComponent) at \(String(format: "%.1f", startTime))s")

        // If same URL and player exists, just seek
        if currentURL == url && player != nil {
            seek(to: startTime)
            if autoPlay && !isPlaying {
                play()
            }
            return
        }

        // Full cleanup for new video
        cleanup()

        // Setup new player
        currentURL = url
        mediaId = "global_pip_\(url.absoluteString.hashValue)"

        configureAudioSession()

        let asset = AVURLAsset(url: url)
        let playerItem = AVPlayerItem(asset: asset)
        player = AVPlayer(playerItem: playerItem)

        setupPiPInfrastructure()
        setupAllObservers(for: playerItem, asset: asset)

        // Register with MediaPlaybackManager
        MediaPlaybackManager.shared.register(id: mediaId) { [weak self] in
            Task { @MainActor in
                self?.stop()
            }
        }

        if startTime > 0 {
            seek(to: startTime)
        }

        if autoPlay {
            play()
        }

        isActive = true
    }

    /// Play/resume playback
    func play() {
        guard let player = player else { return }

        guard MediaPlaybackManager.shared.requestPlay(id: mediaId, currentTime: currentTime) else {
            mediaLogger.warn("🎬 [GlobalPiP] Play denied by MediaPlaybackManager")
            return
        }

        player.play()
        isPlaying = true
        mediaLogger.info("🎬 [GlobalPiP] ▶️ Playing")
    }

    /// Pause playback
    func pause() {
        player?.pause()
        isPlaying = false
        MediaPlaybackManager.shared.notifyPause(id: mediaId, at: currentTime)
        mediaLogger.info("🎬 [GlobalPiP] ⏸️ Paused at \(String(format: "%.1f", currentTime))s")
    }

    /// Toggle play/pause
    func togglePlayPause() {
        if isPlaying {
            pause()
        } else {
            play()
        }
    }

    /// Stop playback and cleanup completely
    func stop() {
        mediaLogger.info("🎬 [GlobalPiP] ⏹️ Stopping")

        // Stop PiP first if active
        if isPiPMode {
            pipController?.stopPictureInPicture()
        }

        cleanup()
    }

    /// Seek to specific time
    func seek(to time: Double) {
        guard let player = player else { return }

        let clampedTime = max(0, min(time, duration > 0 ? duration : .infinity))
        let cmTime = CMTime(seconds: clampedTime, preferredTimescale: 600)

        player.seek(to: cmTime, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
            if finished {
                Task { @MainActor in
                    self?.currentTime = clampedTime
                    MediaPlaybackManager.shared.updatePlaybackTime(id: self?.mediaId ?? "", time: clampedTime)
                }
            }
        }
    }

    /// Skip forward/backward by seconds
    func skip(by seconds: Double) {
        seek(to: currentTime + seconds)
    }

    /// Start Picture-in-Picture mode
    func startPiP() {
        guard let pipController = pipController else {
            mediaLogger.warn("🎬 [GlobalPiP] No PiP controller available")
            return
        }

        guard pipController.isPictureInPicturePossible else {
            mediaLogger.warn("🎬 [GlobalPiP] PiP not possible - isPictureInPicturePossible=false")
            return
        }

        pipController.startPictureInPicture()
        mediaLogger.info("🎬 [GlobalPiP] Starting PiP")
    }

    /// Stop Picture-in-Picture mode (but keep playing)
    func stopPiP() {
        pipController?.stopPictureInPicture()
    }

    // MARK: - Private Setup

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback, options: [.allowAirPlay])
            try session.setActive(true)
            mediaLogger.debug("🎬 [GlobalPiP] Audio session configured for playback")
        } catch {
            mediaLogger.error("🎬 [GlobalPiP] Audio session error: \(error.localizedDescription)")
        }
    }

    private func setupPiPInfrastructure() {
        guard let player = player else { return }

        // Remove old infrastructure
        pipController = nil
        playerLayer?.removeFromSuperlayer()
        playerLayer = nil

        // Create new player layer
        let layer = AVPlayerLayer(player: player)
        layer.videoGravity = .resizeAspect
        layer.frame = CGRect(x: 0, y: 0, width: 320, height: 180) // 16:9 aspect
        self.playerLayer = layer

        // Ensure container view exists in window hierarchy
        if pipContainerView == nil {
            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let window = windowScene.windows.first {
                let container = PiPContainerView(frame: CGRect(x: -1000, y: -1000, width: 320, height: 180))
                container.backgroundColor = .black
                container.isUserInteractionEnabled = false
                window.addSubview(container)
                self.pipContainerView = container
                mediaLogger.debug("🎬 [GlobalPiP] Created PiP container view")
            }
        }

        // Add layer to container
        pipContainerView?.layer.sublayers?.forEach { $0.removeFromSuperlayer() }
        pipContainerView?.layer.addSublayer(layer)

        // Create PiP controller
        guard AVPictureInPictureController.isPictureInPictureSupported() else {
            mediaLogger.warn("🎬 [GlobalPiP] PiP not supported on this device")
            return
        }

        let controller = AVPictureInPictureController(playerLayer: layer)
        controller?.delegate = self
        controller?.canStartPictureInPictureAutomaticallyFromInline = true
        self.pipController = controller

        mediaLogger.info("🎬 [GlobalPiP] PiP infrastructure ready, controller created")
    }

    private func setupAllObservers(for playerItem: AVPlayerItem, asset: AVURLAsset) {
        setupTimeObserver()
        setupStatusObserver(for: playerItem)
        setupEndPlaybackObserver(for: playerItem)
        setupRateObserver()
        loadDuration(from: asset)
    }

    private func setupTimeObserver() {
        guard let player = player else { return }

        // Remove existing
        if let observer = timeObserver {
            player.removeTimeObserver(observer)
            timeObserver = nil
        }

        let interval = CMTime(seconds: 0.25, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self else { return }
            let seconds = time.seconds
            if seconds.isFinite {
                self.currentTime = seconds
                MediaPlaybackManager.shared.updatePlaybackTime(id: self.mediaId, time: seconds)
            }
        }
    }

    private func setupStatusObserver(for playerItem: AVPlayerItem) {
        statusObserver?.invalidate()
        statusObserver = playerItem.observe(\.status, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self = self else { return }

                switch item.status {
                case .readyToPlay:
                    mediaLogger.info("🎬 [GlobalPiP] Player ready to play")
                case .failed:
                    let error = item.error?.localizedDescription ?? "Unknown error"
                    mediaLogger.error("🎬 [GlobalPiP] Player failed: \(error)")
                default:
                    break
                }
            }
        }
    }

    private func setupEndPlaybackObserver(for playerItem: AVPlayerItem) {
        if let observer = endPlaybackObserver {
            NotificationCenter.default.removeObserver(observer)
        }

        endPlaybackObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self = self else { return }
                mediaLogger.info("🎬 [GlobalPiP] Playback ended")
                self.isPlaying = false
                // Reset to beginning but don't cleanup - allow replay
                self.seek(to: 0)
            }
        }
    }

    private func setupRateObserver() {
        rateObserver?.invalidate()
        guard let player = player else { return }

        rateObserver = player.observe(\.rate, options: [.new]) { [weak self] player, _ in
            Task { @MainActor in
                self?.isPlaying = player.rate > 0
            }
        }
    }

    private func loadDuration(from asset: AVURLAsset) {
        Task {
            do {
                let dur = try await asset.load(.duration)
                let seconds = dur.seconds
                if seconds.isFinite {
                    self.duration = seconds
                    mediaLogger.info("🎬 [GlobalPiP] Duration loaded: \(String(format: "%.1f", seconds))s")
                }
            } catch {
                mediaLogger.error("🎬 [GlobalPiP] Duration load error: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Cleanup

    private func cleanupObserversOnly() {
        if let observer = timeObserver, let player = player {
            player.removeTimeObserver(observer)
        }
        timeObserver = nil

        statusObserver?.invalidate()
        statusObserver = nil

        rateObserver?.invalidate()
        rateObserver = nil

        if let observer = endPlaybackObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        endPlaybackObserver = nil
    }

    private func cleanup() {
        mediaLogger.info("🎬 [GlobalPiP] Full cleanup...")

        // Stop playback
        player?.pause()
        isPlaying = false

        // Remove observers
        cleanupObserversOnly()

        // Unregister from MediaPlaybackManager
        if !mediaId.isEmpty {
            MediaPlaybackManager.shared.unregister(id: mediaId)
            MediaPlaybackManager.shared.notifyStop(id: mediaId)
        }

        // Cleanup PiP controller
        pipController = nil

        // Cleanup layer
        playerLayer?.removeFromSuperlayer()
        playerLayer = nil

        // Don't remove container view - reuse it
        // pipContainerView stays in hierarchy for next use

        // Clear player
        player = nil

        // Reset state
        currentURL = nil
        currentTime = 0
        duration = 0
        isActive = false
        isPiPMode = false
        mediaId = ""
        sourceConversationId = nil
        sourceMessageId = nil

        // Deactivate audio session
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            mediaLogger.warn("🎬 [GlobalPiP] Audio session deactivation: \(error.localizedDescription)")
        }

        mediaLogger.info("🎬 [GlobalPiP] Cleanup complete")
    }
}

// MARK: - PiP Container View (stays in view hierarchy)

private class PiPContainerView: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        self.clipsToBounds = true
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

// MARK: - AVPictureInPictureControllerDelegate

extension GlobalPiPManager: AVPictureInPictureControllerDelegate {

    nonisolated func pictureInPictureControllerWillStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        Task { @MainActor in
            mediaLogger.info("🎬 [GlobalPiP] PiP will start")
        }
    }

    nonisolated func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        Task { @MainActor in
            self.isPiPMode = true
            mediaLogger.info("🎬 [GlobalPiP] PiP did start successfully")
        }
    }

    nonisolated func pictureInPictureControllerWillStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        Task { @MainActor in
            mediaLogger.info("🎬 [GlobalPiP] PiP will stop")
        }
    }

    nonisolated func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        Task { @MainActor in
            self.isPiPMode = false
            mediaLogger.info("🎬 [GlobalPiP] PiP did stop")

            // When PiP stops and we don't have a restore request, stop playback
            // This handles the case where user dismisses PiP window
            if !self.shouldRestoreUI {
                mediaLogger.info("🎬 [GlobalPiP] No restore requested, stopping playback")
                self.stop()
            }
            self.shouldRestoreUI = false
        }
    }

    nonisolated func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error) {
        Task { @MainActor in
            mediaLogger.error("🎬 [GlobalPiP] PiP failed to start: \(error.localizedDescription)")
            // Don't cleanup on failure - let user try again or continue inline
        }
    }

    nonisolated func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void) {
        Task { @MainActor in
            mediaLogger.info("🎬 [GlobalPiP] Restore UI requested - user tapped to expand")
            self.shouldRestoreUI = true

            // User tapped on PiP to restore - keep playing, don't cleanup
            // The video will continue playing; UI can observe isActive to show player

            // Invoke the restoration callback if set
            self.onRestoreUIRequest?(
                self.sourceConversationId,
                self.sourceMessageId,
                self.currentTime
            )

            // Post notification for views to respond (legacy support)
            NotificationCenter.default.post(name: .globalPiPRestoreUI, object: nil, userInfo: [
                "url": self.currentURL as Any,
                "currentTime": self.currentTime,
                "conversationId": self.sourceConversationId as Any,
                "messageId": self.sourceMessageId as Any
            ])
        }
        // Call completion immediately
        completionHandler(true)
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let globalPiPRestoreUI = Notification.Name("GlobalPiPRestoreUI")
}
