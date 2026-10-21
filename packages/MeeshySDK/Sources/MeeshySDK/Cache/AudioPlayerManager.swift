import Foundation
import AVFoundation
import Combine
import os

@MainActor
public class AudioPlayerManager: ObservableObject {
    @Published public var isPlaying = false
    @Published public var progress: Double = 0 // 0-1
    @Published public var duration: TimeInterval = 0
    /// Last playback failure, surfaced so a caller can show an error state
    /// instead of a tap that silently does nothing. `nil` = no error;
    /// cleared on the next successful `playData`.
    @Published public var lastError: String?

    /// Called before playback starts — hook this to PlaybackCoordinator in the app layer.
    public var onWillPlay: (() -> Void)?
    /// Called when stop() is invoked — hook this to allow external stop coordination.
    public var onDidStop: (() -> Void)?

    private static let log = MeeshyLog.logger(.audioPlayback)

    private var localPlayer: AVAudioPlayer? {
        didSet { teardown.update { $0.localPlayer = localPlayer } }
    }
    private var streamPlayer: AVPlayer? {
        didSet { teardown.update { $0.streamPlayer = streamPlayer } }
    }
    private var timer: Timer? {
        didSet { teardown.update { $0.timer = timer } }
    }
    private var loadTask: Task<Void, Never>? {
        didSet { teardown.update { $0.loadTask = loadTask } }
    }
    private var streamObserver: Any? {
        didSet { teardown.update { $0.streamObserver = streamObserver } }
    }
    private var streamCancellables = Set<AnyCancellable>()

    /// Ressources à libérer depuis le `deinit` (potentiellement off-main). Sans ce
    /// filet, une instance lâchée mid-lecture (vue dismissée sans `stop()`)
    /// laissait le Timer 10 Hz au run loop pour toujours et l'observer
    /// périodique jamais retiré de l'AVPlayer (contrat AVFoundation violé).
    private let teardown = TeardownBox(PlaybackResources())

    /// Ce qu'une interruption a mis en pause (#11040).
    private var interruptionLedger = InterruptionResumeLedger()
    /// L'intention de lecture : le système arrête le lecteur avant que la
    /// notification d'interruption n'arrive, son état ne dit plus qu'il jouait.
    private var wantsPlayback = false
    private var sessionEventsCancellable: AnyCancellable?

    public init(
        sessionEvents: AnyPublisher<MediaSessionCoordinator.Event, Never> =
            MediaSessionCoordinator.shared.events.eraseToAnyPublisher()
    ) {
        MediaSessionCoordinator.shared.observeSystemEvents()
        sessionEventsCancellable = sessionEvents
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.handleSessionEvent(event) }
        RecordingPlaybackDucker.shared.register(self)
    }

    nonisolated deinit {
        teardown.update(PlaybackResources.invalidateTimer)
        teardown.read { $0.loadTask }?.cancel()
        // Player non-nil ⟺ mort sans `stop()` (stop pose nil partout) : on
        // coupe la lecture et on rend la session (call-aware), sinon elle
        // restait active pour tout le process. Déporté sur une queue utility :
        // `setActive(false)` est un appel HAL bloquant et ce dealloc arrive
        // typiquement sur le main thread pendant un scroll.
        guard teardown.read(\.holdsPlayers) else { return }
        teardown.release(on: .global(qos: .utility), PlaybackResources.releaseOffMain)
    }

    // MARK: - Play from URL string

    public func play(urlString: String) {
        // Enchaîner : la session `.playback` reste tenue, elle est reprise juste en dessous.
        halt()

        guard !urlString.isEmpty else { return }

        onWillPlay?()

        // Session de lecture via la loi UNIQUE (call-aware) : ne stomp PAS un appel
        // VoIP actif (sinon micro coupé), met la musique des autres apps en pause.
        MediaSessionCoordinator.shared.activateContentPlayback(.audible)
        holdsPlaybackSession = true

        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString

        // 1. Check disk cache — play instantly from local file (no network).
        // `AVAudioPlayer(contentsOf:)` lit le fichier en streaming — inutile de
        // matérialiser tout l'audio en `Data` résident avant lecture.
        if let localURL = CacheCoordinator.audioLocalFileURL(for: resolved) {
            do {
                let player = try AVAudioPlayer(contentsOf: localURL)
                startLocalPlayback(player)
                return
            } catch {
                // Fall through to streaming
            }
        }

        // 2. Stream from network (instant start) + cache in background
        guard let url = URL(string: resolved), url.scheme == "https" || url.scheme == "http" else { return }
        playStream(url: url, cacheKey: resolved)
    }

    private func playData(_ data: Data) {
        do {
            let player = try AVAudioPlayer(data: data)
            startLocalPlayback(player)
        } catch {
            Self.log.error("playData AVAudioPlayer init echec (\(data.count, privacy: .public)o): \(error.localizedDescription, privacy: .public)")
            lastError = error.localizedDescription
        }
    }

    private func startLocalPlayback(_ player: AVAudioPlayer) {
        localPlayer = player
        player.prepareToPlay()
        duration = player.duration
        player.play()
        isPlaying = true
        wantsPlayback = true
        lastError = nil
        startLocalProgressTimer()
    }

    private func playStream(url: URL, cacheKey: String) {
        let item = AVPlayerItem(url: url)
        let avPlayer = AVPlayer(playerItem: item)
        streamPlayer = avPlayer

        // Observe duration
        item.publisher(for: \.duration)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] cmDuration in
                let seconds = cmDuration.seconds
                if !seconds.isNaN && !seconds.isInfinite && seconds > 0 {
                    self?.duration = seconds
                }
            }
            .store(in: &streamCancellables)

        // Observe playback rate
        avPlayer.publisher(for: \.rate)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] rate in
                self?.isPlaying = rate > 0
            }
            .store(in: &streamCancellables)

        // End-of-playback
        NotificationCenter.default.publisher(for: AVPlayerItem.didPlayToEndTimeNotification, object: item)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.stop()
            }
            .store(in: &streamCancellables)

        // Progress observer — 10 Hz tick (down from 20 Hz, 2026-05-28).
        // The streaming path mirrors the local path's perf budget: the
        // mini-player + waveform UI cap visible at ~10 Hz anyway, and the
        // Combine cascade through `ConversationAudioCoordinator` was the
        // dominant CPU hit during sustained playback.
        let interval = CMTime(seconds: Self.progressTickInterval, preferredTimescale: 600)
        streamObserver = avPlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor [weak self] in
                guard let self, self.duration > 0 else { return }
                let newProgress = time.seconds / self.duration
                if abs(newProgress - self.progress) >= Self.progressWriteThreshold {
                    self.progress = newProgress
                }
            }
        }

        avPlayer.play()
        isPlaying = true
        wantsPlayback = true

        // Cache audio data in background for next time
        loadTask = Task {
            do {
                _ = try await CacheCoordinator.shared.audio.data(for: cacheKey)
            } catch is CancellationError {
                // Piste changée avant la fin du préchargement — nominal.
            } catch {
                // Pur préchargement : la lecture en cours n'est pas affectée,
                // seule la prochaine ouverture repartira du réseau.
                Logger.cache.error("Audio cache warm-up failed, next playback will re-download: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    // MARK: - Play from local file URL

    public func playLocalFile(url: URL) {
        halt()
        onWillPlay?()

        // Session de lecture via la loi UNIQUE (call-aware) — cf. play(urlString:).
        MediaSessionCoordinator.shared.activateContentPlayback(.audible)
        holdsPlaybackSession = true

        do {
            let data = try Data(contentsOf: url)
            playData(data)
        } catch {
            Self.log.error("playLocalFile echec (\(url.lastPathComponent, privacy: .public)): \(error.localizedDescription, privacy: .public)")
            lastError = error.localizedDescription
        }
    }

    // MARK: - Controls

    /// Rend la session de lecture (call-aware) — par défaut au coordinateur, injectable pour les témoins.
    /// Hors du fil principal : `setActive(false)` est un aller-retour HAL bloquant.
    var sessionReleaser: () -> Void = {
        MediaSessionCoordinator.shared.deactivatePlaybackDeferred()
    }

    /// Arrête la lecture ET rend la session `.playback` si une lecture la tenait : la musique d'une autre app,
    /// interrompue par notre session non mixable, reprend (`.notifyOthersOnDeactivation`).
    public func stop() {
        halt()
        guard holdsPlaybackSession else { return }
        holdsPlaybackSession = false
        sessionReleaser()
    }

    /// Vrai depuis qu'une lecture a pris la session `.playback` — y compris quand son chargement a échoué avant
    /// qu'un lecteur n'existe : c'est la session, pas le lecteur, qu'il faut rendre.
    private var holdsPlaybackSession = false

    /// Arrête la lecture SANS rendre la session — pour enchaîner une autre lecture.
    private func halt() {
        wantsPlayback = false
        _ = interruptionLedger.handle(.contentReleased)
        localPlayer?.stop()
        localPlayer = nil

        if let observer = streamObserver, let sp = streamPlayer {
            sp.removeTimeObserver(observer)
        }
        streamObserver = nil
        streamPlayer?.pause()
        streamPlayer = nil
        streamCancellables.removeAll()

        timer?.invalidate()
        timer = nil
        let wasPlaying = isPlaying
        isPlaying = false
        progress = 0
        duration = 0
        loadTask?.cancel()
        loadTask = nil
        if wasPlaying { onDidStop?() }
    }

    public func togglePlayPause() {
        guard localPlayer != nil || streamPlayer != nil else { return }
        if localPlayer?.isPlaying ?? isPlaying {
            _ = interruptionLedger.handle(.userPaused)
            pauseForInterruption()
            // La musique que l'aperçu avait coupée reprend dans ≈ 3 s, sauf relance.
            MediaSessionCoordinator.shared.releaseAfterUserPause()
        } else {
            _ = interruptionLedger.handle(.userStartedPlayback)
            resumePlayback()
        }
    }

    private func pauseForInterruption() {
        wantsPlayback = false
        localPlayer?.pause()
        streamPlayer?.pause()
        if localPlayer != nil { isPlaying = false }
        timer?.invalidate()
    }

    private func resumePlayback() {
        onWillPlay?()
        MediaSessionCoordinator.shared.activateContentPlayback(.audible)
        holdsPlaybackSession = true
        wantsPlayback = true
        if let localPlayer {
            localPlayer.play()
            isPlaying = true
            startLocalProgressTimer()
        } else {
            // isPlaying suit l'observation du débit.
            streamPlayer?.play()
        }
    }

    // MARK: - Interruptions (#11040)

    func handleSessionEvent(_ event: MediaSessionCoordinator.Event) {
        guard let signal = InterruptionResumeLedger.signal(for: event, isPlaying: wantsPlayback) else { return }
        switch interruptionLedger.handle(signal) {
        case .pause:
            guard wantsPlayback else { return }
            pauseForInterruption()
        case .resume:
            guard !MediaSessionCoordinator.shared.isCallActive else { return }
            resumePlayback()
        case .none:
            break
        }
    }

    /// Ce que dit un lecteur local qui ne joue plus alors que le tick tourne.
    enum StoppedTickVerdict: Equatable {
        /// Fin naturelle : la tête est revenue au début.
        case finished
        /// Arrêté en cours de route : le système l'a interrompu, la
        /// notification va suivre — rien ne se rend avant elle.
        case interrupted
    }

    nonisolated static func stoppedTickVerdict(currentTime: TimeInterval, duration: TimeInterval) -> StoppedTickVerdict {
        currentTime > 0 && currentTime < duration ? .interrupted : .finished
    }

    // MARK: - Progress Timer (local player only)
    //
    // 10 Hz tick (2026-05-28) — see `progressTickInterval` doc. Aucun délégué
    // n'est posé sur l'`AVAudioPlayer` : c'est CE tick qui constate la fin. À la
    // fin naturelle, `isPlaying` repasse à faux et `currentTime` revient à 0 —
    // le seuil `>= 1.0` n'est donc jamais atteint, et un lecteur qui ne joue plus
    // alors que le Timer tourne (la pause l'invalide) est une piste terminée ou
    // interrompue par le système : on arrête et on rend la session.

    fileprivate static let progressTickInterval: TimeInterval = 0.1
    fileprivate static let progressWriteThreshold: Double = 0.002

    private func startLocalProgressTimer() {
        timer?.invalidate()
        // Tire sur le run loop principal : pas de `Task` par tick (#9702).
        timer = Timer.scheduledTimer(withTimeInterval: Self.progressTickInterval, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.publishLocalProgressTick()
            }
        }
    }

    private func publishLocalProgressTick() {
        guard let player = localPlayer else { return }
        guard player.isPlaying else {
            switch Self.stoppedTickVerdict(currentTime: player.currentTime, duration: player.duration) {
            case .finished:
                stop()
            case .interrupted:
                // L'intention reste : c'est elle que la notification lira.
                timer?.invalidate()
                isPlaying = false
            }
            return
        }
        let newProgress = player.duration > 0 ? player.currentTime / player.duration : 0
        if newProgress >= 1.0 {
            stop()
            return
        }
        if abs(newProgress - progress) >= Self.progressWriteThreshold {
            progress = newProgress
        }
    }
}

private struct PlaybackResources {
    var timer: Timer?
    var loadTask: Task<Void, Never>?
    var localPlayer: AVAudioPlayer?
    var streamPlayer: AVPlayer?
    var streamObserver: Any?

    var holdsPlayers: Bool {
        localPlayer != nil || streamPlayer != nil
    }

    static func invalidateTimer(_ resources: inout PlaybackResources) {
        resources.timer?.invalidate()
    }

    static func releaseOffMain(_ resources: PlaybackResources) {
        resources.localPlayer?.stop()
        if let observer = resources.streamObserver, let player = resources.streamPlayer {
            player.removeTimeObserver(observer)
        }
        resources.streamPlayer?.pause()
        MediaSessionCoordinator.shared.deactivatePlaybackSync()
    }
}

// MARK: - Enregistrement (#11042)
extension AudioPlayerManager: AudiblePlaybackSource {
    /// Pendant un enregistrement, l'extrait qui joue baisse puis remonte.
    public var audibleVolumeTargets: [any PlaybackVolumeTarget] {
        guard isPlaying else { return [] }
        let local: [any PlaybackVolumeTarget] = localPlayer.map { [$0] } ?? []
        let stream: [any PlaybackVolumeTarget] = streamPlayer.map { [$0] } ?? []
        return local + stream
    }
}
