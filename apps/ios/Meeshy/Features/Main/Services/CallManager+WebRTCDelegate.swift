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

/// Le délégué `WebRTCService` de `CallManager` : candidats ICE locaux, état de
/// la connexion pair-à-pair, pistes distantes, interruptions de la caméra,
/// niveau de qualité et statistiques — chaque rappel revient sur le MainActor.

// MARK: - WebRTCServiceDelegate

extension CallManager: WebRTCServiceDelegate {
    nonisolated func webRTCService(_ service: WebRTCService, didGenerateCandidate candidate: IceCandidate) {
        Task { @MainActor [weak self] in
            guard let self, let callId = self.currentCallId, let userId = self.remoteUserId else { return }
            let fromUserId = AuthManager.shared.currentUser?.id ?? ""
            // CRITIQUE — `sdpMLineIndex` DOIT être un Int (pas une String) :
            // le gateway valide via Zod `z.number().optional()` et rejette
            // tout signal ICE avec un sdpMLineIndex string. Sans cela, AUCUN
            // candidate ICE n'est relayé au peer → ICE checking ne démarre
            // jamais et le call reste bloqué en `new` jusqu'au timeout.
            var payload: [String: Any] = [
                "candidate": candidate.candidate,
                "sdpMLineIndex": Int(candidate.sdpMLineIndex),
                "to": userId,
                "from": fromUserId,
                // §3.5 — candidates belong to the current negotiation generation.
                "negotiationId": self.negotiationId
            ]
            if let sdpMid = candidate.sdpMid {
                payload["sdpMid"] = sdpMid
            }
            if MessageSocketManager.shared.isConnected {
                MessageSocketManager.shared.emitCallSignal(
                    callId: callId,
                    type: "ice-candidate",
                    payload: payload
                )
                Logger.calls.debug("Sent ICE candidate for call: \(callId)")
            } else {
                // Cap the buffer: ICE can generate 50+ candidates in a single
                // restart round.  Candidates beyond the cap are for transports
                // we'll never relay anyway (stale ICE generation) and would
                // only bloat the flush on reconnect.
                if self.pendingIceCandidates.count < QualityThresholds.maxPendingIceCandidates {
                    self.pendingIceCandidates.append(["callId": callId, "payload": payload])
                    Logger.calls.debug("Buffered ICE candidate (socket down) for call: \(callId)")
                } else {
                    Logger.calls.warning("ICE candidate buffer full (\(QualityThresholds.maxPendingIceCandidates)) — dropping candidate for call: \(callId)")
                }
            }
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didChangeConnectionState state: PeerConnectionState) {
        Task { @MainActor [weak self] in
            self?.connectionQuality = state
        }
    }

    nonisolated func webRTCServiceDidConnect(_ service: WebRTCService) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            // FIX 2026-05-12 — transition directe à `.connected` sur ICE
            // connected, plus de gate RTP bloquant.
            //
            // Symptôme rapporté : "l'appelé se connecte mais pas l'appelant".
            // Cause racine : le caller envoyait son RTP mais ne recevait pas
            // celui du callee (NAT asymétrique, codec mismatch, ou simplement
            // 1ère seconde après ICE négociée — pas encore de packets entrants).
            // L'ancien RTP gate exigeait ≥5 inbound packets pour transitionner
            // à .connected, ce qui pour le caller pouvait ne JAMAIS arriver
            // → caller restait en .connecting indéfiniment pendant que le
            // callee (qui recevait bien le RTP du caller) passait à .connected.
            //
            // Nouvelle politique :
            // - ICE connected = call établi du point de vue signaling → on
            //   transitionne à .connected immédiatement
            // - Le RTP gate continue de tourner en parallèle MAIS uniquement
            //   pour informer la qualité (log debug si pas de RTP). Il
            //   n'affecte plus le state machine
            // - Si vraiment aucun RTP n'arrive jamais, l'utilisateur entend
            //   du silence — c'est un signal métier (mute, mic off, network)
            //   pas une raison de couper l'appel.
            // §5.8 — the reliability monitor (started at call setup) owns the
            // half-open self-heal once `.connected`; no per-connect RTP task here.
            switch self.callState {
            case .connecting:
                Logger.calls.info("[CallFSM] ICE connected — transition à .connected")
                self.transitionToConnected()
            case .reconnecting:
                Logger.calls.info("Reconnection successful — transition à .connected")
                self.transitionToConnected()
            case .offering:
                // ICE connected en .offering : handleRemoteAnswer n'a pas
                // tourné mais ICE a réussi. Catch-up direct à .connected.
                Logger.calls.warning("[CallFSM] ICE connected while state=.offering — direct catch-up à .connected")
                self.callState = .connecting
                self.transitionToConnected()
            default:
                Logger.calls.debug("[CallFSM] webRTCServiceDidConnect ignored in state \(String(describing: self.callState))")
            }
        }
    }

    nonisolated func webRTCServiceDidDisconnect(_ service: WebRTCService) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            let isFatal = self.webRTCService.connectionState == .failed
                       || self.webRTCService.connectionState == .closed
            switch self.callState {
            case .connected:
                self.attemptReconnection()
            case .reconnecting where !isFatal:
                // Transient ICE flap during renegotiation — in-flight Task owns the loop.
                Logger.calls.info("WebRTC disconnected during ICE restart — ignoring transient flap")
            case .reconnecting:
                // Fatal PeerConnection .failed/.closed during ICE restart: the
                // in-flight attempt is dead — escalate (advance the budget)
                // rather than coalesce into it.
                Logger.calls.warning("WebRTC fatal disconnect during ICE restart — triggering next attempt")
                self.attemptReconnection(escalate: true)
            default:
                Logger.calls.info("WebRTC disconnected in state: \(String(describing: self.callState))")
            }
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didReceiveRemoteVideoTrack track: Any) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            let wasVideoUIActive = self.isVideoUIActive
            self.hasRemoteVideoTrack = true
            // C7 — première arrivée du track distant sur un appel démarré en
            // audio : `configureAudioSession()` a figé `.voiceChat` au setup, où
            // `hasRemoteVideoTrack` était encore faux. Sans cette ligne la session
            // n'est jamais réalignée et le PiP peut refuser de démarrer.
            if !wasVideoUIActive && self.isVideoUIActive {
                self.updateAudioSessionModeForCurrentVideoState()
                self.updateProximityMonitoring()
            }
            // Robustesse — track distant recréé (ICE restart) : ré-attache le
            // renderer PiP au nouveau track sans reconstruire le controller AVKit
            // (no-op si le PiP n'est pas configuré). On relit `remoteVideoTrack`
            // sur le MainActor (déjà à jour côté client) plutôt que de capturer
            // le param non-Sendable `track` à travers la frontière d'isolation.
            if let current = self.remoteVideoTrack {
                self.pip.updateRemoteTrack(current as AnyObject)
                if self.pipConfiguredTrack != nil { self.pipConfiguredTrack = current as AnyObject }
            }
            Logger.calls.info("Remote video track received in CallManager")
        }
    }

    /// C3 — la session de capture caméra a été interrompue (ou l'interruption a
    /// pris fin). C'est le SEUL fait qui prouve que la caméra ne délivre plus :
    /// le passage en arrière-plan ne l'éteint pas quand un PiP système est actif
    /// et que la session porte `isMultitaskingCameraAccessEnabled`.
    nonisolated func webRTCService(_ service: WebRTCService, didChangeCameraInterruption interrupted: Bool) {
        Task { @MainActor [weak self] in
            self?.applyCameraSuspension(interrupted, cause: "capture-interruption")
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didChangeQualityLevel level: VideoQualityLevel, from previous: VideoQualityLevel) {
        Task { @MainActor [weak self] in
            guard let self, case .connected = self.callState, !self.isGroupPrimaryVacated else { return }
            guard UIAccessibility.isReduceMotionEnabled == false else { return }
            let generator = UINotificationFeedbackGenerator()
            switch level {
            case .poor, .critical:
                generator.notificationOccurred(.error)
            case .excellent, .good:
                if previous <= .fair {
                    generator.notificationOccurred(.success)
                }
            case .fair:
                break
            }
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didCollectStats stats: CallStats, level: VideoQualityLevel, packetLossPercent: Double) {
        Task { @MainActor [weak self] in
            guard let self, let callId = self.currentCallId else { return }
            // Always update cumulative stats for the call summary: byte counters
            // grow through ICE restart and the final snapshot must be fresh.
            self.lastKnownStats = stats
            // During ICE restart (.reconnecting) and initial setup (.connecting)
            // the RTP stream is paused: Δlost and Δreceived are both zero, so
            // RTT=0 and loss=0 — which reads as ".excellent" quality. Reporting
            // that level to the UI, the gateway, or the survival controller while
            // the call shows "Reconnecting…" misleads users and resets the survival
            // controller's degraded-streak timer prematurely. Gate all reporting
            // on callState == .connected — and never on the link of a primary
            // that left a group which goes on (#9090).
            guard case .connected = self.callState, !self.isGroupPrimaryVacated else { return }
            self.publishQualitySample(stats: stats, packetLossPercent: packetLossPercent)
            // #8978 — ne republier que ce qui CHANGE : chaque publication recalcule
            // tout l'écran d'appel, et ce relevé tombe toutes les 5 s.
            if self.liveVideoQualityLevel != level { self.liveVideoQualityLevel = level }
            let degraded = self.degradedLinkTracker.record(level: level)
            if self.isLinkQualityDegraded != degraded { self.isLinkQualityDegraded = degraded }
            MessageSocketManager.shared.emitCallQualityReport(
                callId: callId,
                level: Self.connectionQualityLabel(for: level),
                rtt: stats.roundTripTimeMs,
                packetLoss: packetLossPercent,
                bytesSent: stats.bandwidth,
                bytesReceived: stats.bytesReceived,
                availableOutgoingBitrateBps: stats.availableOutgoingBitrateBps,
                jitterMs: stats.jitterMs
            )

            // Accumulate quality distribution and RTT/loss running stats.
            let now = Date()
            if let prevDate = self.analyticsLastQualityDate, let prevLevel = self.analyticsCurrentLevel {
                self.analyticsQualitySeconds[prevLevel, default: 0] += now.timeIntervalSince(prevDate)
            }
            self.analyticsLastQualityDate = now
            self.analyticsCurrentLevel = level
            self.analyticsRttSum += stats.roundTripTimeMs
            self.analyticsSampleCount += 1
            self.analyticsPacketLossSum += packetLossPercent
            self.analyticsMaxPacketLoss = max(self.analyticsMaxPacketLoss, packetLossPercent)
            // Mirrors analyticsVideoFiltersUsed's polling above it: analyticsEffectsUsed
            // was declared and serialized but never populated, so every call silently
            // reported effectsUsed: []. Record the concrete effects the config exposes.
            let filterConfig = self.webRTCService.videoFilters.config
            if let face = filterConfig.activeFaceEffect.analyticsName { self.analyticsEffectsUsed.insert(face) }
            if filterConfig.isEnabled {
                self.analyticsVideoFiltersUsed = true
                self.analyticsEffectsUsed.insert("colorFilter")
            }
            if filterConfig.backgroundBlurEnabled {
                self.analyticsEffectsUsed.insert("backgroundBlur")
            }
            if filterConfig.skinSmoothingEnabled {
                self.analyticsEffectsUsed.insert("skinSmoothing")
            }

            // Feed the graceful-degradation survival layer. One sample per quality
            // tick; the controller's time-based hysteresis decides if a sustained
            // poor link warrants dropping to audio-only (and later recovering).
            self.videoSurvivalController.handle(level: level, userWantsVideo: self.isVideoEnabled)
        }
    }

}


private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
