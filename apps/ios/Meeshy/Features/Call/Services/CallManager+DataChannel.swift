import Foundation
import MeeshySDK
import os

// Le canal de données de la liaison principale : le raccroché in-band (`bye`)
// et le journal de transcription en P2P direct. Sorti de `CallManager.swift`,
// hors budget de taille, pour recevoir #9085.

extension CallManager {
    nonisolated func webRTCService(_ service: WebRTCService, didReceiveTranscriptionData data: Data) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            switch DataChannelInbound.decode(data) {
            case .bye(let reason):
                // Raccroché in-band du pair : coupure IMMÉDIATE, sans attendre
                // le fanout serveur `call:ended` (qui suit et se dédup via le
                // garde `.ended` de handleRemoteEnd). En groupe, le départ du
                // principal ne finit pas l'appel s'il reste des membres (#9085).
                guard let callId = self.currentCallId else { return }
                Logger.calls.info("DataChannel bye received (callId=\(callId))")
                self.handleRemoteBye(callId: callId, rawReason: reason)
            case .transcriptEntry(let entry):
                // Journal de transcription en P2P direct : même garde d'appel
                // que le sink du relais (`CallSignalingRouter`) — une entrée d'un
                // appel déjà terminé/remplacé est ignorée. Le journal garde tout
                // l'appel, sous-titres allumés ou non (#17342) : aucune garde ne
                // dépend du panneau. Révisions partielles et final d'un même
                // énoncé partagent leur `wireId` : chaque correction remplace
                // la précédente en place, puis la traduction relayée par le
                // gateway fusionne dans CallTranscriptionService.
                guard self.currentCallId == entry.callId else { return }
                let segment = CallTranscriptionSegmentFactory.makeTranscriptionSegment(from: entry)
                self.transcriptionService.receivePeerEntry(segment)
            case .ignored:
                break
            }
        }
    }
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
