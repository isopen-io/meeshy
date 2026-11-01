import Foundation
@preconcurrency import CallKit
import MeeshySDK
import os

/// Les deux délais de sonnerie : celui de l'appelant et son jumeau côté appelé.
/// Le collaborateur possède les deux tâches et tient l'appel faiblement (#11522).
@MainActor
final class CallRingTimeouts: CallRingTimeoutsProviding {
    nonisolated deinit {}

    private weak var call: CallManager?
    /// Caller-side ringing timeout — ends the call as `.missed` if the recipient
    /// hasn't joined within `outgoingRingTimeoutSeconds`. Cancelled when the
    /// state leaves `.ringing(isOutgoing: true)` (offering / connecting / ended).
    private var outgoingRingTimeoutTask: Task<Void, Never>?
    /// Callee-side twin: an incoming call still ringing well past the ring budget — its `call:ended` lost (socket
    /// mounted after the caller hung up, `call_cancel` push missed) — ends locally as missed. Without it the state
    /// stayed `.ringing` with no exit: every later incoming call answered « busy » and `startCall` refused.
    private var incomingRingTimeoutTask: Task<Void, Never>?

    var isOutgoingArmed: Bool { outgoingRingTimeoutTask != nil }
    var isIncomingArmed: Bool { incomingRingTimeoutTask != nil }

    func attach(to call: CallManager) {
        self.call = call
    }

    /// Schedules a defensive `outgoingRingTimeoutSeconds` cutoff for the caller.
    /// If the recipient hasn't joined within the window, ends the call as
    /// `.missed`. The gateway has its own 60s timeout but this guards against
    /// dropped `call:ended` events and gives the user a snappier failure path.
    func startOutgoingRingTimeout() {
        outgoingRingTimeoutTask?.cancel()
        let timeout = QualityThresholds.outgoingRingTimeoutSeconds
        outgoingRingTimeoutTask = Task { @MainActor [weak self] in
            _ = await cancellableSleep(for: .seconds(timeout))
            guard let self, let call = self.call else { return }
            guard !Task.isCancelled else { return }
            // `.offering` compte comme "sonne encore" : le join de l'appelé est
            // automatique à la sonnerie, l'offer part avant tout décroché
            // humain. Seule l'answer SDP (= accept) désarme ce cutoff.
            switch call.callState {
            case .ringing(isOutgoing: true), .offering: break
            default: return
            }
            Logger.calls.warning("Outgoing call ring timeout after \(timeout)s — no answer; ending call")
            if let uuid = call.activeCallUUID {
                call.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
            }
            call.endCallInternal(reason: .missed)
        }
    }

    /// Arms the callee-side cutoff (`incomingRingTimeoutTask`). The margin over the ring budget leaves the
    /// gateway's own timeout and its `call:ended` the first word; this only closes a call nobody will close.
    func startIncomingRingTimeout() {
        incomingRingTimeoutTask?.cancel()
        let timeout = QualityThresholds.outgoingRingTimeoutSeconds + 30
        incomingRingTimeoutTask = Task { @MainActor [weak self] in
            guard await cancellableSleep(for: .seconds(timeout)), let self, let call = self.call, !Task.isCancelled else { return }
            guard case .ringing(isOutgoing: false) = call.callState else { return }
            Logger.calls.warning("Incoming call still ringing after \(timeout)s — its end was lost; closing as missed")
            if let callId = call.currentCallId {
                call.handleRemoteEnd(callId: callId, rawReason: "missed")
            } else {
                if let uuid = call.activeCallUUID {
                    call.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
                }
                call.endCallInternal(reason: .missed)
            }
        }
    }

    func cancelOutgoingRingTimeout() {
        outgoingRingTimeoutTask?.cancel()
        outgoingRingTimeoutTask = nil
    }

    /// Fin d'appel : plus aucun délai de sonnerie pour un appel mort.
    func cancelAll() {
        outgoingRingTimeoutTask?.cancel()
        outgoingRingTimeoutTask = nil
        incomingRingTimeoutTask?.cancel()
        incomingRingTimeoutTask = nil
    }
}

/// Déclaré après le type : les gardes de l'unité lisent la PREMIÈRE
/// occurrence de chaque signature, qui doit être son corps.
@MainActor
protocol CallRingTimeoutsProviding: AnyObject {
    var isOutgoingArmed: Bool { get }
    var isIncomingArmed: Bool { get }
    func attach(to call: CallManager)
    func startOutgoingRingTimeout()
    func startIncomingRingTimeout()
    func cancelOutgoingRingTimeout()
    func cancelAll()
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
