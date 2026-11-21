import Foundation
import MeeshySDK
import os

/// Les deux horloges d'un appel établi : le chrono affiché chaque seconde et le
/// battement de cœur émis vers la passerelle. Le collaborateur possède les deux
/// tâches ; `callDuration` et `callStartDate` restent sur l'appel (#11522).
///
/// La DURÉE se mesure sur une horloge MONOTONE injectée (#20010), jamais sur
/// l'horloge murale : une horloge murale reculée d'une heure gelait le chrono à 0
/// pendant une heure, une horloge avancée gonflait `durationSeconds`.
/// `callStartDate` reste l'ancre d'AFFICHAGE (sous-titres, Live Activity,
/// historique) ; `durationAnchor` est celle de la MESURE.
@MainActor
final class CallLiveClock: CallLiveClockProviding {
    nonisolated deinit {}

    private weak var call: CallManager?
    private let monotonicSeconds: @MainActor () -> TimeInterval
    private var durationAnchor: TimeInterval?
    // PERF-011: replace Timer.scheduledTimer with cancellable @MainActor Tasks.
    // Timers run on RunLoop.main and have no native cancellation hand-off; Tasks
    // are cooperative, energy-efficient (no RunLoop wakeup overhead), and
    // immediately stop their work loop on cancel.
    private var durationTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?

    var isHeartbeatRunning: Bool { heartbeatTask != nil }
    var isDurationClockRunning: Bool { durationTask != nil }

    init(monotonicSeconds: @escaping @MainActor () -> TimeInterval = CallMonotonicClock.seconds) {
        self.monotonicSeconds = monotonicSeconds
    }

    var monotonicNow: TimeInterval { monotonicSeconds() }

    var elapsedDuration: TimeInterval? {
        durationAnchor.map { CallReliabilityPolicy.elapsedSeconds(since: $0, now: monotonicSeconds()) }
    }

    @discardableResult
    func anchorDuration() -> TimeInterval {
        let anchor = monotonicSeconds()
        durationAnchor = anchor
        return anchor
    }

    func attach(to call: CallManager) {
        self.call = call
    }

    func startDurationClock() {
        durationTask?.cancel()
        durationTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard await cancellableSleep(for: .seconds(1)), !Task.isCancelled else { return }
                guard let self, let call = self.call else { return }
                // Défense en profondeur : une ancre momentanément nil ne doit
                // PAS tuer la boucle (l'ancien `return` gelait le chrono à
                // 00:00 pour tout le reste de l'appel) — on saute juste le tick.
                guard let elapsed = self.elapsedDuration else { continue }
                call.callDuration = elapsed
            }
        }
    }

    /// Arrêter le chrono oublie son ancre : seul le démontage de l'appel
    /// l'arrête, et l'appel suivant se ré-ancre à sa première connexion.
    func stopDurationClock() {
        durationTask?.cancel()
        durationTask = nil
        durationAnchor = nil
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
    var monotonicNow: TimeInterval { get }
    var elapsedDuration: TimeInterval? { get }
    @discardableResult func anchorDuration() -> TimeInterval
    func attach(to call: CallManager)
    func startDurationClock()
    func stopDurationClock()
    func startHeartbeat()
    func stopHeartbeat()
}

/// L'horloge monotone de production : `ContinuousClock` (mach_continuous_time),
/// qui ignore tout réglage de l'horloge murale ET continue de compter pendant
/// le sommeil de l'appareil — `systemUptime` s'y arrête, et un appel peut
/// durer écran verrouillé. Seules les DIFFÉRENCES ont un sens : l'origine est
/// le premier relevé du processus.
nonisolated enum CallMonotonicClock {
    private static let origin = ContinuousClock.now

    static func seconds() -> TimeInterval {
        let elapsed = origin.duration(to: ContinuousClock.now).components
        return TimeInterval(elapsed.seconds) + TimeInterval(elapsed.attoseconds) / 1e18
    }
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
