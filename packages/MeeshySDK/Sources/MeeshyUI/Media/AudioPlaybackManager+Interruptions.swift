import AVFoundation
import Combine
import UIKit
import MeeshySDK

// MARK: - Interruptions (#11040)
//
// Un appel qui arrive, une autre app qui lance un son : le son se met en
// pause, et reprend là où il s'était arrêté quand l'interruption se termine —
// ou, sans signal de fin, au retour dans Meeshy quand plus rien d'autre ne
// joue. La décision appartient à `InterruptionResumeLedger`.

extension AudioPlaybackManager {

    func observeSessionInterruptions() {
        MediaSessionCoordinator.shared.observeSystemEvents()
        MediaSessionCoordinator.shared.events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.handleSessionEvent(event) }
            .store(in: &sessionSignalCancellables)
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.handleReturnToForeground() }
            .store(in: &sessionSignalCancellables)
    }

    func handleSessionEvent(_ event: MediaSessionCoordinator.Event) {
        guard respondsToSessionInterruptions,
              let signal = InterruptionResumeLedger.signal(for: event, isPlaying: isPlaying) else { return }
        applyInterruptionAction(interruptionLedger.handle(signal))
    }

    func handleReturnToForeground() {
        guard respondsToSessionInterruptions, interruptionLedger.holdsInterruptedPlayback else { return }
        applyInterruptionAction(interruptionLedger.handle(.returnedToForeground(
            otherAudioPlaying: otherAudioIsPlaying(), contentStillOnScreen: currentUrl != nil
        )))
    }

    private func applyInterruptionAction(_ action: InterruptionResumeLedger.Action) {
        switch action {
        case .pause:
            pause()
        case .resume:
            guard !MediaSessionCoordinator.shared.isCallActive else { return }
            resumeFromInterruption()
        case .none:
            break
        }
    }
}
