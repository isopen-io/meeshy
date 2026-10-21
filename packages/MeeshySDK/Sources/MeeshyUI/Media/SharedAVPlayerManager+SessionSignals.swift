import AVFoundation
import Combine
import UIKit
import MeeshySDK

// MARK: - Interruptions (#11040)
//
// Un appel qui arrive, une autre app qui lance un son : la vidéo — en ligne,
// plein écran ou en PiP — se met en pause, et reprend là où elle s'était
// arrêtée quand l'interruption se termine. La décision appartient à
// `InterruptionResumeLedger` ; ce moteur ne fait que traduire et appliquer.

extension SharedAVPlayerManager {

    /// Le lecteur à baisser pendant un enregistrement (#11042) : la vidéo — en
    /// ligne, plein écran ou en PiP — qui joue avec le son.
    var audibleVolumeTarget: (any PlaybackVolumeTarget)? {
        guard isPlaying, !effectiveMuted, let player else { return nil }
        return player
    }

    func observeSessionSignals() {
        MediaSessionCoordinator.shared.observeSystemEvents()
        MediaSessionCoordinator.shared.events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.handleSessionEvent(event) }
            .store(in: &sessionSignalCancellables)
        // Reprise sans signal de fin : la vidéo d'une autre app n'en envoie
        // presque jamais. Au retour dans Meeshy, plus aucun autre son ⇒ la
        // vidéo interrompue reprend, si elle est toujours là.
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.handleReturnToForeground() }
            .store(in: &sessionSignalCancellables)
        observeRateForOutsideControls()
    }

    /// Les commandes du PiP et de l'écran verrouillé agissent sur le lecteur
    /// SANS passer par `play()` / `pause()` : l'intention se relit sur le
    /// débit. Un arrêt n'est conclu « pause de l'utilisateur » qu'après un
    /// court délai sans interruption — le système arrête aussi le lecteur au
    /// début d'une interruption, et sa notification peut arriver après.
    private func observeRateForOutsideControls() {
        $player
            .map { player -> AnyPublisher<Float, Never> in
                player.map { $0.publisher(for: \.rate).eraseToAnyPublisher() } ?? Empty().eraseToAnyPublisher()
            }
            .switchToLatest()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] rate in self?.noteObservedRate(rate) }
            .store(in: &sessionSignalCancellables)
    }

    func noteObservedRate(_ rate: Float) {
        guard rate == 0 else {
            if player != nil { wantsPlayback = true }
            return
        }
        guard wantsPlayback else { return }
        Task { @MainActor [weak self] in
            guard await cancellableSleep(for: .milliseconds(500)) else { return }
            guard let self, self.wantsPlayback, (self.player?.rate ?? 0) == 0,
                  !self.interruptionLedger.holdsInterruptedPlayback else { return }
            self.wantsPlayback = false
            self.noteSessionSignal(.userPaused)
            // Pause du PiP ou de l'écran verrouillé : Meeshy rend la main
            // comme après toute pause (#11040, j).
            self.releaseSessionAfterPause()
        }
    }

    func handleSessionEvent(_ event: MediaSessionCoordinator.Event) {
        guard let signal = InterruptionResumeLedger.signal(for: event, isPlaying: wantsPlayback) else { return }
        applyInterruptionAction(interruptionLedger.handle(signal))
    }

    func handleReturnToForeground() {
        guard interruptionLedger.holdsInterruptedPlayback else { return }
        applyInterruptionAction(interruptionLedger.handle(.returnedToForeground(
            otherAudioPlaying: otherAudioIsPlaying(), contentStillOnScreen: player != nil
        )))
    }

    func noteSessionSignal(_ signal: InterruptionResumeLedger.Signal) {
        _ = interruptionLedger.handle(signal)
    }

    private func applyInterruptionAction(_ action: InterruptionResumeLedger.Action) {
        switch action {
        case .pause:
            guard wantsPlayback || isPlaying else { return }
            haltForPause()
        case .resume:
            // Pendant un appel Meeshy, la session appartient à l'appel.
            guard !MediaSessionCoordinator.shared.isCallActive else { return }
            play()
        case .none:
            break
        }
    }
}
