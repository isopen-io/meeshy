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

/// Refuser un appel entrant et raccrocher, avec la réconciliation différée
/// de `call:end`/`call:reject` quand le socket est coupé.

extension CallManager {

    // MARK: - Reject Call

    func rejectCall() {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard let callId = currentCallId, remoteUserId != nil else { return }

        // CALL-FIX 2026-06-06 — stop the ringtone the INSTANT the user declines.
        ringbackPlayer.stop()
        ringbackPlayer.stopRingtone()

        emitCallReject(callId: callId)

        // Same rationale as answerCall(): a foreground/Mac call never reported to
        // CallKit must not fire a doomed-to-fail CXEndCallAction.
        if let uuid = activeCallUUID, callUsesCallKit {
            let endAction = CXEndCallAction(call: uuid)
            callController.request(CXTransaction(action: endAction)) { error in
                if let error { Logger.calls.error("CallKit reject failed: \(error.localizedDescription)") }
            }
        }

        endCallInternal(reason: .rejected)
        HapticFeedback.error()
        Logger.calls.info("Call rejected: \(callId)")
    }

    // MARK: - End Call

    /// [Chaos-test prod 2026-07-02, EXIGENCE №1] A local hang-up that never
    /// reaches the gateway leaves the PEER in a zombie call: the server keeps
    /// the CallSession active, keeps accepting the peer's re-joins, and never
    /// broadcasts participant-left — the peer only dies ~48s later on its own
    /// watchdogs (proven from prod logs: zero call:end received in the window).
    /// Deferred here + replayed by the connectionState observer when the
    /// hang-up happens during a signaling outage; the gateway end handler is
    /// idempotent and resolves pre-answer ends to `missed` (C3/C4).

    /// Records (or refreshes) `callId`'s pending reconciliation without
    /// dropping any OTHER call's still-pending entry.
    func armPendingEndReconciliation(callId: String, reason: String?) {
        pendingEndReconciliations.removeAll { $0.callId == callId }
        let armings = (endReconciliationArmings[callId] ?? 0) + 1
        guard armings <= Self.maxEndReconciliationArmings else {
            Logger.calls.warning("call:end reconciliation abandoned after \(Self.maxEndReconciliationArmings) armings (callId=\(callId))")
            return
        }
        endReconciliationArmings[callId] = armings
        pendingEndReconciliations.append((callId: callId, reason: reason))
    }

    func emitCallEndReliably(callId: String) {
        guard MessageSocketManager.shared.isConnected else {
            armPendingEndReconciliation(callId: callId, reason: nil)
            Logger.calls.warning("call:end deferred — socket down, will reconcile on reconnect (callId=\(callId))")
            return
        }
        // D2 (#11468) — émis ICI, de façon synchrone : une `Task` du fil principal le faisait
        // passer derrière tout le démontage local (14 à 17 s, simulateur chargé).
        MessageSocketManager.shared.emitCallEndWithAck(callId: callId) { [weak self] acked in
            let manager = self
            Task { @MainActor in
                if !acked {
                    MessageSocketManager.shared.emitCallEnd(callId: callId)
                    // [Chaos-test 2] Unacked end: replay on next connect (gateway end is idempotent).
                    manager?.armPendingEndReconciliation(callId: callId, reason: nil)
                    Logger.calls.warning("call:end ACK failed pour \(callId) — fallback émis + réconciliation armée pour le prochain connect")
                }
            }
        }
    }

    func endCall() {
        guard callState.isActive else { return }

        // Refus lock-screen (arc reject 2026-07-12) : un `CXEndCallAction` sur
        // un entrant PRÉ-décroché est le bouton « Refuser » de CallKit — le
        // seul chemin de refus d'un appel reçu en background. Il aboutit ici,
        // pas dans rejectCall() : sans cette branche, l'end part sans raison,
        // le gateway le résout `missed` et notifie « appel manqué » celui qui
        // vient de refuser (exactement le bug corrigé sur les autres chemins).
        let isDecliningIncoming: Bool = {
            if case .ringing(isOutgoing: false) = callState { return true }
            return false
        }()

        // Le second guard historique (`guard let callId = currentCallId`)
        // retournait early si l'ACK call:initiate n'avait pas encore
        // atterri — laissant `activeCallUUID` non-cleared et le Task de
        // setup tournant pour rien. Or CallKit peut fire `CXEndCallAction`
        // AVANT l'ACK (cas du simulateur iOS 18+ qui disconnect les
        // hosted calls « because there wont be a UI to host the call »,
        // mais aussi en prod sur certaines race conditions). On rend les
        // identifiants OPTIONNELS et on garantit `endCallInternal` dans
        // tous les cas pour nettoyer l'état local + cancel les Tasks.
        let callId = currentCallId

        // `call:end` avec accusé (3 s, repli + réconciliation) part AVANT
        // `endCallInternal` : le serveur l'apprend avant le démontage local.
        // Raccroché instantané côté pair (parité WhatsApp) : `bye` in-band sur
        // le data channel P2P — arrive en millisecondes, sans dépendre des
        // allers-retours DB du gateway avant son fanout `call:ended`. Émis
        // AVANT `endCallInternal` (qui ferme la peer connection). No-op si le
        // channel n'est pas ouvert ; le chemin socket ci-dessous reste
        // l'autorité et le filet de sécurité. Jamais en groupe : le principal
        // raccrocherait, la passerelle résout le départ (#9085).
        if !isGroupMeshCall { webRTCService.sendHangupBye() }

        if let callId {
            if isDecliningIncoming {
                // Mêmes garanties que rejectCall() (fire-and-forget) : le refus
                // porte reason=rejected, l'ACK/réconciliation reste le filet du
                // chemin raccroché.
                emitCallReject(callId: callId)
            } else {
                emitCallEndReliably(callId: callId)
            }
        }

        // H1 — rendre le teardown local atomique vis-à-vis de CallKit. On capture
        // l'UUID, puis on exécute `endCallInternal` EN PREMIER pour que `callState`
        // soit `.ended` AVANT de demander à CallKit de raccrocher. Le loop-back
        // `CXEndCallAction` ré-entre dans `endCall()`, et son `guard callState.isActive`
        // (en tête de méthode) rejette alors de façon fiable la ré-entrée — pas de
        // double teardown. (`endCallInternal` nil-e `activeCallUUID`, d'où la capture
        // locale ci-dessus.)
        let endUUID = activeCallUUID
        let endUsedCallKit = callUsesCallKit
        endCallInternal(reason: isDecliningIncoming ? .rejected : .local)
        if let endUUID, endUsedCallKit {
            let endAction = CXEndCallAction(call: endUUID)
            callController.request(CXTransaction(action: endAction)) { error in
                if let error { Logger.calls.error("CallKit end failed: \(error.localizedDescription)") }
            }
        }
        Logger.calls.info("Call ended by local: \(callId ?? "(pre-ACK)")")
    }

}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
