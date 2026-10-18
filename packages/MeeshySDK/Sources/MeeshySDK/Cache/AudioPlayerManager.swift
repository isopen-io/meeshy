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

    private static let log = os.Logger(subsystem: "me.meeshy.app", category: "audio-playback")

    private var localPlayer: AVAudioPlayer? {
        didSet { cleanupHandle.localPlayer = localPlayer }
    }
    private var streamPlayer: AVPlayer? {
        didSet { cleanupHandle.streamPlayer = streamPlayer }
    }
    private var timer: Timer? {
        didSet { cleanupHandle.timer = timer }
    }
    private var loadTask: Task<Void, Never>? {
        didSet { cleanupHandle.loadTask = loadTask }
    }
    private var streamObserver: Any? {
        didSet { cleanupHandle.streamObserver = streamObserver }
    }
    private var streamCancellables = Set<AnyCancellable>()

    /// Handles thread-safe à libérer depuis le `deinit` (potentiellement
    /// off-main) — pattern `AudioPlaybackManager.CleanupHandle`. Sans ce
    /// filet, une instance lâchée mid-lecture (vue dismissée sans `stop()`)
    /// laissait le Timer 10 Hz au run loop pour toujours et l'observer
    /// périodique jamais retiré de l'AVPlayer (contrat AVFoundation violé).
    /// `@unchecked Sendable` : champs mutés uniquement depuis MainActor,
    /// lus une fois par le bloc de cleanup.
    private final class CleanupHandle: @unchecked Sendable {
        nonisolated(unsafe) var timer: Timer?
        nonisolated(unsafe) var loadTask: Task<Void, Never>?
        nonisolated(unsafe) var localPlayer: AVAudioPlayer?
        nonisolated(unsafe) var streamPlayer: AVPlayer?
        nonisolated(unsafe) var streamObserver: Any?
    }
    private let cleanupHandle = CleanupHandle()

    public init() {}

    deinit {
        cleanupHandle.timer?.invalidate()
        cleanupHandle.loadTask?.cancel()
        // Player non-nil ⟺ mort sans `stop()` (stop pose nil partout) : on
        // coupe la lecture et on rend la session (call-aware), sinon elle
        // restait active pour tout le process. Déporté sur une queue utility :
        // `setActive(false)` est un appel HAL bloquant et ce dealloc arrive
        // typiquement sur le main thread pendant un scroll.
        guard cleanupHandle.localPlayer != nil || cleanupHandle.streamPlayer != nil else { return }
        let handle = cleanupHandle
        DispatchQueue.global(qos: .utility).async {
            handle.localPlayer?.stop()
            if let observer = handle.streamObserver, let player = handle.streamPlayer {
                player.removeTimeObserver(observer)
            }
            handle.streamPlayer?.pause()
            MediaSessionCoordinator.shared.deactivatePlaybackSync()
        }
    }

    // MARK: - Play from URL string

    public func play(urlString: String) {
        // Enchaîner : la session `.playback` reste tenue, elle est reprise juste en dessous.
        halt()

        guard !urlString.isEmpty else { return }

        onWillPlay?()

        // Session de lecture via la source UNIQUE (call-aware) : ne stomp PAS un appel
        // VoIP actif (sinon micro coupé). Options [] = pas de ducking (parité avec le
        // comportement preview historique de ce player du composer story).
        MediaSessionCoordinator.shared.activatePlaybackSync(options: [])
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

        // Session de lecture via la source UNIQUE (call-aware) — cf. play(urlString:).
        MediaSessionCoordinator.shared.activatePlaybackSync(options: [])
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
        if let localPlayer {
            if localPlayer.isPlaying {
                localPlayer.pause()
                isPlaying = false
                timer?.invalidate()
            } else {
                onWillPlay?()
                localPlayer.play()
                isPlaying = true
                startLocalProgressTimer()
            }
        } else if let streamPlayer {
            if isPlaying {
                streamPlayer.pause()
            } else {
                onWillPlay?()
                streamPlayer.play()
            }
            // isPlaying updated by rate observer
        }
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
            stop()
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
