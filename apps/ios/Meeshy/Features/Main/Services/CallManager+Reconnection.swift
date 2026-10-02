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
        guard CallReliabilityPolicy.reconnectingAllowed(from: callState) else {
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
        analyticsTotalReconnects += 1
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
            turnRefreshTask?.cancel()
            turnRefreshTask = nil
            requestFreshTurnCredentials(callId: callId)
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
        let previousToggle = videoToggleTask
        let previousHold = holdVideoTask
        let previousSurvival = survivalVideoTask
        // Also chain onto the PREVIOUS iceRestartTask instance itself, not just
        // `.cancel()` it. Cancellation is cooperative and neither
        // `performICERestart()` nor `createOffer()` check `Task.isCancelled` —
        // without this await, a coalesced reconnect trigger (same `attempt`,
        // `attemptReconnection`'s `.coalesce` path) re-arms this task while the
        // previous one may still be mid-flight inside `createOffer()`, and both
        // can call `pc.offer(for:)`/`setLocalDescription` concurrently.
        let previousICERestart = iceRestartTask
        // Also chain onto `signalOfferAnswerTask` — a peer-initiated renegotiation
        // offer answered concurrently with this restart's createOffer() hits the
        // same glare hazard. See the doc-comment on `survivalVideoTask`.
        let previousAnswer = signalOfferAnswerTask
        let previousCameraSwitch = cameraSwitchTask
        iceRestartTask?.cancel()
        iceRestartTask = Task { @MainActor [weak self] in
            await previousToggle?.value
            await previousHold?.value
            _ = await previousSurvival?.value
            await previousICERestart?.value
            await previousAnswer?.value
            await previousCameraSwitch?.value
            // Re-validate after the chained awaits: the call may have ended, or a
            // newer reconnect cycle may have already taken over, while this task
            // was waiting behind another renegotiation.
            guard let self, !Task.isCancelled,
                  let callId = self.currentCallId, let userId = self.remoteUserId,
                  case .reconnecting(let currentAfterChain) = self.callState, currentAfterChain == attempt
            else { return }
            if backoffSeconds > 0 {
                try? await Task.sleep(for: .seconds(backoffSeconds))
                guard !Task.isCancelled, case .reconnecting(let current) = self.callState, current == attempt else { return }
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

    /// After configuring WebRTC for an incoming VoIP/notification call, decide whether
    /// the periodic refresh is enough or a real credential fetch is needed right away.
    /// A VoIP push payload never carries a TTL, and when it also carries no usable ICE
    /// servers (missing/malformed/all dropped by `parseIceServers`'s credential-length
    /// guard) `WebRTCService.configure` falls back to STUN-only — which reliably fails
    /// to connect behind symmetric/CGNAT (common on cellular). Request real per-user
    /// TURN credentials immediately in that case instead of waiting up to
    /// `turnDefaultCredentialTTLSeconds * 0.8` for the periodic scheduler.
    func armTurnCredentialsAfterConfigure(callId: String, iceServers: [IceServer]?) {
        guard let iceServers, !iceServers.isEmpty else {
            Logger.calls.warning("VoIP push carried no usable ICE servers — configured STUN-only fallback; requesting fresh TURN credentials immediately")
            requestFreshTurnCredentials(callId: callId)
            return
        }
        scheduleTURNCredentialRefresh(ttl: QualityThresholds.turnDefaultCredentialTTLSeconds)
    }

    // Schedules a TURN credential refresh at 80% of the credential TTL.
    // Emits `call:request-ice-servers`; gateway responds with `call:ice-servers-refreshed`
    // which `setupSocketListeners` applies via `webRTCService.updateIceServers`.
    func scheduleTURNCredentialRefresh(ttl: TimeInterval) {
        turnRefreshTask?.cancel()
        turnRefreshWatchdogTask?.cancel()
        turnRefreshWatchdogTask = nil
        turnRefreshRetryAttempt = 0
        // Floor-clamped: a degenerate TTL (zero / negative / short) schedules at
        // the minimum cadence instead of silently disarming the refresh — the
        // old `guard ttl >= 60 else return` left mid-call credentials expiring
        // with no refresh armed at all. See CallReliabilityPolicy.turnRefreshDelay.
        let refreshDelay = CallReliabilityPolicy.turnRefreshDelay(ttl: ttl)
        Logger.calls.info("TURN credential refresh scheduled in \(Int(refreshDelay))s (TTL=\(Int(ttl))s)")
        turnRefreshTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(refreshDelay))
            guard !Task.isCancelled, let self, self.callState.isActive,
                  let callId = self.currentCallId else { return }
            self.requestFreshTurnCredentials(callId: callId)
        }
    }

    /// Emits `call:request-ice-servers` and arms the retry watchdog. Shared by
    /// the periodic scheduler, the socket-reconnect resync, and the
    /// reconnection-cycle refresh — every requester gets the same
    /// no-ACK-loss protection.
    func requestFreshTurnCredentials(callId: String) {
        Logger.calls.info("Requesting fresh TURN credentials for call \(callId)")
        MessageSocketManager.shared.emitRequestIceServers(callId: callId)
        armTurnRefreshWatchdog(callId: callId)
    }

    /// Retries `requestFreshTurnCredentials` if `call:ice-servers-refreshed`
    /// hasn't arrived within `turnRefreshRetryTimeoutSeconds`, bounded by
    /// `CallReliabilityPolicy.turnRefreshShouldRetry`. Once retries are
    /// exhausted, falls back to re-arming the next periodic cycle at the
    /// floor delay instead of leaving the call with no refresh armed at all.
    private func armTurnRefreshWatchdog(callId: String) {
        turnRefreshWatchdogTask?.cancel()
        turnRefreshWatchdogTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.turnRefreshRetryTimeoutSeconds))
            guard !Task.isCancelled, let self, self.callState.isActive,
                  self.currentCallId == callId else { return }
            self.turnRefreshRetryAttempt += 1
            guard CallReliabilityPolicy.turnRefreshShouldRetry(attempt: self.turnRefreshRetryAttempt) else {
                Logger.calls.error("TURN credential refresh got no response after \(self.turnRefreshRetryAttempt) retries for call \(callId) — re-arming next cycle")
                self.scheduleTURNCredentialRefresh(ttl: QualityThresholds.turnMinRefreshDelaySeconds)
                return
            }
            Logger.calls.warning("TURN credential refresh got no response — retry #\(self.turnRefreshRetryAttempt) for call \(callId)")
            self.requestFreshTurnCredentials(callId: callId)
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
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
