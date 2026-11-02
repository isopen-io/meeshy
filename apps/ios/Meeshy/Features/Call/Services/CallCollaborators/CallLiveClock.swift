import Foundation
import MeeshySDK
import os

/// Les deux horloges d'un appel établi : le chrono affiché chaque seconde et le
/// battement de cœur émis vers la passerelle. Le collaborateur possède les deux
/// tâches ; `callDuration` et `callStartDate` restent sur l'appel (#11522).
@MainActor
final class CallLiveClock: CallLiveClockProviding {
    nonisolated deinit {}

    private weak var call: CallManager?
    // PERF-011: replace Timer.scheduledTimer with cancellable @MainActor Tasks.
    // Timers run on RunLoop.main and have no native cancellation hand-off; Tasks
    // are cooperative, energy-efficient (no RunLoop wakeup overhead), and
    // immediately stop their work loop on cancel.
    private var durationTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?

    var isHeartbeatRunning: Bool { heartbeatTask != nil }
    var isDurationClockRunning: Bool { durationTask != nil }

    func attach(to call: CallManager) {
        self.call = call
    }

    func startDurationClock() {
        durationTask?.cancel()
        durationTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard await cancellableSleep(for: .seconds(1)), !Task.isCancelled else { return }
                guard let self, let call = self.call else { return }
                // Défense en profondeur : un callStartDate momentanément nil ne
                // doit PAS tuer la boucle (l'ancien `return` gelait le chrono à
                // 00:00 pour tout le reste de l'appel) — on saute juste le tick.
                guard let start = call.callStartDate else { continue }
                call.callDuration = Date().timeIntervalSince(start)
            }
        }
    }

    func stopDurationClock() {
        durationTask?.cancel()
        durationTask = nil
    }

    func startHeartbeat() {
        heartbeatTask?.cancel()
        let interval = QualityThresholds.heartbeatIntervalSeconds
        heartbeatTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                let nanos = UInt64(interval * 1_000_000_000)
                guard await cancellableSleep(for: .nanoseconds(nanos)), !Task.isCancelled else { return }
                guard let self, let call = self.call, let callId = call.currentCallId else { return }
                // Use the dedicated `call:heartbeat` event. The previous
                // `call:signal` with a "heartbeat" type was rejected by the
                // gateway's strict signal schema (type ∈ offer / answer /
                // ice-candidate / ice-restart), so `recordHeartbeat` never fired
                // for iOS participants: the gateway could not detect a dead iOS
                // peer via heartbeat liveness and zombie calls lingered until the
                // 2h GC (the reason startCall needs a call:force-leave preflight).
                // `call:heartbeat` matches socketHeartbeatSchema and the gateway
                // resolves the participant from the socket userId — no from/to
                // payload needed. Mirrors the web client.
                MessageSocketManager.shared.emitCallHeartbeat(callId: callId)
                Logger.calls.debug("Heartbeat sent for call: \(callId)")
            }
        }
        Logger.calls.info("Heartbeat task started (\(interval)s interval)")
    }

    func stopHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
    }
}

/// Déclaré après le type : les gardes de l'unité lisent la PREMIÈRE
/// occurrence de chaque signature, qui doit être son corps.
@MainActor
protocol CallLiveClockProviding: AnyObject {
    var isHeartbeatRunning: Bool { get }
    var isDurationClockRunning: Bool { get }
    func attach(to call: CallManager)
    func startDurationClock()
    func stopDurationClock()
    func startHeartbeat()
    func stopHeartbeat()
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
