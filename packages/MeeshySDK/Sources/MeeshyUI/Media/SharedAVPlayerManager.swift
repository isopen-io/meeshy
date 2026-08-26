import AVFoundation
import AVKit
import Combine
import SwiftUI
import MeeshySDK

// MARK: - Shared AV Player Manager

@MainActor
public final class SharedAVPlayerManager: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
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
    /// Couper le son clôt le visionnage en cours : ce qui suit n'est plus la
    /// même consommation, et la trace doit pouvoir le dire.
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

    /// Appelé par les `didSet` de mute : un média coupé n'est plus consommé de
    /// la même façon, et la frontière est une information à part entière.
    private func closeStretchOnMuteChange() {
        guard effectiveMuted, stretchTracker.hasOpenStretch else { return }
        stretchTracker.muted(positionMs)
    }

    private func applyMuteState() {
        player?.isMuted = effectiveMuted
        closeStretchOnMuteChange()
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
    /// Armé AVANT tout teardown PiP qui ne doit PAS arrêter la lecture :
    /// `stopPip()` programmatique (toggle transport, fin naturelle) et le
    /// chemin de restauration in-app (flèche de la fenêtre PiP). Consommé par
    /// le delegate `didStop` — s'il est retombé, la fenêtre a été fermée par
    /// l'utilisateur (X) et la lecture s'arrête, sinon l'audio continuerait
    /// invisible en arrière-plan.
    private var pipTeardownIsInternal = false
    private var watchStartTime: Date?

    /// Guards `applyResumePositionIfAvailable()` against firing on every
    /// `duration` publisher tick (AVFoundation reports it more than once as
    /// the item loads) — the resume seek must happen exactly once per `load()`.
    private var hasAppliedResumeThisLoad = false

    /// Capture fidèle de l'interaction : une entrée par visionnage réellement
    /// continu, avec son motif de fin. Distinct des `WatchSample` d'engagement,
    /// qui échantillonnent une horloge : ceux-là ne diraient jamais qu'un
    /// visionnage s'est arrêté sur une coupure du son plutôt qu'une pause.
    private var stretchTracker = PlaybackStretchTracker()

    /// Version linguistique consommée — sous-titres, piste doublée. Fournie par
    /// la surface, qui seule la connaît ; le moteur ne lit aucun singleton.
    public var consumedLanguageProvider: (() -> String?)?

    private var positionMs: Int { currentTime.isNaN ? 0 : max(0, Int(currentTime * 1000)) }
    /// Last `currentTime` (s) at which an engagement heartbeat fired. Instance-scoped
    /// (was a `var` captured inside the time-observer closure) so the observer block
    /// can stay a plain `MainActor.assumeIsolated` call — no `Task` hop per tick.
    private var lastHeartbeat: Double = 0

    private init() {}

    /// Le player DÉJÀ chargé pour cette pièce jointe, ou `nil` si le
    /// gestionnaire en porte une autre (O16). Lecture seule : demander la
    /// continuité ne charge rien et ne préempte aucune surface en cours.
    public func loadedPlayer(matching attachmentId: String) -> AVPlayer? {
        guard self.attachmentId == attachmentId else { return nil }
        return player
    }

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
        stretchTracker.begin(positionMs)
        emitWatchSample()
    }

    public func pause() {
        emitWatchSample()
        // Clôt AVANT le rapport, qui draine la trace : sinon le dernier passage
        // resterait ouvert et manquerait à l'envoi.
        stretchTracker.pause(positionMs)
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
        // Relevé AVANT le déplacement : c'est jusque-là que le visionnage a
        // porté. Le traqueur ignore de lui-même un déplacement à l'arrêt.
        stretchTracker.seek(from: positionMs, to: max(0, Int(seconds * 1000)))
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

    /// PiP réellement engagé — état LIVE du contrôleur, pas le `@Published`
    /// `isPipActive` qui traverse un hop MainActor. Lu par le garde background
    /// de l'app pendant la transition, où l'auto-PiP vient tout juste de
    /// démarrer et où le flag publié peut encore être en retard d'un tick.
    public var isPipEngaged: Bool {
        pipController?.isPictureInPictureActive == true
    }

    /// Une surface a opté pour le PiP sur la vidéo courante (le simulateur ne
    /// supporte pas le PiP : toujours `false` là-bas).
    public var isPipConfigured: Bool {
        pipController != nil
    }

    /// Attend (borné) que l'auto-PiP s'engage pendant la transition vers
    /// l'arrière-plan : AVKit démarre le PiP de son côté au moment où l'app
    /// se retire, et le garde background court CONTRE cette animation. Sans
    /// cette fenêtre, un `pause()` prématuré avorterait la fenêtre PiP que le
    /// système était en train d'ouvrir.
    public func waitForPipEngagement(timeout: TimeInterval) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if isPipEngaged { return true }
            try? await Task.sleep(for: .milliseconds(50))
        }
        return isPipEngaged
    }

    /// Pure, testable decision: must playback halt when the PiP window tears
    /// down? Closing the window (X) is the user saying "stop the video" —
    /// letting it run would leak invisible audio in the background. Internal
    /// teardowns (programmatic `stopPip()`, in-app restore) keep playing.
    public nonisolated static func shouldHaltPlaybackOnPipStop(teardownWasInternal: Bool) -> Bool {
        !teardownWasInternal
    }

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
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.isPipActive = false
                let wasInternal = self.pipTeardownIsInternal
                self.pipTeardownIsInternal = false
                if Self.shouldHaltPlaybackOnPipStop(teardownWasInternal: wasInternal) {
                    self.stop()
                }
            }
        } onRestore: { [weak self] completion in
            Task { @MainActor [weak self] in
                // The player is already shared — nothing to restore, but the
                // upcoming `didStop` must NOT halt playback (the user asked to
                // come BACK to the video, not to close it).
                self?.pipTeardownIsInternal = true
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
        // Le flag n'est armé QUE si une fenêtre PiP est réellement ouverte :
        // un no-op (`stopPictureInPicture()` sans PiP actif) laisserait sinon
        // un flag orphelin qui avalerait la PROCHAINE fermeture utilisateur.
        if pipController?.isPictureInPictureActive == true {
            pipTeardownIsInternal = true
        }
        pipController?.stopPictureInPicture()
        isPipActive = false
    }

    // MARK: - Watch Progress Reporting

    private func reportWatchProgress(complete: Bool) {
        guard let attId = attachmentId else { return }
        guard let start = watchStartTime else { return }
        let watchedSeconds = Date().timeIntervalSince(start)
        // Vidé AVANT la garde, et jamais après : un retour anticipé laisserait
        // la trace dans le traqueur, qui l'attribuerait ensuite à la vidéo
        // SUIVANTE. Le seuil de 3 s protège le réseau, pas la mesure — une
        // trace non vide vaut d'être envoyée quelle qu'ait été sa durée.
        let stretches = stretchTracker.drain()
        guard complete || watchedSeconds >= 3 || !stretches.isEmpty else { return }
        let positionMs = Int(currentTime * 1000)
        let totalDurationMs = Int(duration * 1000)

        // Persist the at-rest watch fraction (monotonic, kept after completion)
        // so the bubble thumbnail can show a discreet progress bar at a glance.
        if complete {
            MediaConsumptionStore.shared.record(fraction: 1, complete: true, for: attId)
            // Natural/forced end → forget the saved RESUME position so a later
            // re-watch starts from 0 (mirrors AudioPlaybackManager.handlePlaybackFinished).
            VideoPlaybackPositionStore.shared.clear(for: attId)
        } else if duration > 0 {
            MediaConsumptionStore.shared.record(fraction: currentTime / duration, complete: false, for: attId)
            saveOrClearResumePosition(currentTime, forAttachment: attId, totalDuration: duration)
        }

        let language = consumedLanguageProvider?()

        let body = AttachmentStatusBody(
            action: "watched",
            playPositionMs: positionMs,
            durationMs: totalDurationMs,
            complete: complete,
            stretches: stretches,
            language: language
        )
        AttachmentStatusReporter.report(attachmentId: attId, body: body)
    }

    // MARK: - Playback position persistence
    //
    // Resume-where-you-stopped: a saved position is honored only when it sits
    // comfortably inside the video. Strict mirror of `AudioPlaybackManager`'s
    // rule (same thresholds) so a video's resume behavior reads consistently
    // with a voice note's — we never resume within `resumeEdgeGuard` of either
    // edge, and tracks shorter than `minResumableDuration` are always replayed
    // whole.

    nonisolated private static let minResumableDuration: TimeInterval = 2.0
    nonisolated private static let resumeEdgeGuard: TimeInterval = 1.0

    /// Whether `saved` is a position playback will actually honor on the next
    /// play. Single source of truth for the dead-zone rule: the seek path
    /// (`applyResumePositionIfAvailable`) and the persist path
    /// (`saveOrClearResumePosition`) both ask this.
    nonisolated public static func isResumable(
        _ saved: TimeInterval, totalDuration: TimeInterval
    ) -> Bool {
        totalDuration >= minResumableDuration
            && saved > resumeEdgeGuard
            && saved < totalDuration - resumeEdgeGuard
    }

    /// Seeks to the saved resume position (if any) BEFORE playback starts.
    /// Called once per `load()` from the `duration` publisher sink, guarded by
    /// `hasAppliedResumeThisLoad` — AVFoundation republishes `duration` more
    /// than once while the item loads.
    private func applyResumePositionIfAvailable() {
        guard !hasAppliedResumeThisLoad, duration > 0, let attId = attachmentId else { return }
        hasAppliedResumeThisLoad = true
        guard let saved = VideoPlaybackPositionStore.shared.position(for: attId),
              Self.isResumable(saved, totalDuration: duration) else { return }
        seek(to: saved)
    }

    /// Saves `elapsed` as the resume point for `id`, or clears any stored
    /// position when `elapsed` sits at either edge of the track (nothing
    /// meaningful to resume). Short tracks are never stored.
    private func saveOrClearResumePosition(_ elapsed: TimeInterval, forAttachment id: String, totalDuration: TimeInterval) {
        guard totalDuration >= Self.minResumableDuration else { return }
        if Self.isResumable(elapsed, totalDuration: totalDuration) {
            VideoPlaybackPositionStore.shared.save(elapsed, for: id)
        } else {
            VideoPlaybackPositionStore.shared.clear(for: id)
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
                // Ne crée aucune entrée : retient seulement la dernière position
                // connue, pour clore proprement un visionnage interrompu net.
                self.stretchTracker.observe(max(0, Int(seconds * 1000)))
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
                self.applyResumePositionIfAvailable()
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: AVPlayerItem.didPlayToEndTimeNotification, object: player.currentItem)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                self.stretchTracker.completed(Int(self.duration * 1000))
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
        // L'utilisateur quitte pendant la lecture : le visionnage en cours n'est
        // ni terminé ni mis en pause. Clos et envoyé AVANT toute remise à zéro,
        // sans quoi il serait perdu — ou pire, recollé à la vidéo suivante.
        if stretchTracker.hasOpenStretch {
            stretchTracker.dismissed(positionMs)
        }
        reportWatchProgress(complete: false)

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
        hasAppliedResumeThisLoad = false
        attachmentId = nil
        pipController = nil
        pipDelegate = nil
        pipTeardownIsInternal = false
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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
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
