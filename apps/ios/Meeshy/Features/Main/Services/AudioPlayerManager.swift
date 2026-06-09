import Foundation
import Combine
import AVFoundation
import SwiftUI
import MeeshySDK
import MeeshyUI

@MainActor
class AudioPlayerManager: NSObject, ObservableObject, StoppablePlayer, AVAudioPlayerDelegate {
    @Published var isPlaying = false
    @Published var progress: Double = 0 // 0-1
    @Published var duration: TimeInterval = 0

    private var player: AVAudioPlayer?
    private var timer: Timer?
    private var loadTask: Task<Void, Never>?
    private var isRegistered = false
    private var mediaEventsCancellable: AnyCancellable?

    /// Unification Étape C — cette session est désormais routée via le
    /// `MediaSessionCoordinator` (source unique, refcomptée, call-aware via
    /// l'Étape B) au lieu d'un `setCategory`/`setActive` direct. Le flag rend
    /// l'acquisition/libération idempotente : `play()` ne libère PAS la session
    /// (resetPlayback) puis ré-acquiert (no-op si déjà tenue) → pas de churn
    /// release→request. Seul `stop()` libère réellement.
    private var sessionRequested = false

    override init() {
        super.init()
        // Subscribe once to audio session events so interruptions (phone
        // calls, Siri) and route changes (AirPods unplugged) pause playback
        // instead of leaving the player in a bad state that would crash
        // when resumed from background.
        mediaEventsCancellable = MediaSessionCoordinator.shared.events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleSessionEvent(event)
            }
    }

    private func handleSessionEvent(_ event: MediaSessionCoordinator.Event) {
        switch event {
        case .interruptionBegan, .routeChangedOldDeviceUnavailable:
            if isPlaying {
                player?.pause()
                isPlaying = false
                timer?.invalidate()
            }
        case .interruptionEndedShouldResume:
            // Do not auto-resume from an audio message — user controls it.
            break
        case .interruptionEndedShouldNotResume, .routeChangedOther:
            break
        }
    }

    // MARK: - Audio session (routed through the single MediaSessionCoordinator)

    /// Acquiert la session `.playback` via le coordinator (idempotent). Le
    /// coordinator pose `.playback/.default/[.duckOthers]` — config identique à
    /// l'ancien `setCategory` direct — et, étant call-aware (Étape B), NE TOUCHE
    /// PAS la session pendant un appel VoIP (plus besoin de la garde CallManager
    /// inline ici). Awaité dans le `loadTask` AVANT `playData` → session active
    /// avant la lecture, sans race.
    private func acquireSession() async {
        guard !sessionRequested else { return }
        sessionRequested = true
        try? await MediaSessionCoordinator.shared.request(role: .playback)
    }

    /// Libère la session via le coordinator (refcompté : ne désactive réellement
    /// qu'au refcount 0). No-op si déjà libérée.
    private func releaseSession() {
        guard sessionRequested else { return }
        sessionRequested = false
        Task { await MediaSessionCoordinator.shared.release() }
    }

    // MARK: - Play from URL string

    func play(urlString: String) {
        resetPlayback()

        guard !urlString.isEmpty else { return }

        registerIfNeeded()
        PlaybackCoordinator.shared.willStartPlaying(external: self)

        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        loadTask = Task {
            await acquireSession()
            guard !Task.isCancelled else { return }
            do {
                let data = try await CacheCoordinator.shared.audio.data(for: resolved)
                guard !Task.isCancelled else { return }
                playData(data)
            } catch {}
        }
    }

    // MARK: - Play from local file URL

    func playLocalFile(url: URL) {
        resetPlayback()

        registerIfNeeded()
        PlaybackCoordinator.shared.willStartPlaying(external: self)

        loadTask = Task {
            await acquireSession()
            guard !Task.isCancelled else { return }
            do {
                let data = try Data(contentsOf: url)
                playData(data)
            } catch {}
        }
    }

    private func playData(_ data: Data) {
        do {
            let newPlayer = try AVAudioPlayer(data: data)
            newPlayer.delegate = self
            newPlayer.prepareToPlay()
            player = newPlayer
            duration = newPlayer.duration
            newPlayer.play()
            isPlaying = true
            startProgressTimer()
        } catch {}
    }

    // MARK: - AVAudioPlayerDelegate

    nonisolated func audioPlayerDidFinishPlaying(_ audioPlayer: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in
            self?.stop()
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ audioPlayer: AVAudioPlayer, error: Error?) {
        Task { @MainActor [weak self] in
            self?.stop()
        }
    }

    // MARK: - Controls

    /// Arrête le player et nettoie l'état SANS libérer la session — utilisé par
    /// `play()` pour une relecture immédiate (la session est ré-acquise juste
    /// après, idempotemment). Évite le churn release→request.
    private func resetPlayback() {
        player?.stop()
        player = nil
        timer?.invalidate()
        timer = nil
        isPlaying = false
        progress = 0
        loadTask?.cancel()
        loadTask = nil
    }

    func stop() {
        resetPlayback()
        // Libère la session partagée via le coordinator (call-aware : ne
        // désactive pas pendant un appel ; refcompté : seulement au refcount 0).
        releaseSession()
    }

    func togglePlayPause() {
        guard let player = player else { return }
        if player.isPlaying {
            player.pause()
            isPlaying = false
            timer?.invalidate()
        } else {
            registerIfNeeded()
            PlaybackCoordinator.shared.willStartPlaying(external: self)
            // La session est toujours tenue depuis le `play()` initial (la pause
            // ne la libère pas) → reprise directe sans ré-acquisition.
            player.play()
            isPlaying = true
            startProgressTimer()
        }
    }

    // MARK: - Coordinator Registration

    private func registerIfNeeded() {
        guard !isRegistered else { return }
        PlaybackCoordinator.shared.registerExternal(self)
        isRegistered = true
    }

    deinit {
        // Cleanup handled by weak references in coordinator
    }

    // MARK: - Progress Timer
    //
    // 10 Hz tick (2026-05-28). Same perf rationale as the SDK engine
    // (see `MeeshyUI.AudioPlaybackManager.progressTickInterval`): the
    // 20 Hz tick burned CPU + Combine cascade cycles for sub-perceptible
    // updates. Coupled with a write-threshold of 0.002 to collapse
    // redundant `@Published` emissions.

    private static let progressTickInterval: TimeInterval = 0.1
    private static let progressWriteThreshold: Double = 0.002

    private func startProgressTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: Self.progressTickInterval, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self, let player = self.player else { return }
                guard player.isPlaying else { return }
                let newProgress = player.duration > 0 ? player.currentTime / player.duration : 0
                if newProgress >= 1.0 {
                    self.stop()
                    return
                }
                if abs(newProgress - self.progress) >= Self.progressWriteThreshold {
                    self.progress = newProgress
                }
            }
        }
    }
}
