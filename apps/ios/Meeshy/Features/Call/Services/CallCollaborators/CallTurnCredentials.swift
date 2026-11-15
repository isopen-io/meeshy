import Foundation
import MeeshySDK
import os

/// Les identifiants TURN d'un appel : leur rafraîchissement à 80 % de leur
/// durée de vie, la demande `call:request-ice-servers` et son chien de garde,
/// qui relance quand la réponse ne vient pas. Le collaborateur possède les deux
/// tâches et le compteur de relances, et tient l'appel faiblement (#11522).
@MainActor
final class CallTurnCredentials: CallTurnCredentialsProviding {
    nonisolated deinit {}

    private weak var call: CallManager?
    /// Periodic refresh of TURN credentials before TTL expiry. Cancelled on call end.
    private var turnRefreshTask: Task<Void, Never>?
    /// Watchdog armed after every `call:request-ice-servers` emit — retries if
    /// `call:ice-servers-refreshed` doesn't arrive within
    /// `turnRefreshRetryTimeoutSeconds`. `emitRequestIceServers` carries no ACK,
    /// so without this a single dropped emit/reply killed the refresh chain for
    /// the rest of the call. Cancelled on call end and on every successful
    /// response (via `scheduleTURNCredentialRefresh`).
    private var turnRefreshWatchdogTask: Task<Void, Never>?
    /// Consecutive watchdog retries for the current refresh cycle. Reset to 0
    /// whenever a fresh cycle starts (`scheduleTURNCredentialRefresh`).
    private(set) var turnRefreshRetryAttempt = 0

    var isRefreshScheduled: Bool { turnRefreshTask != nil }
    var isWatchdogArmed: Bool { turnRefreshWatchdogTask != nil }

    func attach(to call: CallManager) {
        self.call = call
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
    // which `CallSignalingRouter` applies via `webRTCService.updateIceServers`.
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
            guard await cancellableSleep(for: .seconds(refreshDelay)), !Task.isCancelled, let self,
                  let call = self.call, call.callState.isActive,
                  let callId = call.currentCallId else { return }
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
            guard await cancellableSleep(for: .seconds(QualityThresholds.turnRefreshRetryTimeoutSeconds)), !Task.isCancelled, let self,
                  let call = self.call, call.callState.isActive,
                  call.currentCallId == callId else { return }
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

    /// Un requérant qui demande des identifiants frais tout de suite (retour du
    /// socket, cycle de reconnexion) annule d'abord l'échéance périodique : elle
    /// partirait sinon dans la même fenêtre, en doublon.
    func cancelPeriodicRefresh() {
        turnRefreshTask?.cancel()
        turnRefreshTask = nil
    }

    /// Fin d'appel : plus aucune échéance ni relance pour un appel mort.
    func cancelAll() {
        turnRefreshTask?.cancel()
        turnRefreshTask = nil
        turnRefreshWatchdogTask?.cancel()
        turnRefreshWatchdogTask = nil
        turnRefreshRetryAttempt = 0
    }
}

/// Déclaré après le type : les gardes de l'unité lisent la PREMIÈRE
/// occurrence de chaque signature, qui doit être son corps.
@MainActor
protocol CallTurnCredentialsProviding: AnyObject {
    func attach(to call: CallManager)
    func armTurnCredentialsAfterConfigure(callId: String, iceServers: [IceServer]?)
    func scheduleTURNCredentialRefresh(ttl: TimeInterval)
    func requestFreshTurnCredentials(callId: String)
    func cancelPeriodicRefresh()
    func cancelAll()
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
