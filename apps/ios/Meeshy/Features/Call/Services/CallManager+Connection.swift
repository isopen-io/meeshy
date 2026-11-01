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

/// L'établissement d'un appel : passage à `.connected` et battement de cœur.
/// La surveillance des états transitoires vit dans `CallReliabilityMonitor`.

extension CallManager {

    // MARK: - Private: State Transitions

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

        audio.activateAudioOnConnect()

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
        ringTimeouts.cancelOutgoingRingTimeout()
        reconnectAttempt = 0

        // Notify gateway that the ICE restart succeeded so call DB status is
        // reset to `active` and the peer sees reconnection as complete.
        if wasReconnecting, let callId = currentCallId {
            let userId = AuthManager.shared.currentUser?.id ?? ""
            MessageSocketManager.shared.emitCallReconnected(callId: callId, participantId: userId)
        }
        liveClock.startDurationClock()

        liveClock.startHeartbeat()
        webRTCService.startQualityMonitor()
        startThermalMonitoring()
        appStateObserver.startBackgroundMonitoring()

        reportOutgoingCallConnected(wasReconnecting: wasReconnecting)
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

    private func startThermalMonitoring() {
        thermalMonitor.delegate = videoSuspension
        thermalMonitor.startMonitoring()
    }

}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
