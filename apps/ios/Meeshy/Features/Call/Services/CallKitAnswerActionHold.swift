import Foundation
@preconcurrency import CallKit
import MeeshySDK
import os

/// A CallKit action that must be completed exactly once.
protocol SettleableCallAction: AnyObject {
    func fulfill()
    func fail()
}

extension CXAnswerCallAction: SettleableCallAction {}

protocol CallKitAnswerActionHoldProviding: AnyObject {
    func hold(_ action: SettleableCallAction)
    func settle(fulfilled: Bool, reason: String)
    func discardTimedOut(_ action: SettleableCallAction)
}

/// [Fix 2026-07-02] CallKit answer action held until the call actually
/// connects. CallKit starts the callee's elapsed timer the moment the
/// answer action is fulfilled — fulfilling at tap time made the counter
/// run while WebRTC was still connecting (user-reported "0:00 before the
/// connection exists"). Held here, fulfilled in `transitionToConnected`,
/// failed on pre-connection teardown, force-fulfilled by a safety net
/// (`QualityThresholds.pendingAnswerActionSafetyNetSeconds`) so CallKit
/// can never time the action out.
///
/// MainActor only: `provider(_:perform: CXAnswerCallAction)` hops there via
/// `Task { @MainActor ... }` before handing the action over (#11522 moved
/// this state out of `CallManager`, the order of every call is unchanged).
final class CallKitAnswerActionHold: CallKitAnswerActionHoldProviding {
    nonisolated deinit {}

    private let safetyNetSeconds: TimeInterval
    private var pending: SettleableCallAction?
    private var safetyTask: Task<Void, Never>?

    init(safetyNetSeconds: TimeInterval = QualityThresholds.pendingAnswerActionSafetyNetSeconds) {
        self.safetyNetSeconds = safetyNetSeconds
    }

    var isHolding: Bool { pending != nil }

    func hold(_ action: SettleableCallAction) {
        // CallKit's contract requires every CX*Action to eventually be
        // completed — settle any still-pending action instead of silently
        // dropping its reference, or an uncompleted action can get the app
        // killed by the system.
        if pending != nil {
            settle(fulfilled: false, reason: "superseded by a new CXAnswerCallAction")
        }
        pending = action
        safetyTask?.cancel()
        let seconds = safetyNetSeconds
        safetyTask = Task { @MainActor [weak self] in
            guard await cancellableSleep(for: .seconds(seconds)), !Task.isCancelled else { return }
            self?.settle(fulfilled: true, reason: "safety-net \(Int(seconds))s — still not connected")
        }
    }

    func settle(fulfilled: Bool, reason: String) {
        safetyTask?.cancel()
        safetyTask = nil
        guard let action = pending else { return }
        pending = nil
        if fulfilled {
            action.fulfill()
        } else {
            action.fail()
        }
        Logger.calls.info("[CALLKIT] answer action \(fulfilled ? "fulfilled" : "failed") (\(reason))")
    }

    /// CallKit's OWN internal deadline elapsed on the held action before we
    /// settled it: CallKit has already given up on it, so `.fulfill()`/`.fail()`
    /// must never be called on it again. Only the reference (and its safety
    /// net) is dropped, so a later `transitionToConnected` does not try to
    /// fulfill an action CallKit no longer tracks.
    func discardTimedOut(_ action: SettleableCallAction) {
        guard pending === action else { return }
        safetyTask?.cancel()
        safetyTask = nil
        pending = nil
        Logger.calls.error("[CALLKIT] discarded answer action after CallKit-side timeout")
    }
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
