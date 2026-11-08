import Foundation
@preconcurrency import CallKit
import MeeshySDK
import os

// OPUS-5 — « Répondre sans vidéo » : décrocher un appel vidéo caméra coupée.
// Dans son propre type : `CallManager` est hors budget de cohésion, il n'y
// porte que deux points de branchement (le bouton de l'écran entrant, et la
// réponse SDP qui retire la caméra avant `createAnswer`).

@MainActor
struct CallAnswerWithoutVideo {
    unowned let call: CallManager

    private static let logger = MeeshyLog.logger(.calls)

    /// L'intention est posée AVANT toute réponse SDP ; `answerBufferedOffer`
    /// retire ensuite la caméra avant `createAnswer`, de sorte qu'aucune image
    /// ne part jamais au pair.
    func answer() {
        guard case .ringing(isOutgoing: false) = call.callState, call.currentCallId != nil else { return }
        if call.isVideoEnabled {
            Self.logger.info("[CALL] answering without video")
            call.isVideoEnabled = false
        }
        call.answerCall()
    }

    /// La caméra ouverte à la sonnerie (vignette de l'écran entrant) est
    /// retirée AVANT `createAnswer`, pour que la réponse annonce la vidéo en
    /// réception seule et que rien ne parte au pair. Le pair est prévenu
    /// (`call:media-toggled`) pour afficher notre avatar, et CallKit range
    /// l'appel en audio. Sans effet quand la vidéo est voulue ou qu'aucune
    /// caméra n'a démarré (appel audio, caméra refusée).
    func withholdLocalVideoIfDeclined(callId: String) async {
        guard !call.isVideoEnabled, call.webRTCService.localVideoTrack != nil, call.currentCallId == callId else { return }
        _ = await call.webRTCService.downgradeFromVideo()
        guard call.currentCallId == callId else { return }
        call.hasLocalVideoTrack = call.webRTCService.hasLocalVideoTrack
        call.audio.updateAudioSessionModeForCurrentVideoState()
        MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
        if let uuid = call.activeCallUUID, call.callUsesCallKit {
            let update = CXCallUpdate()
            update.hasVideo = false
            call.callProvider.reportCall(with: uuid, updated: update)
        }
        Self.logger.info("[CALL] local video withheld before answer: \(callId)")
    }
}
