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

/// Ce que le correspondant envoie pendant l'appel — réponse SDP, candidats ICE,
/// fin — et le délai de sonnerie d'un appel sortant.

extension CallManager {

    // MARK: - Remote Events

    func handleRemoteAnswer(callId: String, sdp: SessionDescription, generation: Int = 0) {
        guard currentCallId == callId else { return }
        // §3.5 — drop answers from a stale negotiation epoch.
        guard acceptIncomingNegotiation(generation) else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            let success = await self.webRTCService.setRemoteDescription(sdp)
            guard self.currentCallId == callId else { return }
            // A peer connection without a remote description will never produce
            // media even if ICE connects — fail fast instead of letting the call
            // hang silently in `.offering` / `.connecting`.
            guard success else {
                Logger.calls.error("Failed to apply remote answer for call \(callId) — ending call")
                self.failCall(String(localized: "call.error.sdp"))
                return
            }
            // L'answer SDP = l'appelé a décroché : désarmer le cutoff 45s
            // "pas de réponse" (resté armé pendant .offering).
            self.cancelOutgoingRingTimeout()
            // Phase 1 fix E5: now that remote answer is applied, ICE
            // checking starts. Transition .offering → .connecting.
            // The single source of truth for `.connected` remains
            // webRTCServiceDidConnect (driven by ICE-connected) — we only
            // bridge .offering → .connecting here.
            if case .offering = self.callState {
                self.callState = .connecting
                // Audit P1-12 — surface the "Connecting…" state to CallKit
                // so the caller's system UI shows the connecting indicator
                // instead of staying frozen on "Calling…" until ICE
                // completes.
                if let uuid = self.activeCallUUID {
                    self.callProvider.reportOutgoingCall(with: uuid, startedConnectingAt: Date())
                }
            }
            // #8270 — the answer to an ICE restart lands on a peer connection
            // that never left `.connected`: no edge will come, read the level.
            if self.catchUpConnectedIfNeeded(trigger: "remote answer applied") { return }
            Logger.calls.info("Remote answer received for: \(callId), awaiting ICE connected")
        }
    }

    func handleRemoteICECandidate(callId: String, candidate: IceCandidate, generation: Int = 0) {
        guard currentCallId == callId else { return }
        // §3.5 — drop ICE candidates from a stale negotiation epoch (their
        // ufrag/pwd belong to a superseded negotiation and would never pair).
        guard acceptIncomingNegotiation(generation) else { return }
        webRTCService.addICECandidate(candidate)
    }

    func handleRemoteEnd(callId: String, rawReason: String? = nil) {
        // Dedup (idempotence testable — cf. CallReliabilityPolicy.shouldProcessRemoteEnd) :
        // le serveur peut émettre `call:ended` plusieurs fois (CXEndCallAction côté
        // peer + cleanup serveur, et depuis 2026-07-12 le broadcast REST end/leave),
        // tous routés vers ce handler via le publisher `callEnded`. On traite le
        // premier ; un doublon sur un état déjà `.ended`, ou un event d'un AUTRE
        // call, est ignoré.
        guard CallReliabilityPolicy.shouldProcessRemoteEnd(
            currentCallId: currentCallId,
            incomingCallId: callId,
            callState: callState
        ) else { return }

        // Audit P1-24 — map the gateway's `reason` string to the right
        // CXCallEndedReason (Recents UX) + CallEndReason (analytics + in-app UI).
        // Extracted to the pure, unit-tested CallEndReasonMapper.
        let (cxReason, localReason) = CallEndReasonMapper.map(rawReason)

        if callUsesCallKit, let uuid = activeCallUUID {
            callProvider.reportCall(with: uuid, endedAt: Date(), reason: cxReason)
        }
        endCallInternal(reason: localReason)
        playNotificationHaptic(.warning)
        Logger.calls.info("Call ended by remote: \(callId) (rawReason=\(rawReason ?? "nil"), cx=\(cxReason.rawValue))")
    }

    // MARK: - Private: Outgoing Ring Timeout

    /// Schedules a defensive `outgoingRingTimeoutSeconds` cutoff for the caller.
    /// If the recipient hasn't joined within the window, ends the call as
    /// `.missed`. The gateway has its own 60s timeout but this guards against
    /// dropped `call:ended` events and gives the user a snappier failure path.
    @MainActor
    func startOutgoingRingTimeout() {
        outgoingRingTimeoutTask?.cancel()
        let timeout = QualityThresholds.outgoingRingTimeoutSeconds
        outgoingRingTimeoutTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(timeout))
            guard let self else { return }
            guard !Task.isCancelled else { return }
            // `.offering` compte comme "sonne encore" : le join de l'appelé est
            // automatique à la sonnerie, l'offer part avant tout décroché
            // humain. Seule l'answer SDP (= accept) désarme ce cutoff.
            switch self.callState {
            case .ringing(isOutgoing: true), .offering: break
            default: return
            }
            Logger.calls.warning("Outgoing call ring timeout after \(timeout)s — no answer; ending call")
            if let uuid = self.activeCallUUID {
                self.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
            }
            self.endCallInternal(reason: .missed)
        }
    }

    @MainActor
    func cancelOutgoingRingTimeout() {
        outgoingRingTimeoutTask?.cancel()
        outgoingRingTimeoutTask = nil
    }

    /// Démarre le ringback tone si l'appel est toujours en .ringing(outgoing).
    /// Appelé depuis `provider:didActivate:audioSession` — voir le commentaire
    /// long là-bas pour le rationale (AVAudioPlayer ne doit PAS être démarré
    /// avant que CallKit ait posé sa catégorie `.playAndRecord`).
    @MainActor
    func startRingbackIfNeeded() {
        guard case .ringing(isOutgoing: true) = callState else { return }
        ringbackPlayer.start()
    }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
