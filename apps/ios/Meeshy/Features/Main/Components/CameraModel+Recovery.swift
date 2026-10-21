import AVFoundation
import os
import MeeshySDK

/// **Une session arrêtée sans qu'on le demande repart d'elle-même** (#10308,
/// directive porteur 2026-10-12 : « la caméra selfie bogue et se fige »).
///
/// Une bascule d'objectif reconfigure la session pendant que l'écran éclaire le
/// selfie, que la vue Metal peint le look et que la bande peint ses miniatures :
/// c'est le profil où AVFoundation lève une erreur d'exécution ou interrompt la
/// session (pression système). Il ne la relance JAMAIS : `isRunning` retombe,
/// plus aucune trame n'arrive, et les deux surfaces gardent leur dernière image
/// — un flux figé, sans message, où la photo et la vidéo refusent en silence.
/// Rien ne guettait ces trois avis ; ils relancent désormais la session si le
/// viseur la veut encore, et la console dit pourquoi elle s'était arrêtée.
extension CameraModel {

    func observeSessionHealth() {
        guard sessionObservers.isEmpty else { return }
        let centre = NotificationCenter.default
        let erreur = centre.addObserver(forName: AVCaptureSession.runtimeErrorNotification,
                                        object: session, queue: .main) { [weak self] avis in
            let code = (avis.userInfo?[AVCaptureSessionErrorKey] as? NSError)?.code ?? 0
            MainActor.assumeIsolated { self?.resumeStalledSession(reason: "runtime error \(code)") }
        }
        let interruption = centre.addObserver(forName: AVCaptureSession.wasInterruptedNotification,
                                              object: session, queue: .main) { [weak self] avis in
            let raison = (avis.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int) ?? -1
            Logger.media.notice("composer capture session interrupted: reason \(raison, privacy: .public)")
            MainActor.assumeIsolated { self?.liveFeed.flush() }
        }
        let reprise = centre.addObserver(forName: AVCaptureSession.interruptionEndedNotification,
                                         object: session, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.resumeStalledSession(reason: "interruption ended") }
        }
        sessionObservers = [erreur, interruption, reprise]
    }

    /// La dernière trame retourne au pool, et la session repart si on la veut.
    func resumeStalledSession(reason: String) {
        Logger.media.error("composer capture session stalled: \(reason, privacy: .public)")
        liveFeed.flush()
        sessionQueue.resumeIfWanted(session)
    }
}
