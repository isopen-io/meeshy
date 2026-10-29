import Foundation
import MeeshySDK
import os

// La capture de la transcription locale, réconciliée avec l'écoute de l'appel
// ET l'état du micro (#8475). Sortie de `CallManager.swift`, hors budget de
// taille, avant d'y recevoir le micro coupé.

extension CallManager {
    /// **Réconcilie la capture locale avec l'écoute RÉELLE de l'appel** (le
    /// nom « toggle » est historique) : un device ne transcrit que son PROPRE
    /// micro, il capture donc dès que quelqu'un écoute — son panneau ou un
    /// pair (`call:transcription-active`). Règle : `TranscriptionCapturePolicy`.
    /// Idempotente. #13720 — une conversation chiffrée de bout en bout, ou au
    /// régime illisible, n'annonce rien et ne capture rien (`CallCaptionsGate`).
    func toggleTranscription() {
        guard transcriptionService.admitsCaptions(conversationId: conversationId, onSettled: { [weak self] in self?.toggleTranscription() }) else {
            return CallCaptionsRefusal.settle(
                service: transcriptionService,
                publishListeningIntent: { publishListeningIntentIfChanged() },
                tellUser: { FeedbackToastManager.shared.showError($0) }
            )
        }
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

fileprivate extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
