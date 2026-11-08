#if os(iOS)
import AVFoundation
import Foundation

/// La session d'enregistrement, vue de `MeeshyRecordingSession` (#11042).
/// Tout passe par `sessionQueue`, à son rang (#17038) : une prise rendue juste
/// après sa demande passe APRÈS la pose de la session, jamais avant.
extension MediaSessionCoordinator: RecordingSessionControlling {

    public nonisolated func configureRecordingSession(
        _ configuration: RecordingSessionConfiguration,
        holding: Bool,
        completion: @escaping @MainActor @Sendable (Bool) -> Void
    ) {
        activateRecording(configuration, holding: holding, completion: completion)
    }

    public nonisolated func releaseRecordingHold() {
        onSessionQueue { [self] in recordingHoldsSession = false }
    }

    /// Un son Meeshy qui joue encore retrouve sa session de lecture (le micro
    /// se libère, PiP et arrière-plan gardent leur son) ; sinon la session se
    /// rend avec `.notifyOthersOnDeactivation`. Call-aware, comme les deux
    /// chemins qu'elle emprunte.
    public nonisolated func handBackSession(_ handBack: RecordingSessionHandBack) {
        switch handBack {
        case .returnToContentPlayback:
            activateContentPlayback(.audible)
        case .releaseSession:
            onSessionQueue { [self] in
                guard RecordingSessionLaw.mayReleaseSession(currentCategory: audioSession.category) else { return }
                performPlaybackDeactivation()
            }
        }
    }
}
#endif
