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

/// La reconnexion d'un appel établi : relance ICE à recul exponentiel, budget
/// de tentatives, identifiants TURN rafraîchis avant leur expiration, et
/// candidats ICE tenus en attente jusqu'à la description distante.

extension CallManager {

    /// Requests a reconnection. External triggers (NWPathMonitor edges, the
    /// PC-state delegate, the `.connecting` watchdog, the half-open self-heal)
    /// use the default `escalate: false` — when a cycle is already in flight
    /// they COALESCE into it (re-arming its ICE restart) instead of advancing
    /// `reconnectAttempt`, so a single network blip whose lost/restored edges
    /// both fire no longer burns the `maxReconnectAttempts` budget. Only the
    /// `.reconnecting` watchdog and a failed restart offer pass
    /// `escalate: true` to advance the budget (and eventually trip the cap →
    /// `.connectionLost`).
    @MainActor
    func attemptReconnection(escalate: Bool = false) {
        guard !isGroupPrimaryVacated else { return }
        // FSM §3.2 — `.reconnecting` est réservé aux appels dont la négociation
        // média a commencé. Avant l'answer (.ringing/.offering) aucun ICE
        // restart n'est possible (pas de remote description) et la bascule
        // d'état faisait rendre l'écran connecté (00:00 figé) pendant que
        // l'appelé sonnait encore.
        guard CallReliabilityPolicy.reconnectingAllowed(from: callState, awaitingRemoteOffer: isAwaitingRemoteOffer) else {
            Logger.calls.warning("attemptReconnection ignoré en état \(String(describing: self.callState)) — réservé aux appels en négociation/établis (FSM §3.2)")
            return
        }
        let isAlreadyReconnecting: Bool
        if case .reconnecting = callState { isAlreadyReconnecting = true } else { isAlreadyReconnecting = false }

        switch CallReliabilityPolicy.evaluateReconnectTrigger(
            isAlreadyReconnecting: isAlreadyReconnecting,
            isEscalation: escalate
        ) {
        case .coalesce:
            // Redundant edge of the same outage (e.g. path-restored right after
            // path-lost). Re-arm the in-flight attempt's restart immediately —
            // a just-restored path is when a restart is most likely to succeed.
            Logger.calls.info("reconnect trigger coalesced into attempt \(self.reconnectAttempt) — re-arming ICE restart")
            scheduleICERestart(attempt: reconnectAttempt, backoffSeconds: 0)
            return
        case .startCycle, .escalate:
            break
        }

        reconnectAttempt += 1
        analytics.totalReconnects += 1
        guard reconnectAttempt <= QualityThresholds.maxReconnectAttempts else {
            if callUsesCallKit, let uuid = activeCallUUID {
                callProvider.reportCall(with: uuid, endedAt: Date(), reason: .failed)
            }
            abandonOnServer(cause: .reconnectCeiling)
            endCallInternal(reason: .connectionLost)
            return
        }

        callState = .reconnecting(attempt: reconnectAttempt)
        playHaptic(.light)

        if let callId = currentCallId {
            let userId = AuthManager.shared.currentUser?.id ?? ""
            MessageSocketManager.shared.emitCallReconnecting(callId: callId, participantId: userId, attempt: reconnectAttempt)
            // Fresh TURN credentials for this attempt: the
            // `call:ice-servers-refreshed` listener applies the response via
            // `updateIceServers`, so this restart — or its watchdog escalation —
            // re-gathers relay candidates with fresh credentials instead of
            // reusing creds that may be near the TTL horizon (coturn rejects
            // allocation refreshes past the expiry embedded in the username).
            // Routed through `requestFreshTurnCredentials` so a dropped emit/reply
            // during a reconnection cycle still retries instead of going silent.
            // Cancel the periodic 80%-TTL scheduler first (mirrors `didReconnect`
            // below) — otherwise its deadline can fire in this same window and
            // race a second, redundant `call:request-ice-servers` emit.
            turnCredentials.cancelPeriodicRefresh()
            turnCredentials.requestFreshTurnCredentials(callId: callId)
        }

        let backoffSeconds = CallReliabilityPolicy.reconnectBackoffSeconds(
            attempt: reconnectAttempt,
            unitRandom: Double.random(in: 0..<1)
        )
        scheduleICERestart(attempt: reconnectAttempt, backoffSeconds: backoffSeconds)
    }

    /// (Re-)arms the ICE restart for `attempt`. Cancels the in-flight restart
    /// task first, then awaits it (in addition to the video-transition family)
    /// before actuating — `.cancel()` alone is cooperative and doesn't stop a
    /// restart already inside `createOffer()`, which has no re-entrancy guard.
    @MainActor
    func scheduleICERestart(attempt: Int, backoffSeconds: Double) {
        // Audit finding — chain onto the video-transition family too (mirrors
        // toggleVideo/handleHold/applySurvivalVideoSend, see the doc-comment on
        // `survivalVideoTask`). `performICERestart()` calls `createOffer()` just
        // like they do, and it has no re-entrancy guard: a CallKit hold firing at
        // the same moment as a WiFi↔cellular handoff (exactly what a GSM call
        // causes) used to let a hold renegotiation and an ICE-restart
        // renegotiation call createOffer() concurrently.
        // Also chain onto the PREVIOUS iceRestartTask instance itself, not just
        // `.cancel()` it. Cancellation is cooperative and neither
        // `performICERestart()` nor `createOffer()` check `Task.isCancelled` —
        // without this await, a coalesced reconnect trigger (same `attempt`,
        // `attemptReconnection`'s `.coalesce` path) re-arms this task while the
        // previous one may still be mid-flight inside `createOffer()`, and both
        // can call `pc.offer(for:)`/`setLocalDescription` concurrently.
        // Also chain onto `signalOfferAnswerTask` — a peer-initiated renegotiation
        // offer answered concurrently with this restart's createOffer() hits the
        // same glare hazard. See the doc-comment on `survivalVideoTask`.
        let inFlight = videoTransitionsInFlight()
        iceRestartTask?.cancel()
        iceRestartTask = Task { @MainActor [weak self] in
            await inFlight.settle()
            // Re-validate after the chained awaits: the call may have ended, or a
            // newer reconnect cycle may have already taken over, while this task
            // was waiting behind another renegotiation.
            guard let self, !Task.isCancelled,
                  let callId = self.currentCallId, let userId = self.remoteUserId,
                  case .reconnecting(let currentAfterChain) = self.callState, currentAfterChain == attempt
            else { return }
            if backoffSeconds > 0 {
                guard await cancellableSleep(for: .seconds(backoffSeconds)), !Task.isCancelled, case .reconnecting(let current) = self.callState, current == attempt else { return }
            }
            guard let offer = await self.webRTCService.performICERestart() else {
                // The call may have ended (or a newer reconnect cycle already
                // took over) while `performICERestart()` was in flight — only
                // escalate if this attempt is still the live one, otherwise
                // this would resurrect a dead call or clobber a fresher cycle.
                guard !Task.isCancelled, case .reconnecting(let current) = self.callState, current == attempt else { return }
                self.attemptReconnection(escalate: true); return
            }
            guard !Task.isCancelled, case .reconnecting(let current) = self.callState, current == attempt else { return }
            self.emitCallOffer(callId: callId, toUserId: userId, isVideo: self.isVideoEnabled, sdp: offer)
        }
    }

    // P0-3 — replay ICE candidates buffered while the socket was down.
    // Called after `emitCallJoin` on socket reconnect so the gateway has
    // already re-admitted us to the call room before forwarding candidates.
    func flushPendingIceCandidates() {
        guard !pendingIceCandidates.isEmpty else { return }
        // Guard socket liveness: if the socket dropped again between the
        // reconnect event and this flush, the gateway never receives the
        // candidates — and they're not re-queued. Re-buffer them so the
        // next reconnect cycle can deliver them.
        guard MessageSocketManager.shared.isConnected else {
            Logger.calls.warning("flushPendingIceCandidates — socket not connected, re-buffering \(self.pendingIceCandidates.count) candidate(s)")
            return
        }
        let candidates = pendingIceCandidates
        pendingIceCandidates = []
        Logger.calls.info("Flushing \(candidates.count) buffered ICE candidate(s) after socket reconnect")
        for entry in candidates {
            guard let callId = entry["callId"] as? String,
                  let payload = entry["payload"] as? [String: Any] else { continue }
            MessageSocketManager.shared.emitCallSignal(callId: callId, type: "ice-candidate", payload: payload)
        }
    }

}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
