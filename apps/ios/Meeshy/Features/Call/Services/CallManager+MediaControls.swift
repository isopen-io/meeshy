import Foundation
import AVFoundation
@preconcurrency import CallKit
import Combine
import Network
import UIKit
import MeeshySDK
import MeeshyUI
@preconcurrency import WebRTC
import os

/// Les commandes média d'un appel : micro, haut-parleur, caméra (activation,
/// bascule avant/arrière, choix de l'appareil) et intention d'écoute.

extension CallManager {

    // MARK: - Media Controls

    /// `reportToCallKit` is `false` only when this call originates FROM
    /// CallKit itself (`CXSetMutedCallAction` delegate handler, e.g. Apple
    /// Watch / lock-screen / CarPlay mute) — in that case CallKit's state
    /// already reflects `isMuted`, and resubmitting a `CXSetMutedCallAction`
    /// transaction back to it would be an avoidable no-op round-trip
    /// answering CallKit's own notification. All other call sites (the
    /// in-app mute button) keep the default and DO report to CallKit, so its
    /// system UI (Watch, lock screen, CarPlay) stays in sync.
    func toggleMute(reportToCallKit: Bool = true) {
        // Audit P1-13 — keep optimistic UX (instant local flip) but rollback
        // local state + WebRTC if CallKit refuses the transaction. Without
        // the rollback, the app's `isMuted` and the WebRTC track were
        // permanently out of sync with CallKit's system mute UI — once
        // diverged, only a call hangup recovered it.
        isMuted.toggle()
        webRTCService.muteAudio(isMuted)
        // Broadcast the new mute state so the remote peer can update its
        // "muted" indicator. This must fire regardless of CallKit path (the
        // guard below returns early for Mac / foreground in-app calls).
        if let callId = currentCallId {
            MessageSocketManager.shared.emitCallToggleAudio(callId: callId, enabled: !isMuted)
        }

        guard reportToCallKit else {
            HapticFeedback.light()
            return
        }

        // CALL-FIX 2026-06-06 (macOS) — `CXSetMutedCallAction` fails on iOS-app-on-Mac
        // (CallKit requesttransaction error 4) and the rollback below then UNDOES the
        // mute → the mute button never sticks. On Mac the WebRTC track toggle above IS
        // the mute (no CallKit system UI), so short-circuit before the transaction.
        guard let uuid = activeCallUUID, callUsesCallKit else {
            // No CallKit (Mac / foreground in-app call) — the WebRTC track toggle
            // above IS the mute; skip CXSetMutedCallAction (it fails + rolls back).
            HapticFeedback.light()
            return
        }
        let muteAction = CXSetMutedCallAction(call: uuid, muted: isMuted)
        callController.request(CXTransaction(action: muteAction)) { error in
            if let error {
                // CALL-FIX 2026-06-06 — do NOT roll back the WebRTC mute when CallKit
                // refuses the transaction (CXSetMutedCallAction error 4). The WebRTC
                // track toggle above IS the real mute; the old rollback UN-muted the
                // user against their intent ("impossible de mute — ça fall back").
                // Keep the mute; CallKit's system UI may briefly desync but the audio
                // is correctly muted.
                Logger.calls.error("CallKit mute transaction failed (keeping WebRTC mute): \(error.localizedDescription)")
            }
        }

        HapticFeedback.light()
    }

    func toggleSpeaker() {
        // §7.8 — optimistic toggle, reverted on failure (`insufficientPriority`
        // under Bluetooth). #8735 — the route applies OFF the main thread.
        let previousSpeaker = isSpeaker
        isSpeaker.toggle()
        HapticFeedback.light()
        let intended = isSpeaker
        audio.applySpeakerRouteOffMain { [weak self] applied in
            guard let self, !applied, self.isSpeaker == intended else { return }
            self.isSpeaker = previousSpeaker
        }
    }

    /// Annonce aux pairs que ce device ÉCOUTE (panneau local ouvert) — jamais
    /// qu'il capture. La distinction est vitale : la capture démarre aussi
    /// pour servir un pair, donc l'annoncer depuis la capture faisait que deux
    /// devices s'entretenaient mutuellement (« l'autre est actif, je reste
    /// actif ») sans qu'aucun ne puisse plus s'arrêter. Piloté par le panneau,
    /// le signal reste la propriété du seul utilisateur local.
    func publishListeningIntentIfChanged() {
        guard let callId = currentCallId else { return }
        let isListening = transcriptionService.isShowingOverlay
        guard isListening != publishedListeningIntent else { return }
        publishedListeningIntent = isListening
        MessageSocketManager.shared.emitCallTranscriptionActive(callId: callId, active: isListening)
    }

    /// Un participant vient d'entrer : le gateway ne rejoue PAS les
    /// `call:transcription-active` émis avant son arrivée. Sans ce renvoi, un
    /// arrivant ignorerait que quelqu'un lit déjà, ne capturerait donc pas, et
    /// resterait muet pour tout le monde alors que l'appel a des lecteurs.
    func reannounceListeningIntent() {
        guard publishedListeningIntent, let callId = currentCallId else { return }
        MessageSocketManager.shared.emitCallTranscriptionActive(callId: callId, active: true)
    }

    var videoFilters: VideoFilterPipeline { webRTCService.videoFilters }
    var localVideoTrack: Any? { webRTCService.localVideoTrack }
    var remoteVideoTrack: Any? { webRTCService.remoteVideoTrack }

}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
