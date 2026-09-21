import SwiftUI
import AVFoundation
import Combine
import os
import UIKit
import MeeshySDK

/// Le MOTEUR de lecture audio — extrait de `AudioPlayerView.swift` (#7212).
///
/// L'hôte pesait 1 806 lignes, 50 % au-dessus du plafond DUR de 1 200, et la
/// directive 2026-08-28 interdit d'AJOUTER à un fichier hors budget : on
/// extrait d'abord, on ajoute ensuite. La ligne de découpe est une
/// RESPONSABILITÉ — le moteur (session, seek, persistance, report d'écoute) ne
/// sait rien de la bulle qui le dessine, et la vue ne sait rien d'`AVAudioPlayer`.

@MainActor
public class AudioPlaybackManager: NSObject, ObservableObject {
    @Published public var isPlaying = false
    @Published public var progress: Double = 0
    @Published public var currentTime: TimeInterval = 0
    @Published public var duration: TimeInterval = 0
    @Published public var speed: PlaybackSpeed = .x1_0
    @Published public var isLoading = false
    /// Mirrors `SharedAVPlayerManager.shouldLoop` (the video engine): when
    /// `true`, natural end-of-playback seeks back to 0 and replays instead of
    /// tearing the engine down — used by the reels pager so an audio reel
    /// loops exactly like a video reel instead of going silent forever after
    /// one pass. Reset to `false` by `resetState()` on every new
    /// `play`/`playLocal` call, same as the video engine's `cleanup()` — the
    /// caller must opt back in per attachment, it never carries across tracks.
    @Published public var shouldLoop = false

    /// Profil de session transmis au MediaSessionCoordinator. Défaut
    /// `.transient` (fail-safe : un moteur oublié duck comme avant, sans
    /// jamais voler la carte Now Playing). Seul le moteur possédé par le
    /// ConversationAudioCoordinator (app) opte pour `.content`.
    public var sessionProfile: AudioSessionProfile = .transient

    public var onPlaybackFinished: (() -> Void)?

    /// BUG A (round 4) — opaque permission predicate consulted BEFORE any
    /// branch that *starts* or *resumes* playback (`play(urlString:)`,
    /// `playLocal(url:)`, the resume branch of `togglePlayPause()`). The SDK
    /// stays agnostic: it never imports app-side policy (e.g. `CallManager`).
    /// The app wires this to its CallKit guard so resuming a paused voice note
    /// during an active call — via the bubble tap, the lock-screen remote
    /// command, or any direct engine path — cannot steal the VoIP audio
    /// session. `nil` (default) means "always allowed". Returning `false`
    /// blocks ONLY start/resume; stop/pause are never gated.
    public var playbackPermissionGuard: (() -> Bool)?
    /// B3 fix — `@Published` so that observers (notably `AudioPlayerView` in
    /// the external-engine path) re-evaluate `handlePlayTap` gating logic
    /// the moment the coordinator swaps the loaded attachment. Without this,
    /// mutations stayed invisible to SwiftUI's dependency tracking and a
    /// rapid double-tap on the play button could resolve to a stale id.
    @Published public var attachmentId: String? {
        didSet {
            // Track switch (the shared engine is reassigned to a new audio
            // while the previous one is still loaded mid-playback): snapshot the
            // outgoing track's position so "resume where you stopped" survives
            // tapping another audio or skipping forward — not just pause/stop.
            guard oldValue != attachmentId, let outgoing = oldValue, player != nil else { return }
            saveResumePosition(currentTime, forAttachment: outgoing, totalDuration: duration)
        }
    }

    private var player: AVAudioPlayer?
    private var timer: Timer? {
        didSet { cleanupHandle.timer = timer }
    }
    private var loadTask: Task<Void, Never>? {
        didSet { cleanupHandle.loadTask = loadTask }
    }
    public private(set) var currentUrl: String?
    private var listenStartTime: Date?

    /// Capture fidèle de l'interaction : une entrée par écoute réellement
    /// continue, avec son motif de fin. Un échantillonnage périodique perdrait
    /// un vocal d'une seconde ou une écoute abandonnée en 500 ms ; le lecteur,
    /// lui, connaît les frontières exactes.
    private var stretchTracker = PlaybackStretchTracker()

    /// Version linguistique que le lecteur a sous les yeux — piste traduite ou
    /// transcription affichée. Fournie par la vue, qui seule la connaît : le
    /// moteur ne lit aucun singleton (pureté SDK). `nil` ⇒ rien n'est déclaré,
    /// ce qui vaut mieux qu'inventer une langue.
    public var consumedLanguageProvider: (() -> String?)?

    /// La consommation SERVIE par la passerelle pour une pièce jointe donnée —
    /// remise par la vue, qui seule tient le modèle (pureté SDK : le moteur ne
    /// lit aucun singleton nommé Meeshy pour ça).
    ///
    /// Elle voyage AVEC l'identifiant qu'elle qualifie : un moteur PARTAGÉ
    /// change de piste sous la vue qui l'a nourri, et une consommation
    /// orpheline ferait reprendre un vocal à la position d'un AUTRE.
    private var servedConsumption: (attachmentId: String, value: MeeshyMediaConsumption?)?

    /// Déclare la consommation servie pour `attachmentId`. Une seule à la fois :
    /// le moteur ne lit jamais que la pièce jointe qu'il a chargée.
    public func setServedConsumption(
        _ consumption: MeeshyMediaConsumption?, for attachmentId: String
    ) {
        servedConsumption = (attachmentId, consumption)
    }

    /// La consommation servie pour `attachmentId`, ou `nil` quand celle qu'on
    /// détient qualifie une AUTRE pièce jointe.
    nonisolated public static func servedConsumption(
        _ held: (attachmentId: String, value: MeeshyMediaConsumption?)?,
        matching attachmentId: String
    ) -> MeeshyMediaConsumption? {
        guard let held, held.attachmentId == attachmentId else { return nil }
        return held.value
    }

    private var positionMs: Int { Int((player?.currentTime ?? currentTime) * 1000) }

    /// Unification Étape C (slice 4) — session routée via `MediaSessionCoordinator`
    /// (source unique, refcomptée, call-aware via l'Étape B) au lieu d'un
    /// `setCategory`/`setActive` direct. Flag idempotent : `play` ne libère pas
    /// (resetState) puis ré-acquiert (no-op si déjà tenue) → pas de churn ; seul
    /// `stop()` libère. ⚠️ Unifie le ducking : ce moteur posait `options: []`
    /// (PAS de duck) → désormais `[.duckOthers]` comme tous les autres players.
    private var sessionRequested = false {
        didSet { cleanupHandle.sessionRequested = sessionRequested }
    }

    /// Holds thread-safe-to-cancel handles (`Timer.invalidate()` /
    /// `Task.cancel()`) so `deinit` — which may run off the main thread — can
    /// release them WITHOUT `MainActor.assumeIsolated` (a precondition crash
    /// off-main, see lesson feedback_swift6_concurrency_pitfalls). Kept in
    /// sync with the @MainActor stored props via their `didSet`. Marked
    /// `nonisolated(unsafe)` because the contained operations are themselves
    /// thread-safe and we only ever cancel/invalidate from deinit.
    private final class CleanupHandle {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
        nonisolated(unsafe) var timer: Timer?
        nonisolated(unsafe) var loadTask: Task<Void, Never>?
        nonisolated(unsafe) var sessionRequested = false
        /// Block-based `willResignActive` observer token. Removed in `deinit`
        /// (thread-safe) so the lifecycle hook never outlives the engine.
        nonisolated(unsafe) var lifecycleObserver: NSObjectProtocol?
    }
    private let cleanupHandle = CleanupHandle()

    public override init() {
        super.init()
        PlaybackCoordinator.shared.register(self)
        observeAppLifecycle()
    }

    /// Designated init that lets callers opt out of `PlaybackCoordinator`
    /// registration. The default `init()` keeps the historical
    /// auto-registration behavior (every call site that doesn't pass this
    /// new param stays unchanged). The opt-out is used by
    /// `AudioPlayerView` when a real external engine is provided, to avoid
    /// polluting the coordinator registry with an unused owned dummy whose
    /// only purpose is to satisfy SwiftUI's `@StateObject` lifetime.
    public init(registerWithCoordinator: Bool) {
        super.init()
        if registerWithCoordinator {
            PlaybackCoordinator.shared.register(self)
        }
        observeAppLifecycle()
    }

    /// Persists the current playback position when the app resigns active
    /// (incoming call, app switcher, lock, imminent termination). This is the
    /// belt that covers an app kill mid-playback — pause/stop already persist
    /// on their own paths. No-op for engines without a loaded `attachmentId`
    /// (preview/owned dummies).
    private func observeAppLifecycle() {
        cleanupHandle.lifecycleObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.persistPosition() }
        }
    }

    // MARK: - Audio session (routed through the single MediaSessionCoordinator)

    /// Acquiert la session `.playback` via le coordinator (idempotent). Awaité
    /// DANS le `loadTask` AVANT `playData` → session active avant lecture, sans
    /// race. Call-aware (Étape B) : ne touche pas la session pendant un appel.
    private func acquireSession() async {
        guard !sessionRequested else { return }
        sessionRequested = true
        try? await MediaSessionCoordinator.shared.request(
            role: .playback, playbackOptions: sessionProfile.categoryOptions
        )
    }

    /// Libère la session via le coordinator (refcompté : désactive au count 0).
    private func releaseSession() {
        guard sessionRequested else { return }
        sessionRequested = false
        Task { await MediaSessionCoordinator.shared.release() }
    }

    // MARK: - Play from remote URL (through cache)
    public func play(urlString: String) {
        if let guardClosure = playbackPermissionGuard, !guardClosure() { return }
        PlaybackCoordinator.shared.willStartPlaying(audio: self)
        resetState()
        guard !urlString.isEmpty else { return }
        currentUrl = urlString
        isLoading = true

        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString

        loadTask = Task {
            await acquireSession()
            guard !Task.isCancelled else { return }
            do {
                let data = try await CacheCoordinator.shared.audio.data(for: resolved)
                guard !Task.isCancelled else { return }
                playData(data)
            } catch {
                Self.log.error("play(urlString) cache fetch echec (\(resolved, privacy: .public)): \(error.localizedDescription, privacy: .public)")
                isLoading = false
                // B5 fix — notify the parent (coordinator / autoplay registry)
                // that this audio is done so the queue can advance past the
                // broken head. Without this the queue stalled silently on
                // 404 / offline / malformed-URL failures. Safe to call
                // unconditionally from the catch branch: AVAudioPlayer was
                // never instantiated, so `handlePlaybackFinished` will not
                // fire later from `audioPlayerDidFinishPlaying`, ruling out
                // double advance.
                onPlaybackFinished?()
            }
        }
    }

    // MARK: - Play from local file
    public func playLocal(url: URL) {
        if let guardClosure = playbackPermissionGuard, !guardClosure() { return }
        PlaybackCoordinator.shared.willStartPlaying(audio: self)
        resetState()
        currentUrl = url.absoluteString
        // Pre-flight : vérifie l'existence du fichier AVANT d'ouvrir une
        // audio session. Sans ce check, `Data(contentsOf:)` jetait, le
        // `catch {}` historique avalait l'erreur, et le preview composer
        // restait silencieusement muet ("le bouton play ne joue rien").
        let fm = FileManager.default
        if url.isFileURL, !fm.fileExists(atPath: url.path) {
            Self.log.error("playLocal: fichier introuvable -> \(url.path, privacy: .public)")
            isLoading = false
            return
        }
        loadTask = Task {
            await acquireSession()
            guard !Task.isCancelled else { return }
            // #7010 — `Task { }` HÉRITE du MainActor ; `AudioBytesLoader` part vraiment.
            guard let data = await AudioBytesLoader.bytes(at: url) else {
                Self.log.error("playLocal echec (\(url.lastPathComponent, privacy: .public)): octets illisibles")
                isLoading = false
                return
            }
            playData(data)
        }
    }

    /// Logger dédié — `os.Logger` subsystem `me.meeshy.app`, catégorie
    /// `audio-playback`. Permet de filtrer rapidement dans Console.app
    /// quand un preview ne déclenche aucune lecture audible.
    private static let log = os.Logger(subsystem: "me.meeshy.app", category: "audio-playback")

    private func playData(_ data: Data) {
        do {
            player = try AVAudioPlayer(data: data)
            player?.delegate = self
            player?.enableRate = true
            player?.rate = Float(speed.rawValue)
            player?.prepareToPlay()
            duration = player?.duration ?? 0
            applyResumePositionIfAvailable()
            player?.play()
            isPlaying = true
            isLoading = false
            listenStartTime = Date()
            stretchTracker.begin(positionMs)
            startProgressTimer()
        } catch {
            Self.log.error("playData AVAudioPlayer init echec (\(data.count, privacy: .public)o): \(error.localizedDescription, privacy: .public)")
            isLoading = false
        }
    }

    // MARK: - Controls
    private func resetState() {
        player?.stop()
        player = nil
        timer?.invalidate()
        timer = nil
        if isPlaying { isPlaying = false }
        if progress != 0 { progress = 0 }
        if currentTime != 0 { currentTime = 0 }
        // B2 fix — clear the listen analytics window so a fresh `play()` of a
        // different track does not inherit the prior track's start time and
        // post `reportListenProgress` against the wrong attachment. The new
        // track's `listenStartTime` is set in `playData(_:)` on actual start.
        // L'écoute en cours s'arrête sans être ni terminée ni mise en pause :
        // clos et envoyé AVANT d'effacer la fenêtre d'analyse, sans quoi elle
        // serait perdue — ou pire, recollée à la piste suivante.
        if stretchTracker.hasOpenStretch {
            stretchTracker.dismissed(positionMs)
        }
        reportListenProgress(complete: false)
        listenStartTime = nil
        loadTask?.cancel()
        loadTask = nil
        // Never carries across tracks — mirrors SharedAVPlayerManager.cleanup()
        // resetting shouldLoop=false; the caller re-opts-in per attachment.
        if shouldLoop { shouldLoop = false }
    }

    public func stop() {
        persistPosition()
        resetState()
        currentUrl = nil
        releaseSession()
    }

    public func togglePlayPause() {
        guard let player = player else { return }
        if player.isPlaying {
            player.pause()
            isPlaying = false
            timer?.invalidate()
            stretchTracker.pause(positionMs)
            reportListenProgress(complete: false)
            persistPosition()
        } else {
            // BUG A (round 4) — gate ONLY the resume branch. Pausing is always
            // allowed; resuming during a call must not steal the VoIP session.
            if let guardClosure = playbackPermissionGuard, !guardClosure() { return }
            PlaybackCoordinator.shared.willStartPlaying(audio: self)
            player.rate = Float(speed.rawValue)
            player.play()
            isPlaying = true
            listenStartTime = listenStartTime ?? Date()
            stretchTracker.begin(positionMs)
            startProgressTimer()
        }
    }

    /// Pause explicite pour interruption système / changement de route.
    /// Contrairement à `togglePlayPause()`, sans effet si le player a déjà
    /// été mis en pause par le système (le toggle RELANCERAIT dans ce cas).
    public func pause() {
        guard player != nil, isPlaying else { return }
        player?.pause()
        isPlaying = false
        timer?.invalidate()
        stretchTracker.pause(positionMs)
        reportListenProgress(complete: false)
        persistPosition()
    }

    /// Reprise après interruption système : la session a pu être désactivée
    /// par l'OS — la réactiver de façon synchrone (call-aware, sans toucher
    /// le refcount) avant de relancer le player conservé.
    public func resumeFromInterruption() {
        guard let player, !isPlaying else { return }
        if let guardClosure = playbackPermissionGuard, !guardClosure() { return }
        MediaSessionCoordinator.shared.activatePlaybackSync(
            options: sessionProfile.categoryOptions
        )
        PlaybackCoordinator.shared.willStartPlaying(audio: self)
        player.rate = Float(speed.rawValue)
        player.play()
        isPlaying = true
        listenStartTime = listenStartTime ?? Date()
        stretchTracker.begin(positionMs)
        startProgressTimer()
    }

    public func seek(to fraction: Double) {
        guard let player = player else { return }
        let target = fraction * player.duration
        // Relevé AVANT le déplacement : c'est jusque-là que l'écoute a porté.
        // Le traqueur ignore de lui-même un déplacement à l'arrêt.
        stretchTracker.seek(from: positionMs, to: Int(target * 1000))
        player.currentTime = target
        currentTime = target
        progress = fraction
    }

    public func seekToTime(_ time: Double) {
        guard let player = player, player.duration > 0 else { return }
        let fraction = time / player.duration
        seek(to: min(1, max(0, fraction)))
    }

    public func skip(seconds: Double) {
        guard let player = player else { return }
        let target = max(0, min(player.duration, player.currentTime + seconds))
        stretchTracker.seek(from: positionMs, to: Int(target * 1000))
        player.currentTime = target
        currentTime = target
        progress = player.duration > 0 ? target / player.duration : 0
    }

    public func setSpeed(_ newSpeed: PlaybackSpeed) {
        speed = newSpeed
        player?.rate = Float(speed.rawValue)
        HapticFeedback.light()
    }

    public func cycleSpeed() {
        setSpeed(speed.next())
    }

    // MARK: - Playback Finished (called by delegate)
    private func handlePlaybackFinished() {
        let finishedUrl = currentUrl
        // Le média est allé au bout tout seul : la frontière n'est ni une pause
        // ni un abandon, et l'écart se lit dans la trace.
        stretchTracker.completed(Int(duration * 1000))
        reportListenProgress(complete: true)
        // Natural end → forget the saved RESUME position so a later re-listen
        // starts from 0, but remember the media as fully CONSUMED so the bubble
        // keeps tinting the waveform at rest.
        if let attId = attachmentId {
            MediaConsumptionStore.shared.record(fraction: 1, complete: true, for: attId)
            AudioPlaybackPositionStore.shared.clear(for: attId)
        }
        // Reels pager parity — mirrors SharedAVPlayerManager's video loop:
        // seek back to 0 and replay, keeping the player + session alive,
        // instead of tearing everything down. Without this an audio reel
        // stopped for good after one pass while its video-reel sibling looped
        // forever (incohérence pager réels).
        if shouldLoop, let player {
            player.currentTime = 0
            currentTime = 0
            progress = 0
            listenStartTime = Date()
            stretchTracker.begin(0)
            player.play()
            isPlaying = true
            startProgressTimer()
            return
        }
        timer?.invalidate()
        timer = nil
        player = nil
        isPlaying = false
        progress = 0
        currentTime = 0
        listenStartTime = nil
        onPlaybackFinished?()
        if let url = finishedUrl {
            Self.triggerAutoplayNext(afterUrl: url)
        }
        currentUrl = nil
    }

    // MARK: - Listen Progress Reporting
    private func reportListenProgress(complete: Bool) {
        guard let attId = attachmentId else { return }
        guard let start = listenStartTime else { return }
        let listenedSeconds = Date().timeIntervalSince(start)
        // Vidée AVANT la garde, et jamais après : un retour anticipé laisserait
        // la trace dans le traqueur, qui l'attribuerait ensuite à la piste
        // SUIVANTE. Le seuil de 3 s protège le réseau, pas la mesure — une trace
        // non vide vaut d'être envoyée, même pour une écoute de 500 ms.
        let stretches = stretchTracker.drain()
        guard complete || listenedSeconds >= 3 || !stretches.isEmpty else { return }
        let positionMs = Int(currentTime * 1000)
        let totalDurationMs = Int(duration * 1000)
        let language = consumedLanguageProvider?()

        let body = AttachmentStatusBody(
            action: "listened",
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
    // comfortably inside the track. We never resume within `resumeEdgeGuard`
    // of either edge — a position glued to 0 adds nothing, and one glued to
    // the end would replay the last instant then immediately finish.

    /// Tracks shorter than this are never resumed (a 1s voice note is replayed
    /// whole). Also gates `persistPosition` so we don't store noise.
    nonisolated private static let minResumableDuration: TimeInterval = 2.0
    /// Dead-zone at both ends of the track, in seconds.
    nonisolated private static let resumeEdgeGuard: TimeInterval = 1.0

    /// Whether `saved` is a position playback will actually honor on the next
    /// play. Single source of truth for the dead-zone rule: the seek path
    /// (`applyResumePositionIfAvailable`), the store path (`saveResumePosition`)
    /// and the bubble's elapsed timecode all ask this, so the UI can never
    /// advertise a resume point the engine would silently ignore.
    nonisolated public static func isResumable(
        _ saved: TimeInterval, totalDuration: TimeInterval
    ) -> Bool {
        totalDuration >= minResumableDuration
            && saved > resumeEdgeGuard
            && saved < totalDuration - resumeEdgeGuard
    }

    /// Seeks to the saved resume position (if any) BEFORE playback starts.
    /// Called from `playData(_:)` once `duration` is known and the player is
    /// prepared but not yet playing.
    ///
    /// #7212 — la position servie par la passerelle comble l'ABSENCE locale,
    /// par la MÊME fonction que la bulle interroge pour composer son timecode
    /// (`MediaResumeResolver`). Deux descentes séparées feraient afficher 0:45
    /// au-dessus d'une lecture qui démarre à 0:00 : un contrôle qui ment, pire
    /// que la reprise absente qu'on corrige.
    private func applyResumePositionIfAvailable() {
        guard let attId = attachmentId, let player else { return }
        guard let saved = MediaResumeResolver.resumePosition(
            localPositionSeconds: AudioPlaybackPositionStore.shared.position(for: attId),
            servedConsumption: Self.servedConsumption(servedConsumption, matching: attId),
            medium: .audio,
            totalDuration: duration,
            isEligible: Self.isResumable)
        else { return }
        player.currentTime = saved
        currentTime = saved
        progress = duration > 0 ? saved / duration : 0
    }

    /// Persists the current elapsed time for the active attachment, or clears
    /// it when playback sits at either edge (nothing meaningful to resume).
    /// Safe no-op when no attachment is loaded.
    private func persistPosition() {
        guard let attId = attachmentId else { return }
        // Record the at-rest consumption fraction (monotonic) so a partially
        // listened voice note keeps its waveform tint after scroll / relaunch.
        if duration > 0 {
            MediaConsumptionStore.shared.record(fraction: currentTime / duration, complete: false, for: attId)
        }
        saveResumePosition(currentTime, forAttachment: attId, totalDuration: duration)
    }

    /// Saves `elapsed` as the resume point for `id`, or clears any stored
    /// position when `elapsed` sits at either edge of the track (nothing
    /// meaningful to resume). Short tracks are never stored.
    private func saveResumePosition(_ elapsed: TimeInterval, forAttachment id: String, totalDuration: TimeInterval) {
        guard totalDuration >= Self.minResumableDuration else { return }
        if Self.isResumable(elapsed, totalDuration: totalDuration) {
            AudioPlaybackPositionStore.shared.save(elapsed, for: id)
        } else {
            AudioPlaybackPositionStore.shared.clear(for: id)
        }
    }

    // MARK: - Timer
    //
    // Perf budget (2026-05-28): the previous 20 Hz tick (0.05 s) was the
    // single biggest CPU drain during sustained audio playback because
    // every wakeup re-published `currentTime` + `progress` through the
    // coordinator cascade → invalidated every `@ObservedObject coordinator`
    // observer (mini-player, etc.) at 20 Hz. Dropping to 10 Hz halves the
    // wakeups and is visually indistinguishable on the waveform / progress
    // chip (both round to 0.01-resolution display anyway). Additionally,
    // we skip writes whose delta is below a perceptible threshold to
    // collapse the Combine downstream into ~5 Hz of distinct values.
    private static let progressTickInterval: TimeInterval = 0.1
    /// `currentTime` is exposed in seconds with 100ms display granularity
    /// (`formatMediaDuration` truncates below that). Any smaller delta is
    /// invisible to the user and only generates wasted re-renders.
    private static let currentTimeWriteThresholdSeconds: TimeInterval = 0.05
    /// `progress` drives a 200-ish-pixel waveform; sub-half-pixel deltas
    /// yield no visible change. 0.002 (=0.2%) is a comfortable cutoff.
    private static let progressWriteThreshold: Double = 0.002

    private func startProgressTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: Self.progressTickInterval, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self, let player = self.player else { return }
                guard player.isPlaying else { return }
                let newTime = player.currentTime
                // Le traqueur ne crée rien ici : il retient seulement la dernière
                // position connue, pour pouvoir clore proprement une écoute dont
                // la position finale serait illisible (fermeture brutale).
                self.stretchTracker.observe(Int(newTime * 1000))
                let newProgress = player.duration > 0 ? newTime / player.duration : 0
                if abs(newTime - self.currentTime) >= Self.currentTimeWriteThresholdSeconds {
                    self.currentTime = newTime
                }
                if abs(newProgress - self.progress) >= Self.progressWriteThreshold {
                    self.progress = newProgress
                }
            }
        }
    }

    // C fix — `Timer.invalidate()` and `Task.cancel()` are thread-safe, so we
    // call them directly. `MainActor.assumeIsolated` from a non-main thread is
    // a precondition crash (see lesson feedback_swift6_concurrency_pitfalls:
    // @MainActor deinit pitfall) and the last release can happen off-main.
    deinit {
        cleanupHandle.timer?.invalidate()
        cleanupHandle.loadTask?.cancel()
        if let observer = cleanupHandle.lifecycleObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        // Dealloc avec session encore tenue (chemin sans `stop()` — vue
        // détruite sans onDisappear) : sans cette libération le refcount du
        // MediaSessionCoordinator ne retombait jamais à 0 → session audio
        // active (ducking) pour tout le process et release() sous-compté.
        if cleanupHandle.sessionRequested {
            Task { await MediaSessionCoordinator.shared.release() }
        }
    }

    @MainActor public func unregisterFromCoordinator() {
        PlaybackCoordinator.shared.unregister(self)
    }

    // MARK: - Autoplay Registry (static)
    // Keyé par id d'attachement (stable) et non par URL : l'URL optimiste
    // `file://` est remplacée par l'URL serveur après upload — une entrée
    // enregistrée sous l'ancienne URL devenait introuvable au disappear et
    // retenait son moteur (closure forte) pour toute la vie du process. Le
    // déclenchement reste matché par URL (c'est celle que le player vient de
    // finir) ; une ré-apparition met l'entrée à jour via le dedupe par id.
    private static var autoplayRegistry: [(id: String, url: String, play: () -> Void)] = []

    public static func registerAutoplay(id: String, url: String, play: @escaping () -> Void) {
        autoplayRegistry.removeAll { $0.id == id }
        autoplayRegistry.append((id: id, url: url, play: play))
    }

    public static func unregisterAutoplay(id: String) {
        autoplayRegistry.removeAll { $0.id == id }
    }

    private static func triggerAutoplayNext(afterUrl: String) {
        guard let idx = autoplayRegistry.firstIndex(where: { $0.url == afterUrl }) else { return }
        let next = idx - 1
        guard next >= 0 else { return }
        autoplayRegistry[next].play()
    }
}

// MARK: - AVAudioPlayerDelegate
extension AudioPlaybackManager: AVAudioPlayerDelegate {
    nonisolated public func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.handlePlaybackFinished()
        }
    }
}

