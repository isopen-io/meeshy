#if os(iOS)
import AVFoundation
import Foundation

/// La session d'enregistrement, vue de `MeeshyRecordingSession` (#11042).
extension MediaSessionCoordinator: RecordingSessionControlling {

    public nonisolated func configureRecordingSession(
        _ configuration: RecordingSessionConfiguration,
        holding: Bool
    ) -> Bool {
        activateRecordingSync(configuration, holding: holding)
    }

    public nonisolated func releaseRecordingHold() {
        recordingHoldsSession = false
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
            let category = AVAudioSession.sharedInstance().category
            guard RecordingSessionLaw.mayReleaseSession(currentCategory: category) else { return }
            deactivatePlaybackSync()
        }
    }
}
#endif
