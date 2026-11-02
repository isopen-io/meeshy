import Foundation
import MeeshySDK
import os

/// §5.8 — unified reliability monitor. One periodic task that, each tick,
/// branches on `callState`:
///   - `.connecting` (answer reçue, ICE réel en cours) : applies the
///     watchdog (`evaluateConnecting`) so a wedged ICE/DTLS handshake gets
///     ONE ICE restart, then fails, instead of spinning "Connexion…"
///     forever (bug h).
///   - `.offering` : PAS de watchdog ICE — l'appelé sonne encore (join
///     automatique à la sonnerie) ; l'horloge est le ring timeout 45s.
///   - `.connected`: applies the half-open self-heal (`evaluateHalfOpen`).
///     We stay `.connected` for snappy UX, but if after the grace window the
///     peer's RTP never arrives while ours flows, we trigger ONE ICE restart
///     (the heal is one-shot per call to honour "un ICE restart").
/// Real disconnects/hangups remain handled by the PC-state delegate, remote
/// `call:ended`, the user, and `outgoingRingTimeoutSeconds` (armed through
/// `.ringing` AND `.offering`).
///
/// Le collaborateur possède la tâche du moniteur et tient l'appel faiblement
/// (#11522). Il remplace l'ancien `rtpGateTask`, purement informatif.
@MainActor
final class CallReliabilityMonitor: CallReliabilityMonitorProviding {
    nonisolated deinit {}

    private weak var call: CallManager?
    private var reliabilityMonitorTask: Task<Void, Never>?

    var isRunning: Bool { reliabilityMonitorTask != nil }

    func attach(to call: CallManager) {
        self.call = call
    }

    func startReliabilityMonitor() {
        reliabilityMonitorTask?.cancel()
        reliabilityMonitorTask = Task { @MainActor [weak self] in
            // Half-open detection is keyed off `connectionEpoch` so it re-arms
            // with a fresh RTP baseline after every (re)connect — even when a
            // reconnection cycle completes entirely between two poll ticks.
            var watchdog = CallReliabilityWatchdog()
            let nanos = UInt64(QualityThresholds.rtpGatePollIntervalSeconds * 1_000_000_000)
            while !Task.isCancelled {
                guard await cancellableSleep(for: .nanoseconds(nanos)), !Task.isCancelled else { return }
                guard let self, let call = self.call else { return }
                guard await self.superviseReliability(call, &watchdog) else { return }
            }
        }
    }

    func stopReliabilityMonitor() {
        reliabilityMonitorTask?.cancel()
        reliabilityMonitorTask = nil
    }

    /// One reliability tick. Returns `false` once the call has been failed
    /// (the monitor stops).
    private func superviseReliability(_ call: CallManager, _ watchdog: inout CallReliabilityWatchdog) async -> Bool {
        switch call.callState {
        case .offering:
            // Offer envoyé, l'appelé SONNE encore (le join est automatique à
            // la sonnerie — un délai humain > 12s est normal, pas une panne
            // ICE : aucune remote description n'existe, un ICE restart est
            // impossible). L'horloge de l'appel non répondu est le ring
            // timeout 45s (startOutgoingRingTimeout) + le reaper gateway 60s.
            // L'horloge ICE (.connecting) ne démarre qu'à l'answer.
            watchdog.offering()
        case .connecting:
            return superviseConnecting(call, &watchdog)
        case .connected:
            watchdog.connected()
            await superviseHalfOpen(call, &watchdog)
        case .reconnecting(let attempt):
            superviseReconnecting(call, attempt: attempt, &watchdog)
        default:
            watchdog.otherState()
        }
        return true
    }

    private func superviseConnecting(_ call: CallManager, _ watchdog: inout CallReliabilityWatchdog) -> Bool {
        if call.catchUpConnectedIfNeeded(trigger: ".connecting watchdog") {
            watchdog.reconnectingResolved()
            watchdog.connectingCaughtUp()
            return true
        }
        // Appelé qui attend encore l'offre : l'horloge ne démarre qu'à son
        // arrivée, le minuteur d'offre tient cette phase.
        switch watchdog.connecting(
            now: Date(),
            failAfterSeconds: call.connectingFailBudget,
            awaitingRemoteOffer: call.isAwaitingRemoteOffer
        ) {
        case .waiting:
            return true
        case .restartICE(let elapsed):
            Logger.calls.info(".connecting watchdog (\(Int(elapsed))s) → triggering ICE restart")
            call.reconnector.attemptReconnection()
            return true
        case .fail(let elapsed):
            Logger.calls.error(".connecting watchdog (\(Int(elapsed))s) — failing call")
            call.failCall(String(localized: "call.error.timeout"))
            return false
        }
    }

    /// Once this epoch settled (media confirmed healthy OR the one allowed
    /// self-heal fired) the stats fetch is skipped — ongoing transport faults
    /// surface via the PC-state delegate, not by polling stats forever.
    private func superviseHalfOpen(_ call: CallManager, _ watchdog: inout CallReliabilityWatchdog) async {
        guard watchdog.halfOpenMonitor.needsEvaluation(epoch: call.connectionEpoch) else { return }
        guard let stats = await call.webRTCService.getStats() else { return }
        switch watchdog.halfOpenMonitor.evaluate(
            epoch: call.connectionEpoch,
            inboundPackets: stats.inboundPacketsReceived,
            outboundPackets: stats.outboundPacketsSent
        ) {
        case .healthy?:
            Logger.calls.debug("media bidirectional (inAudio=\(stats.inboundAudioPackets) inVideo=\(stats.inboundVideoPackets) out=\(stats.outboundPacketsSent))")
        case .waiting?, nil:
            break
        case .healHalfOpen?:
            Logger.calls.warning("half-open detected (inbound delta stalled, epoch \(call.connectionEpoch)) — auto ICE restart")
            call.reconnector.attemptReconnection()
        }
    }

    private func superviseReconnecting(_ call: CallManager, attempt: Int, _ watchdog: inout CallReliabilityWatchdog) {
        guard case .stalled(let elapsed) = watchdog.reconnecting(attempt: attempt, now: Date()) else { return }
        watchdog.reconnectingResolved()
        if call.catchUpConnectedIfNeeded(trigger: ".reconnecting watchdog") { return }
        // This attempt's ICE restart overran its budget without reaching
        // `.connected`. Escalate: `attemptReconnection` advances the counter
        // (or trips the cap → `.connectionLost`).
        Logger.calls.warning(".reconnecting watchdog (\(Int(elapsed))s, attempt \(attempt)) — ICE restart stalled, escalating")
        call.reconnector.attemptReconnection(escalate: true)
    }
}

/// Déclaré après le type : les gardes de l'unité lisent la PREMIÈRE
/// occurrence de chaque signature, qui doit être son corps.
@MainActor
protocol CallReliabilityMonitorProviding: AnyObject {
    func attach(to call: CallManager)
    func startReliabilityMonitor()
    func stopReliabilityMonitor()
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
