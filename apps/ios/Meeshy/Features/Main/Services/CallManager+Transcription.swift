import Foundation
import MeeshySDK
import os

// La capture de la transcription locale, réconciliée avec l'écoute de l'appel
// ET l'état du micro (#8475). Sortie de `CallManager.swift`, hors budget de
// taille, avant d'y recevoir le micro coupé.

extension CallManager {
    /// **Réconcilie la capture locale avec l'écoute RÉELLE de l'appel** —
    /// le nom « toggle » est historique : ce n'est plus le panneau local seul
    /// qui décide. Un device ne transcrit que son PROPRE micro (jamais l'audio
    /// distant), donc lier la capture au seul panneau local faisait de celui
    /// qui active les sous-titres un pur ÉMETTEUR : le pair recevait tout, lui
    /// ne recevait rien tant que le pair n'avait pas activé de son côté. C'est
    /// exactement le symptôme rapporté (« il reçoit mes transcriptions, je ne
    /// reçois pas les siennes »). La règle vit dans
    /// `TranscriptionCapturePolicy` ; appeler cette méthode est idempotent.
    ///
    /// Appelée par les DEUX entrées d'écoute : le panneau local
    /// (`CallView.advanceCaptionsMode`) et le signal du pair
    /// (`call:transcription-active`).
    func toggleTranscription() {
        publishListeningIntentIfChanged()
        switch TranscriptionCapturePolicy.action(
            localPanelOpen: transcriptionService.isShowingOverlay,
            peerCaptionsActive: remoteTranscriptionActive,
            isCapturing: transcriptionService.isTranscribing,
            isMicrophoneMuted: isMuted
        ) {
        case .stop:
            transcriptionService.stopTranscribing()
            return
        case .none:
            return
        case .start:
            break
        }
        guard let callId = currentCallId else { return }
        let localUser = AuthManager.shared.currentUser
        let localLang = CallManager.preferredCallLanguage(for: localUser)
        let localUserId = localUser?.id ?? ""
        let localDisplayName = localUser?.displayName ?? localUser?.username ?? ""
        // Chemin P2P du journal : chaque segment final part aussi sur le data
        // channel WebRTC quand il est ouvert (no-op silencieux sinon — le
        // relais socket reste systématique et le pair fusionne par wireId).
        transcriptionService.sendPeerEntry = { [weak self] entry in
            self?.webRTCService.sendTranscriptEntry(entry)
        }
        Task { @MainActor [weak self] in
            guard let self else { return }
            if self.transcriptionService.permission != .authorized {
                _ = await self.transcriptionService.requestPermission()
            }
            // Audit gateway-calls (2026-08-15) — re-valider APRÈS l'await.
            // `requestPermission()` suspend sur l'alerte système de
            // reconnaissance vocale, que l'utilisateur peut laisser ouverte
            // aussi longtemps qu'il veut : l'appel peut se terminer (ou être
            // remplacé par un rappel) entre-temps. `endCallInternal` a alors
            // déjà passé `resetForCallEnd`, et démarrer ici installerait un
            // tap micro + un moteur on-device que PLUS RIEN n'arrête du reste
            // de la session (ni appel, ni CallView, ni appelant de
            // `stopTranscribing`), en estampillant `call:transcription-active`
            // et chaque segment du callId d'un appel mort. Même garde
            // d'identité que tous les autres chemins post-await de ce fichier
            // (handleRemoteAnswer, answerCallReady, scheduleICERestart) et que
            // `applyRecognitionResult` côté réception.
            guard self.currentCallId == callId, self.callState.isActive else {
                Logger.calls.info("toggleTranscription abandonné — appel plus actif après le prompt de permission (callId=\(callId))")
                return
            }
            self.transcriptionService.startTranscribing(
                callId: callId,
                localLanguage: localLang,
                localUserId: localUserId,
                localDisplayName: localDisplayName
            )
        }
    }
}
