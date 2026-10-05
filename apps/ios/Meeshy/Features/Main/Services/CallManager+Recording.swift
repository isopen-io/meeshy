import Foundation

// #8064 — `CallManager` vu de l'enregistrement d'appel. Dans son propre
// fichier : `CallManager.swift` est hors budget de taille, il n'y porte que la
// propriété et la remise à zéro de fin d'appel.

extension CallManager: CallRecordingHosting {
    var recordingCallId: String? {
        callState.isActive ? currentCallId : nil
    }

    /// Le bouton ne s'offre qu'une fois l'appel établi : avant, il n'y a
    /// personne à qui demander son accord.
    var mayRequestRecording: Bool {
        callState == .connected && currentCallId != nil
    }

    func makeRecordingController() -> CallRecordingController {
        let controller = CallRecordingController()
        controller.host = self
        controller.forwardChanges(to: objectWillChange)
        return controller
    }
}
