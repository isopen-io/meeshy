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

/// Le double appel (§11.15) : un second appel entrant pendant un appel en
/// cours se refuse, ou remplace l'appel en cours.

extension CallManager {

    // MARK: - Call Waiting (§11.15)

    func rejectPendingCall() {
        guard let pending = pendingIncomingCall else { return }
        // Refus du call-waiting : porte aussi reason=rejected et hérite du
        // différé socket-down via le helper (cf. emitCallReject).
        emitCallReject(callId: pending.callId)
        pendingIncomingCall = nil
        showCallWaitingBanner = false
        Logger.calls.info("Rejected pending call: \(pending.callId)")
    }

    /// Audit 2026-07-07 (Finding 2) — `pendingIncomingCall` holds a single
    /// waiting call, not a queue. A third caller arriving while a second is
    /// already waiting used to silently overwrite `pendingIncomingCall`,
    /// leaving the second caller ringing forever with no local signal. Mirror
    /// `rejectPendingCall()`'s socket signal for the call being displaced so
    /// its caller sees a clean end instead of a silent local drop.
    ///
    /// Audit 2026-08-10 (Vague 87 fix) — this used to call the raw
    /// `MessageSocketManager.shared.emitCallEnd(callId:)` directly instead of
    /// the `emitCallReject(callId:)` helper this doc comment already claimed
    /// to mirror. Two consequences: (1) the gateway's `CallService.endCall`
    /// resolves a pre-answer `call:end` with no `reason` to `CallStatus
    /// .missed`, not `.rejected` — the displaced caller got a false "missed
    /// call" notification/history entry for a call A was simply busy
    /// juggling, not one A never noticed; (2) `emitCallReject` guards on
    /// `MessageSocketManager.shared.isConnected` and defers+replays on
    /// reconnect, while the raw `emitCallEnd` is silently dropped by the SDK
    /// when the socket is down — plausible here since one call site
    /// (`reportIncomingVoIPCall`) can run synchronously off a cold-start
    /// PushKit delivery, before the socket handshake completes.
    func rejectSupersededPendingCall(replacingWithCallId newCallId: String) {
        guard let superseded = pendingIncomingCall, superseded.callId != newCallId else { return }
        emitCallReject(callId: superseded.callId)
        Logger.calls.info("Superseded waiting call ended: \(superseded.callId) (replaced by \(newCallId))")
    }

    /// Audit 2026-07-02 (bug 3) — the caller of the WAITING call hung up (or it
    /// was answered/force-ended elsewhere) before the user acted on the banner.
    /// Every terminal socket listener guards on `currentCallId` (the ACTIVE
    /// call) and early-returns for the waiting call's id — without this check
    /// the banner lingers until its 15s auto-dismiss and "End & Answer" would
    /// end the healthy active call to join one already torn down server-side.
    func clearPendingIncomingCall(ifMatching callId: String) {
        guard pendingIncomingCall?.callId == callId else { return }
        pendingIncomingCall = nil
        showCallWaitingBanner = false
        if answeringPendingCallId == callId {
            answeringPendingCallId = nil
        }
        Logger.calls.info("Waiting call ended remotely — call-waiting banner dismissed (callId=\(callId))")
    }

    func endCurrentAndAnswerPending() {
        guard let pending = pendingIncomingCall else { return }
        showCallWaitingBanner = false
        pendingIncomingCall = nil
        answeringPendingCallId = pending.callId

        endCall()

        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.endAndAnswerPendingHandoffSeconds))
            guard let self else { return }
            // The waiting call may have been ended, answered elsewhere, or
            // replaced by a newer incoming call while we were asleep — only
            // answer if it's still the exact call the user acted on. `endCall()`
            // above unconditionally nils `pendingIncomingCall` as a side effect
            // (unrelated busy-banner cleanup), so this dedicated token — not
            // `pendingIncomingCall` — is the source of truth for revalidation.
            guard self.answeringPendingCallId == pending.callId else { return }
            self.answeringPendingCallId = nil
            self.handleIncomingCallNotification(
                callId: pending.callId,
                fromUserId: pending.fromUserId,
                fromUsername: pending.fromUsername,
                isVideo: pending.isVideo,
                iceServers: pending.iceServers,
                conversationId: pending.conversationId
            )
        }
    }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
