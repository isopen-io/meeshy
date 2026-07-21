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

    /// Mute global du player (préservé entre vidéos dans la session).
    /// Toggle via le bouton mute du fullscreen overlay. Propagé à
    /// `AVPlayer.isMuted` automatiquement via `didSet`.
    @Published public var isMuted: Bool = false {
        didSet { applyMuteState() }
    }

    /// Intention de mute PAR SURFACE, orthogonale à `isMuted` (la préférence
    /// utilisateur globale posée par le bouton mute du fullscreen overlay).
    /// Avant ce champ, le feed posait directement `isMuted = true` pour son
    /// autoplay silencieux — ce qui fuitait vers la surface suivante (galerie
    /// de conversation jouant en silence alors que l'utilisateur n'avait rien
    /// demandé). Transitoire : reset par `cleanup()`, ne traverse pas un
    /// changement d'attachment ni de surface (contrairement à `isMuted`).
    @Published public var isForceMuted: Bool = false {
        didSet { applyMuteState() }
    }

    /// Mute effectivement appliqué au player courant : préférence utilisateur
    /// (`isMuted`) OU intention ponctuelle d'une surface (`isForceMuted`).
    public var effectiveMuted: Bool { isMuted || isForceMuted }

    private func applyMuteState() {
        player?.isMuted = effectiveMuted
    }

    /// Si vrai, le notification handler de fin de lecture seek(0) + play()
    /// au lieu de stop(). Reset à `false` par `cleanup()` → ne traverse pas
    /// un changement de vidéo. Toggle exclusif via le fullscreen overlay
    /// (inline n'expose pas `.loop` dans son ControlSet).
    @Published public var shouldLoop: Bool = false

    public var attachmentId: String?

    /// Heartbeat seam pour la capture d'engagement (LOT 2). Émet un
    /// `WatchSample` (position + offset monotone depuis le début de lecture)
    /// sur play / tick ~10s / pause / fin. Découplé de `reportWatchProgress`
    /// (qui reste sur `/attachments/:id/status`, plan séparé).
    public let watchSamples = PassthroughSubject<WatchSample, Never>()
    private var watchClockStart: Date?
    /// Heartbeat samples accumulated for the CURRENT watch session, consumed by the
    /// engagement layer via `drainWatchSamples()`. The `watchSamples` publisher
    /// stays for any live subscriber; this buffer is what surfaces actually read.
    private var sessionWatchSamples: [WatchSample] = []
    /// `true` once playback reached the media end at least once this session
    /// (drives the engagement `completed` flag → server `playCount`).
    private var sessionReachedEnd = false

    private var timeObserver: Any?
    private var cancellables = Set<AnyCancellable>()
    private var pipController: AVPictureInPictureController?
    private var pipDelegate: PipDelegate?
    private var watchStartTime: Date?
    /// Last `currentTime` (s) at which an engagement heartbeat fired. Instance-scoped
    /// (was a `var` captured inside the time-observer closure) so the observer block
    /// can stay a plain `MainActor.assumeIsolated` call — no `Task` hop per tick.
    private var lastHeartbeat: Double = 0

    private init() {}

    // MARK: - Load

    public func load(urlString: String, attachmentId: String? = nil) {
        guard !urlString.isEmpty else { return }
        guard urlString != activeURL else { return }

        cleanup()
        // Posé APRÈS `cleanup()` (qui le remet à `nil`) : tous les appelants
        // posaient auparavant `manager.attachmentId` AVANT `load()`, donc
        // `cleanup()` l'effaçait silencieusement à chaque chargement et
        // `reportWatchProgress` ne déclenchait jamais (tracking de consommation
        // mort depuis l'origine — aucun POST watched, aucune barre de progression).
        self.attachmentId = attachmentId

        guard let url = MeeshyConfig.resolveMediaURL(urlString) else { return }
        let resolved = url.absoluteString

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

    /// Pure, testable decision: should starting playback (re)activate the
    /// `.duckOthers` audio session? A surface that intends to be silent (feed
    /// autoplay) has no audible output — activating the ducking session for it
    /// would needlessly duck the user's own music for a video that produces no
    /// sound. `nonisolated static` mirrors `MediaSessionCoordinator
    /// .shouldManageSession(callActive:)`.
    public nonisolated static func shouldDuckOthersOnPlay(effectiveMuted: Bool) -> Bool {
        !effectiveMuted
    }

    public func play() {
        guard let player else { return }
        PlaybackCoordinator.shared.willStartPlaying(video: self)
        // Session de lecture via la source UNIQUE (call-aware) : ne reconfigure
        // pas la session pendant un appel VoIP — la vidéo joue alors sous la
        // session de l'appel (micro préservé). Cf.
        // MediaSessionCoordinator.activatePlaybackSync. Gated on `effectiveMuted`
        // (moved out of `load()`, where it fired unconditionally BEFORE a caller
        // had any chance to express its mute intent — the feed's silent autoplay
        // ducked the user's music indefinitely for a video producing no sound).
        if Self.shouldDuckOthersOnPlay(effectiveMuted: effectiveMuted) {
            MediaSessionCoordinator.shared.activatePlaybackSync(options: [.duckOthers])
        }
        player.play()
        player.rate = Float(playbackSpeed.rawValue)
        isPlaying = true
        if watchStartTime == nil { watchStartTime = Date() }
        if watchClockStart == nil { watchClockStart = Date() }
        emitWatchSample()
    }

    public func pause() {
        emitWatchSample()
        reportWatchProgress(complete: false)
        player?.pause()
        isPlaying = false
    }

    // MARK: - Engagement watch sample seam

    /// Test seam — émet directement un `WatchSample` sur le publisher.
    public func emitWatchSampleForTesting(positionMs: Int, atMs: Int) {
        watchSamples.send(WatchSample(positionMs: positionMs, atMs: atMs))
    }

    /// Drains the heartbeat samples accumulated for the current watch session and
    /// whether playback reached the end, then resets. Called by a surface when it
    /// finalizes an engagement session (reel switch / story advance / disappear).
    public func drainWatchSamples() -> (samples: [WatchSample], reachedEnd: Bool) {
        let drained = (samples: sessionWatchSamples, reachedEnd: sessionReachedEnd)
        sessionWatchSamples.removeAll()
        sessionReachedEnd = false
        return drained
    }

    /// Émet un sample à partir de l'horloge monotone de lecture
    /// (`watchClockStart`). No-op tant que la lecture n'a pas démarré.
    private func emitWatchSample(complete: Bool = false) {
        guard let start = watchClockStart else { return }
        let atMs = Int(Date().timeIntervalSince(start) * 1000)
        let posMs = currentTime.isNaN ? 0 : Int(currentTime * 1000)
        let sample = WatchSample(positionMs: max(0, posMs), atMs: max(0, atMs))
        watchSamples.send(sample)
        sessionWatchSamples.append(sample)
        if complete { sessionReachedEnd = true }
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
        // Désactivation via la source unique (call-aware) : ne coupe rien pendant
        // un appel — la session appartient alors à l'appel (RTCAudioSession).
        MediaSessionCoordinator.shared.deactivatePlaybackSync()
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

        // Persist the at-rest watch fraction (monotonic, kept after completion)
        // so the bubble thumbnail can show a discreet progress bar at a glance.
        if complete {
            MediaConsumptionStore.shared.record(fraction: 1, complete: true, for: attId)
        } else if duration > 0 {
            MediaConsumptionStore.shared.record(fraction: currentTime / duration, complete: false, for: attId)
        }

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
        // Sync immédiat de l'état de mute effectif sur le nouveau player. Sans
        // ça, un user qui mute en fullscreen puis ouvre une nouvelle vidéo
        // entend le son revenir alors que l'icône mute reste activée.
        player.isMuted = effectiveMuted

        // The active reel is on-screen: lift the offscreen preroll bitrate cap so
        // ABR can pick the best rendition (thermal-aware — stays capped when hot).
        player.currentItem?.preferredPeakBitRate = MediaThermalPolicy.preferredPeakBitRate(
            isVisible: true, thermalState: ProcessInfo.processInfo.thermalState)

        // Cadence backs off as the device heats up (SOTA, WWDC19 #422). The block
        // runs via `MainActor.assumeIsolated` — NOT a `Task { @MainActor }` per tick:
        // `queue: .main` already runs on the MainActor executor, so the old wrapper
        // scheduled a needless continuation 5-10×/s. Mirrors the proven pattern in
        // `StoryTimelineEngine`. `lastHeartbeat` is an instance property so the
        // closure captures nothing mutable.
        let interval = CMTime(
            seconds: MediaThermalPolicy.timeObserverInterval(thermalState: ProcessInfo.processInfo.thermalState),
            preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            MainActor.assumeIsolated {
                guard let self else { return }
                let seconds = time.seconds.isNaN ? 0 : time.seconds
                self.currentTime = seconds
                if self.isPlaying, seconds - self.lastHeartbeat >= 10 {
                    self.lastHeartbeat = seconds
                    self.emitWatchSample()
                }
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
                self.emitWatchSample(complete: true)
                self.watchClockStart = self.shouldLoop ? Date() : nil
                if self.shouldLoop {
                    // Loop fullscreen : seek + replay, on garde le player +
                    // activeURL + audio session. Reset watchStartTime pour que
                    // la prochaine fin de cycle puisse encore report progress.
                    self.seek(to: 0)
                    self.play()
                    self.watchStartTime = Date()
                } else {
                    // Comportement par défaut : tear-down complet → bubble
                    // re-render sur thumbnail (cf. commentaire historique).
                    self.watchStartTime = nil
                    self.isPlaying = false
                    self.seek(to: 0)
                    self.stop()
                }
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
        watchClockStart = nil
        lastHeartbeat = 0
        attachmentId = nil
        pipController = nil
        pipDelegate = nil
        // shouldLoop reset : ne traverse pas un changement d'attachment.
        // isForceMuted reset : intention par-surface TRANSITOIRE, ne traverse
        // pas non plus un changement d'attachment/surface.
        // isMuted NON reset : préférence globale session utilisateur.
        shouldLoop = false
        isForceMuted = false
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
