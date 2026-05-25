import AVFoundation
import AVKit
import Combine
import SwiftUI
import MeeshySDK

// MARK: - Shared AV Player Manager

@MainActor
public final class SharedAVPlayerManager: ObservableObject {
    public static let shared = SharedAVPlayerManager()

    @Published public var player: AVPlayer?
    @Published public var isPlaying = false
    @Published public var currentTime: Double = 0
    @Published public var duration: Double = 0
    @Published public var playbackSpeed: PlaybackSpeed = .x1_0
    @Published public var activeURL: String = ""
    @Published public var isPipActive = false

    public var attachmentId: String?

    private var timeObserver: Any?
    private var cancellables = Set<AnyCancellable>()
    private var pipController: AVPictureInPictureController?
    private var pipDelegate: PipDelegate?
    private var watchStartTime: Date?

    private init() {}

    // MARK: - Load

    public func load(urlString: String) {
        guard !urlString.isEmpty else { return }
        guard urlString != activeURL else { return }

        cleanup()

        guard let url = MeeshyConfig.resolveMediaURL(urlString) else { return }
        let resolved = url.absoluteString

        // Audio session for playback (unified .default mode across all components)
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)

        activeURL = urlString

        // 1. Check prerolled player cache (instant playback — already buffered)
        if let cached = StoryMediaLoader.shared.cachedPlayer(for: url) {
            player = cached
            setupObservers(for: cached)
            return
        }

        // 2. Check video disk cache (play from local file — no network)
        let localURL = CacheCoordinator.videoLocalFileURL(for: resolved)
        if let localURL {
            let newPlayer = AVPlayer(url: localURL)
            player = newPlayer
            setupObservers(for: newPlayer)
            return
        }

        // 3. Streaming fallback removed (spec §4.10).
        // Callers MUST gate on `availability == .ready` before calling
        // `.load(urlString:)`. Reaching this branch means the caller didn't
        // gate — log defensively and leave `player` nil so the surrounding
        // UI (VideoMediaView / InlineVideoPlayerView / VideoFullscreenPlayerView)
        // shows the download overlay instead of a silent network stream.
        // Stories don't pass through this manager (their pipeline is
        // StoryReaderPrefetcher + StoryMediaLoader), so removing the
        // fallback only affects conversation/feed video.
    }

    // MARK: - Playback Controls

    public func play() {
        guard let player else { return }
        PlaybackCoordinator.shared.willStartPlaying(video: self)
        player.play()
        player.rate = Float(playbackSpeed.rawValue)
        isPlaying = true
        if watchStartTime == nil { watchStartTime = Date() }
    }

    public func pause() {
        reportWatchProgress(complete: false)
        player?.pause()
        isPlaying = false
    }

    public func togglePlayPause() {
        if isPlaying { pause() } else { play() }
    }

    public func seek(to seconds: Double) {
        let time = CMTime(seconds: seconds, preferredTimescale: 600)
        player?.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
    }

    public func skip(seconds: Double) {
        let target = min(max(currentTime + seconds, 0), duration)
        seek(to: target)
    }

    public func setSpeed(_ speed: PlaybackSpeed) {
        playbackSpeed = speed
        if isPlaying {
            player?.rate = Float(speed.rawValue)
        }
    }

    public func cycleSpeed() {
        setSpeed(playbackSpeed.next())
    }

    public func stop() {
        stopPip()
        cleanup()
        activeURL = ""
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Libère le player POUR cette URL si elle est encore active. No-op si
    /// une autre URL a pris la main entre temps (safe race protection : par
    /// ex. l'utilisateur scrolle vite et une nouvelle bulle a déjà appelé
    /// `load`).
    ///
    /// Utilisé par `_InlineRenderer.teardown()` sur `.onDisappear` pour
    /// libérer le surface au scroll out → la bulle retombe sur le thumbnail
    /// au scroll back. Distinct de `pause()` : ce dernier conserve le
    /// player + activeURL, donc surface remounté sur frame figée.
    public func release(urlString: String) {
        guard activeURL == urlString else { return }
        stop()
    }

    // MARK: - Picture-in-Picture

    /// Attach PIP to a given AVPlayerLayer. Call this from the UIViewRepresentable that hosts the player.
    public func configurePip(playerLayer: AVPlayerLayer) {
        guard AVPictureInPictureController.isPictureInPictureSupported() else { return }
        guard pipController?.playerLayer !== playerLayer else { return }
        pipController?.invalidatePlaybackState()
        let controller = AVPictureInPictureController(playerLayer: playerLayer)
        controller?.canStartPictureInPictureAutomaticallyFromInline = true
        let delegate = PipDelegate { [weak self] in
            Task { @MainActor [weak self] in self?.isPipActive = true }
        } onStop: { [weak self] in
            Task { @MainActor [weak self] in self?.isPipActive = false }
        } onRestore: { [weak self] completion in
            Task { @MainActor [weak self] in
                _ = self // The player is already shared — nothing to restore
                completion(true)
            }
        }
        controller?.delegate = delegate
        self.pipController = controller
        self.pipDelegate = delegate
    }

    public func startPip() {
        guard let pipController, pipController.isPictureInPicturePossible else { return }
        pipController.startPictureInPicture()
    }

    public func stopPip() {
        pipController?.stopPictureInPicture()
        isPipActive = false
    }

    // MARK: - Watch Progress Reporting

    private func reportWatchProgress(complete: Bool) {
        guard let attId = attachmentId else { return }
        guard let start = watchStartTime else { return }
        let watchedSeconds = Date().timeIntervalSince(start)
        guard complete || watchedSeconds >= 3 else { return }
        let positionMs = Int(currentTime * 1000)
        let totalDurationMs = Int(duration * 1000)

        Task {
            let body = AttachmentStatusBody(
                action: "watched",
                playPositionMs: positionMs,
                durationMs: totalDurationMs,
                complete: complete
            )
            let _: APIResponse<[String: String]>? = try? await APIClient.shared.post(
                endpoint: "/attachments/\(attId)/status",
                body: body
            )
        }
    }

    // MARK: - Observers

    private func setupObservers(for player: AVPlayer) {
        let interval = CMTime(seconds: 0.1, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor [weak self] in
                self?.currentTime = time.seconds.isNaN ? 0 : time.seconds
            }
        }

        player.publisher(for: \.rate)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] rate in
                guard let self else { return }
                self.isPlaying = rate > 0
            }
            .store(in: &cancellables)

        player.publisher(for: \.currentItem)
            .compactMap { $0 }
            .flatMap { $0.publisher(for: \.duration) }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] cmDuration in
                guard let self else { return }
                let seconds = cmDuration.seconds
                self.duration = seconds.isNaN || seconds.isInfinite ? 0 : seconds
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: AVPlayerItem.didPlayToEndTimeNotification, object: player.currentItem)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                self.reportWatchProgress(complete: true)
                self.watchStartTime = nil
                self.isPlaying = false
                self.seek(to: 0)
                // Clear `activeURL` + tear down player + release `AVAudioSession`.
                // Sans ce stop, `isThisActive` reste `true` dans `_InlineRenderer`,
                // la surface reste mountée sur la dernière frame de la vidéo et
                // l'utilisateur ne revient jamais au thumbnail + play badge.
                // Le re-tap relancera `load(urlString:)` qui hit le cache disk
                // (lecture instantanée — pas de re-download).
                self.stop()
            }
            .store(in: &cancellables)
    }

    // MARK: - Cleanup

    private func cleanup() {
        if let observer = timeObserver, let player {
            player.removeTimeObserver(observer)
        }
        timeObserver = nil
        cancellables.removeAll()
        player?.pause()
        player = nil
        isPlaying = false
        currentTime = 0
        duration = 0
        playbackSpeed = .x1_0
        watchStartTime = nil
        attachmentId = nil
        pipController = nil
        pipDelegate = nil
    }
}

// MARK: - PIP Delegate

private final class PipDelegate: NSObject, AVPictureInPictureControllerDelegate {
    let onStart: () -> Void
    let onStop: () -> Void
    let onRestore: (@escaping (Bool) -> Void) -> Void

    init(onStart: @escaping () -> Void, onStop: @escaping () -> Void, onRestore: @escaping (@escaping (Bool) -> Void) -> Void) {
        self.onStart = onStart
        self.onStop = onStop
        self.onRestore = onRestore
    }

    func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
        onStart()
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        onStop()
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                     restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completion: @escaping (Bool) -> Void) {
        onRestore(completion)
    }
}
