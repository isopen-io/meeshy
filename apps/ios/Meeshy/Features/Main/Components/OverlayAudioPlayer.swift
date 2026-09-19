import Foundation
import Combine
import AVFoundation
import MeeshySDK

/// Le lecteur audio de l'aperçu d'appui long — un `AVPlayer` enveloppé, cache
/// d'abord, piloté par `MessageOverlayMenu` et `MessageOverlayAudioPreview`.
///
/// ## Pourquoi il vit ici depuis #7005
///
/// Il vivait au bas de `MessageOverlayMenu.swift`, hôte déjà HORS BUDGET
/// (1 434 lignes pour un plafond dur de 1 200). La directive est explicite :
/// « Ajouter à un fichier déjà hors budget est interdit : on extrait d'abord,
/// on ajoute ensuite. » Corriger `stop()` demandait cinq lignes de plus — donc
/// l'extraction d'abord, et par RESPONSABILITÉ plutôt que par tranche : un
/// lecteur média n'a rien à faire dans le fichier d'un menu contextuel, et il
/// devient du même coup ÉPROUVABLE (il était `private`, donc hors de portée de
/// tout témoin).
///
/// ## `stop()` est IDEMPOTENT, et ce n'est pas une élégance
///
/// `@Published` publie sur `willSet` — valeur changée ou non. Un `stop()` qui
/// ré-assigne cinq propriétés sur un lecteur déjà arrêté émet donc cinq
/// `objectWillChange` pour rien. Aujourd'hui `stop()` n'est atteint que depuis
/// `onDisappear` et depuis `toggle(url:)` sur changement de piste, donc le
/// défaut coûte des rendus ; le jour où un représentable l'appellera pendant
/// une mise à jour de vue, il rejouera #6977 à l'identique : « Publishing
/// changes from within view updates », SwiftUI qui abandonne ses rendus, et
/// l'écran qui reste VIERGE plusieurs secondes.
///
/// > La forme gardée (`if x != valeur { x = valeur }`) est celle
/// > d'`AudioPlaybackManager.resetState()` et de
/// > `SharedAVPlayerManager.cleanup()`, corrigés par #6977. Ce lecteur-ci est
/// > le troisième à la recevoir, et `MediaResetIdempotenceGuardTests` tient
/// > désormais l'inventaire pour que le quatrième naisse gardé.

@MainActor
final class OverlayAudioPlayer: ObservableObject {
    @Published var isPlaying = false
    @Published var progress: Double = 0
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var playbackRate: Float = 1.0
    @Published var isLoading = false

    nonisolated(unsafe) private var avPlayer: AVPlayer?
    nonisolated(unsafe) private var timeObserver: Any?
    nonisolated(unsafe) private var statusObservation: NSKeyValueObservation?
    /// Token for the `.AVPlayerItemDidPlayToEndTime` block observer. Held so
    /// `deinit` can remove it: `removeObserver(self)` does NOT remove block-based
    /// observers (their "observer" is this returned token, not `self`), so
    /// without it the observer leaked once per playback / per preview.
    nonisolated(unsafe) private var endObserver: (any NSObjectProtocol)?
    private var currentURL: String?

    var percentInt: Int { Int(progress * 100) }

    func toggle(url: String) {
        if isPlaying {
            avPlayer?.pause()
            isPlaying = false
            return
        }

        if currentURL != url {
            stop()
            currentURL = url
            isLoading = true
            Task { [weak self] in
                await self?.startPlayback(remoteURL: url)
            }
            return
        }

        avPlayer?.rate = playbackRate
        isPlaying = true
    }

    /// Cache-first: consults the audio disk cache BEFORE falling back to a
    /// network `AVPlayerItem`. The preview used to always hit the network
    /// URL directly, ignoring whatever `AttachmentDownloader`/auto-download
    /// already saved to disk — re-downloading the same audio and failing
    /// outright offline even when the file was sitting in the cache the
    /// in-conversation bubble already plays from.
    ///
    /// Resolution key mirrors the existing local-first pattern in
    /// `AudioFullscreenView.runLocalTranscription`: resolve the (possibly
    /// relative) URL to its absolute form first, THEN look that resolved
    /// string up in the disk cache — the cache is keyed by the resolved
    /// URL, not the raw attachment path.
    private func startPlayback(remoteURL: String) async {
        let resolvedString = MeeshyConfig.resolveMediaURL(remoteURL)?.absoluteString ?? remoteURL
        let cachedLocalURL = try? await CacheCoordinator.shared.audio.localFileURLOrThrow(for: resolvedString)
        // A rapid second tap may have already switched `currentURL` to a
        // different attachment while this lookup was in flight — bail
        // rather than starting playback for a track the user isn't on
        // anymore.
        guard currentURL == remoteURL else { return }
        guard let playbackURL = cachedLocalURL ?? MeeshyConfig.resolveMediaURL(remoteURL) else {
            isLoading = false
            return
        }

        let item = AVPlayerItem(url: playbackURL)
        avPlayer = AVPlayer(playerItem: item)

        statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                if item.status == .readyToPlay {
                    self.isLoading = false
                    self.avPlayer?.rate = self.playbackRate
                    self.isPlaying = true
                } else if item.status == .failed {
                    self.isLoading = false
                }
            }
        }

        setupTimeObserver()
        observeEnd(item: item)
    }

    /// Chaque `@Published` n'est ré-assigné QUE s'il change — voir le
    /// doc-comment du type : `@Published` publie sur `willSet`, valeur changée
    /// ou non, et un lecteur déjà arrêté publiait cinq fois pour rien (#7005,
    /// jumeau d'`AudioPlaybackManager.resetState` et de
    /// `SharedAVPlayerManager.cleanup`, #6977).
    func stop() {
        avPlayer?.pause()
        if let obs = timeObserver { avPlayer?.removeTimeObserver(obs) }
        timeObserver = nil
        statusObservation?.invalidate()
        statusObservation = nil
        avPlayer = nil
        currentURL = nil
        if isPlaying { isPlaying = false }
        if isLoading { isLoading = false }
        if progress != 0 { progress = 0 }
        if currentTime != 0 { currentTime = 0 }
        if duration != 0 { duration = 0 }
    }

    func seek(to fraction: Double) {
        guard let player = avPlayer, let item = player.currentItem else { return }
        let total = item.duration.seconds
        guard total.isFinite && total > 0 else { return }
        let target = CMTime(seconds: fraction * total, preferredTimescale: 600)
        player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero)
        progress = fraction
        currentTime = fraction * total
    }

    func skip(seconds: Double) {
        guard let player = avPlayer else { return }
        let current = player.currentTime().seconds
        let total = player.currentItem?.duration.seconds ?? 0
        guard total.isFinite && total > 0 else { return }
        let newTime = max(0, min(total, current + seconds))
        player.seek(to: CMTime(seconds: newTime, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        currentTime = newTime
        progress = newTime / total
    }

    func setRate(_ rate: Float) {
        playbackRate = rate
        if isPlaying {
            avPlayer?.rate = rate
        }
    }

    func timeLabel(totalDuration: Int?) -> String {
        let current = formatTime(currentTime)
        let total = formatTime(totalSeconds(fallback: totalDuration))
        return "\(current) / \(total)"
    }

    /// Ce qu'un indice VoiceOver DIT de cet audio : sa longueur, en toutes
    /// lettres. L'indice servait `timeLabel` — deux horloges séparées d'une
    /// barre oblique (« 0:12 / 1:30 »), que le synthétiseur lit comme deux
    /// heures. Un indice se lit une fois, après le libellé : la POSITION
    /// courante n'y a rien à faire, seule la durée totale renseigne.
    func spokenTotalDuration(totalDuration: Int?) -> String {
        LocalizedNumber.spokenDuration(seconds: totalSeconds(fallback: totalDuration))
    }

    private func totalSeconds(fallback: Int?) -> TimeInterval {
        duration > 0 ? duration : TimeInterval(fallback ?? 0)
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        LocalizedNumber.duration(seconds: seconds)
    }

    private func setupTimeObserver() {
        let interval = CMTime(seconds: 0.1, preferredTimescale: 600)
        timeObserver = avPlayer?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor [weak self] in
                guard let self, let item = self.avPlayer?.currentItem else { return }
                let total = item.duration.seconds
                guard total.isFinite && total > 0 else { return }
                self.duration = total
                self.currentTime = time.seconds
                self.progress = time.seconds / total
            }
        }
    }

    private func observeEnd(item: AVPlayerItem) {
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item, queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.isPlaying = false
                self?.progress = 0
                self?.currentTime = 0
                self?.avPlayer?.seek(to: .zero)
            }
        }
    }

    deinit {
        if let obs = timeObserver { avPlayer?.removeTimeObserver(obs) }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        NotificationCenter.default.removeObserver(self)
    }
}
