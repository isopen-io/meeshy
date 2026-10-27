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

/// L'établissement d'un appel : surveillance de fiabilité des états
/// transitoires, passage à `.connected` et battement de cœur.

extension CallManager {

    // MARK: - Private: State Transitions

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
    @MainActor
    func startReliabilityMonitor() {
        reliabilityMonitorTask?.cancel()
        reliabilityMonitorTask = Task { @MainActor [weak self] in
            guard let self else { return }
            // Half-open detection is keyed off `connectionEpoch` so it re-arms
            // with a fresh RTP baseline after every (re)connect — even when a
            // reconnection cycle completes entirely between two poll ticks.
            var watchdog = CallReliabilityWatchdog()
            let nanos = UInt64(QualityThresholds.rtpGatePollIntervalSeconds * 1_000_000_000)
            while !Task.isCancelled {
                guard await cancellableSleep(for: .nanoseconds(nanos)), !Task.isCancelled else { return }
                guard await self.superviseReliability(&watchdog) else { return }
            }
        }
    }

    /// One reliability tick. Returns `false` once the call has been failed
    /// (the monitor stops).
    private func superviseReliability(_ watchdog: inout CallReliabilityWatchdog) async -> Bool {
        switch callState {
        case .offering:
            // Offer envoyé, l'appelé SONNE encore (le join est automatique à
            // la sonnerie — un délai humain > 12s est normal, pas une panne
            // ICE : aucune remote description n'existe, un ICE restart est
            // impossible). L'horloge de l'appel non répondu est le ring
            // timeout 45s (startOutgoingRingTimeout) + le reaper gateway 60s.
            // L'horloge ICE (.connecting) ne démarre qu'à l'answer.
            watchdog.offering()
        case .connecting:
            return superviseConnecting(&watchdog)
        case .connected:
            watchdog.connected()
            await superviseHalfOpen(&watchdog)
        case .reconnecting(let attempt):
            superviseReconnecting(attempt: attempt, &watchdog)
        default:
            watchdog.otherState()
        }
        return true
    }

    private func superviseConnecting(_ watchdog: inout CallReliabilityWatchdog) -> Bool {
        if catchUpConnectedIfNeeded(trigger: ".connecting watchdog") {
            watchdog.reconnectingResolved()
            watchdog.connectingCaughtUp()
            return true
        }
        // Appelé qui attend encore l'offre : l'horloge ne démarre qu'à son
        // arrivée, le minuteur d'offre tient cette phase.
        switch watchdog.connecting(
            now: Date(),
            failAfterSeconds: connectingFailBudget,
            awaitingRemoteOffer: isAwaitingRemoteOffer
        ) {
        case .waiting:
            return true
        case .restartICE(let elapsed):
            Logger.calls.info(".connecting watchdog (\(Int(elapsed))s) → triggering ICE restart")
            attemptReconnection()
            return true
        case .fail(let elapsed):
            Logger.calls.error(".connecting watchdog (\(Int(elapsed))s) — failing call")
            failCall(String(localized: "call.error.timeout"))
            return false
        }
    }

    /// Once this epoch settled (media confirmed healthy OR the one allowed
    /// self-heal fired) the stats fetch is skipped — ongoing transport faults
    /// surface via the PC-state delegate, not by polling stats forever.
    private func superviseHalfOpen(_ watchdog: inout CallReliabilityWatchdog) async {
        guard watchdog.halfOpenMonitor.needsEvaluation(epoch: self.connectionEpoch) else { return }
        guard let stats = await webRTCService.getStats() else { return }
        switch watchdog.halfOpenMonitor.evaluate(
            epoch: self.connectionEpoch,
            inboundPackets: stats.inboundPacketsReceived,
            outboundPackets: stats.outboundPacketsSent
        ) {
        case .healthy?:
            Logger.calls.debug("media bidirectional (inAudio=\(stats.inboundAudioPackets) inVideo=\(stats.inboundVideoPackets) out=\(stats.outboundPacketsSent))")
        case .waiting?, nil:
            break
        case .healHalfOpen?:
            Logger.calls.warning("half-open detected (inbound delta stalled, epoch \(self.connectionEpoch)) — auto ICE restart")
            attemptReconnection()
        }
    }

    private func superviseReconnecting(attempt: Int, _ watchdog: inout CallReliabilityWatchdog) {
        guard case .stalled(let elapsed) = watchdog.reconnecting(attempt: attempt, now: Date()) else { return }
        watchdog.reconnectingResolved()
        if catchUpConnectedIfNeeded(trigger: ".reconnecting watchdog") { return }
        // This attempt's ICE restart overran its budget without reaching
        // `.connected`. Escalate: `attemptReconnection` advances the counter
        // (or trips the cap → `.connectionLost`).
        Logger.calls.warning(".reconnecting watchdog (\(Int(elapsed))s, attempt \(attempt)) — ICE restart stalled, escalating")
        attemptReconnection(escalate: true)
    }

    /// #8270 — level catch-up of `.connected`. See
    /// `CallReliabilityPolicy.shouldCatchUpConnected`. Returns whether it fired.
    @discardableResult
    func catchUpConnectedIfNeeded(trigger: String) -> Bool {
        guard CallReliabilityPolicy.shouldCatchUpConnected(
            callState: callState,
            peerState: webRTCService.connectionState
        ) else { return false }
        Logger.calls.warning("[CallFSM] peer connection already .connected while \(String(describing: self.callState)) — catch-up (\(trigger, privacy: .public))")
        transitionToConnected()
        return true
    }

    func transitionToConnected() {
        // Idempotent : si déjà .connected, no-op. Appelée par webRTCServiceDidConnect
        // (immédiat sur RTCPeerConnectionState.connected, §3.2). Le guard évite de
        // relancer durationTask / heartbeat / haptics si re-déclenchée.
        if case .connected = callState { return }

        // [Fix 2026-07-02] Le chrono CallKit du callee démarre au fulfill de
        // l'answer action : la settle ICI (connexion réelle), pas au tap.
        settlePendingAnswerAction(fulfilled: true, reason: "connected")
        let wasReconnecting: Bool
        if case .reconnecting = callState { wasReconnecting = true } else { wasReconnecting = false }

        activateAudioOnConnect()

        // CALL-FIX 2026-06-06 — call established: stop ringback/ringtone + play the
        // "connected" cue. transitionToConnected is idempotent (guarded above) so
        // the cue plays exactly once. On a reconnect (wasReconnecting=true) the
        // ringback is already stopped, the cue already played, and the timer is
        // already running — replaying the cue or resetting the timer mid-call
        // would be a jarring UX regression.
        ringbackPlayer.stop()
        ringbackPlayer.stopRingtone()
        if !wasReconnecting {
            ringbackPlayer.playConnected()
        }
        callState = .connected
        // New connection period: re-arms the reliability monitor's half-open
        // detection with a fresh RTP baseline (see HalfOpenMonitorState).
        connectionEpoch += 1

        // EXIGENCE №1 — the connectionState sink only fires on socket-state
        // CHANGES; evaluate once here in case the call establishes while the
        // socket is already down (e.g. media connected during a gateway blip).
        isSignalingDegraded = CallReliabilityPolicy.signalingDegraded(
            callEstablished: true,
            socketConnected: MessageSocketManager.shared.isConnected
        )
        // Audio session was configured ONCE at peer-connection setup; CallKit
        // drives activation via provider:didActivate:, which is the single
        // place that flips RTCAudioSession.isAudioEnabled.
        // On reconnect use a lighter haptic — the user is mid-call, not initiating.
        playHaptic(wasReconnecting ? .light : .heavy)
        appStateObserver.startScreenCaptureMonitoring()
        resetCallClockIfNeeded(wasReconnecting: wasReconnecting)
        // Snapshots analytics périodiques — idempotent (les reconnexions
        // repassent ici sans re-armer) ; annulé dans endCallInternal.
        if let callId = currentCallId {
            startAnalyticsSnapshots(callId: callId)
        }
        // Hygiène timer — l'appel est établi : le cutoff "pas de réponse" n'a
        // plus d'objet (son fire-site ne couvre que .ringing/.offering, mais
        // autant ne pas laisser une task morte armée).
        cancelOutgoingRingTimeout()
        reconnectAttempt = 0

        // Notify gateway that the ICE restart succeeded so call DB status is
        // reset to `active` and the peer sees reconnection as complete.
        if wasReconnecting, let callId = currentCallId {
            let userId = AuthManager.shared.currentUser?.id ?? ""
            MessageSocketManager.shared.emitCallReconnected(callId: callId, participantId: userId)
        }
        startDurationClock()

        startHeartbeat()
        webRTCService.startQualityMonitor()
        startThermalMonitoring()
        appStateObserver.startBackgroundMonitoring()

        reportOutgoingCallConnected(wasReconnecting: wasReconnecting)
    }

    func activateAudioOnConnect() {
        // §2.3/§6.4 — audio activation is gated on the PLATFORM, not on the
        // fragile `!rtc.isAudioEnabled` heuristic.
        //   - iPhone/iPad (`callUsesCallKit == true`): CallKit owns activation via
        //     `provider:didActivate:`. We must NEVER self-activate here — calling
        //     `setActive(true)` before `didActivate` makes iOS fail the audio
        //     device module silently ("no sound on 1st call"). Log only.
        //   - Mac (`callUsesCallKit == false`, iOS-app-on-Mac): `didActivate`
        //     never fires, so this `[AUDIO_FALLBACK]` IS the activation path.
        if !callUsesCallKit {
            activateAudioSessionWithoutCallKit()
        } else if !RTCAudioSession.sharedInstance().isAudioEnabled {
            Logger.calls.warning("[AUDIO] connected but RTCAudioSession not yet active — awaiting CallKit provider:didActivate (do NOT self-activate on iPhone/iPad)")
            // §RC-2 — if `didActivate` never arrives, the call would stay
            // connected-but-muted forever. Arm the one-shot fallback; it
            // re-checks the full stuck condition after a short delay and
            // no-ops when CallKit did its job in the meantime.
            scheduleStuckMutedFallback()
        }
    }

    func resetCallClockIfNeeded(wasReconnecting: Bool) {
        // Preserve the call start time and running duration on a genuine
        // mid-call reconnect (ICE restart) — but a nil callStartDate means this
        // is the FIRST real connection even if the FSM transited through
        // `.reconnecting` (pre-establishment ICE restart): without the reset,
        // durationTask died on the nil date and the timer froze at 00:00.
        if CallReliabilityPolicy.shouldResetCallClock(
            wasReconnecting: wasReconnecting,
            hasExistingStartDate: callStartDate != nil
        ) {
            callStartDate = Date()
            analytics.connectedDate = callStartDate
            callDuration = 0
        }
    }

    func reportOutgoingCallConnected(wasReconnecting: Bool) {
        // Audit P1-12 — `reportOutgoingCall(_:connectedAt:)` is the caller-
        // side timer trigger. On the callee side, CallKit starts its own
        // timer when CXAnswerCallAction is fulfilled — calling
        // reportOutgoingCall here would silently no-op and leave the
        // Recents entry with zero duration.
        // Guard on !wasReconnecting: calling this again after an ICE restart
        // resets CallKit's own timer in Recents/History, making the displayed
        // call duration shorter than the actual elapsed time.
        if !wasReconnecting, lastCallWasOutgoing, let uuid = activeCallUUID {
            callProvider.reportOutgoingCall(with: uuid, connectedAt: Date())
        }
    }

    /// Mac (`callUsesCallKit == false`, iOS-app-on-Mac): `didActivate` never
    /// fires, so this `[AUDIO_FALLBACK]` IS the activation path.
    func activateAudioSessionWithoutCallKit() {
        Logger.calls.warning("[AUDIO_FALLBACK] Mac (no CallKit didActivate) — activation manuelle de RTCAudioSession")
        audioSessionQueue.sync {
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            do {
                let configuration = RTCAudioSessionConfiguration.webRTC()
                configuration.category = AVAudioSession.Category.playAndRecord.rawValue
                // CALL-FIX 2026-06-06 (macOS) — `.default` avoids the voice-processing
                // I/O unit that faults on the mic uplink on iOS-app-on-Mac.
                configuration.mode = AVAudioSession.Mode.default.rawValue
                configuration.categoryOptions = [.allowBluetoothHFP, .duckOthers]
                try rtc.setConfiguration(configuration, active: true)
                rtc.isAudioEnabled = true
                Logger.calls.info("[AUDIO_FALLBACK] RTCAudioSession activée manuellement (mode=\(configuration.mode), category=\(configuration.category))")
            } catch {
                Logger.calls.error("[AUDIO_FALLBACK] échec activation manuelle: \(error.localizedDescription)")
            }
            rtc.unlockForConfiguration()
        }
    }

    func startDurationClock() {
        durationTask?.cancel()
        durationTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard await cancellableSleep(for: .seconds(1)), !Task.isCancelled else { return }
                guard let self else { return }
                // Défense en profondeur : un callStartDate momentanément nil ne
                // doit PAS tuer la boucle (l'ancien `return` gelait le chrono à
                // 00:00 pour tout le reste de l'appel) — on saute juste le tick.
                guard let start = self.callStartDate else { continue }
                self.callDuration = Date().timeIntervalSince(start)
            }
        }
    }

    private func startThermalMonitoring() {
        thermalMonitor.delegate = self
        thermalMonitor.startMonitoring()
    }

    private func startHeartbeat() {
        heartbeatTask?.cancel()
        let interval = QualityThresholds.heartbeatIntervalSeconds
        heartbeatTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                let nanos = UInt64(interval * 1_000_000_000)
                guard await cancellableSleep(for: .nanoseconds(nanos)), !Task.isCancelled else { return }
                guard let self, let callId = self.currentCallId else { return }
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

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
