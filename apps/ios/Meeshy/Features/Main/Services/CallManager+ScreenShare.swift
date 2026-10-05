import Foundation
import os

// #8063 — `CallManager` vu du partage d'écran. Dans son propre fichier :
// `CallManager.swift` est hors budget de taille, il n'y porte que la
// propriété et les quatre points de branchement (réception, réinitialisation,
// ré-annonce, garde de la caméra).

extension CallManager: CallScreenShareHosting {
    var screenShareCallId: String? {
        callState.isActive ? currentCallId : nil
    }

    /// La caméra ne revient que si l'utilisateur la voulait ET qu'elle émettait.
    var screenShareRestoresCamera: Bool {
        isVideoEnabled && hasLocalVideoTrack
    }

    var screenShareRouter: (any ScreenShareVideoRouting)? {
        webRTCService
    }

    /// Même chemin que la bascule audio → vidéo (§5.4) : l'émetteur vidéo a
    /// changé de direction, le pair doit recevoir une offre pour commencer
    /// (ou cesser) de recevoir la piste.
    func screenShareNeedsRenegotiation() async {
        guard let callId = currentCallId,
              let userId = remoteUserId,
              let offer = await webRTCService.createOffer(),
              currentCallId == callId else { return }
        emitCallOffer(callId: callId, toUserId: userId, isVideo: true, sdp: offer)
        Logger(subsystem: "me.meeshy.app", category: "screen-share")
            .info("screen share renegotiation offer sent (callId=\(callId))")
    }

    func makeScreenShareController() -> CallScreenShareController {
        let controller = CallScreenShareController()
        controller.host = self
        controller.forwardChanges(to: objectWillChange)
        return controller
    }
}
