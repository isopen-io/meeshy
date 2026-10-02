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

/// Le côté appelé de la négociation : démarrage des médias locaux, offre SDP
/// de l'appelant après l'auto-jonction, et `call:join` fiable.

extension CallManager {

    // MARK: - Local Media Start Helper

    @MainActor
    func performLocalMediaStart(isVideo: Bool, callId: String) async {
        do {
            try await startLocalMediaKeepingMute(isVideo: isVideo, callId: callId)
            guard currentCallId == callId else { return }
            if isVideo { hasLocalVideoTrack = true }
        } catch WebRTCError.simulatorVideoUnsupported {
            Logger.calls.warning("Simulator video unsupported — continuing audio-only")
            guard currentCallId == callId else { return }
            isVideoEnabled = false
            do {
                try await startLocalMediaKeepingMute(isVideo: false, callId: callId)
            } catch {
                // Le repli a échoué à son tour : l'appel n'a PLUS AUCUN média
                // (ni vidéo ni audio) — état muet invisible sans cette trace.
                Logger.calls.error("Audio-only fallback failed, call has no local media at all: \(error.localizedDescription, privacy: .public)")
            }
            guard currentCallId == callId else { return }
        } catch WebRTCError.cameraPermissionDenied {
            Logger.calls.warning("[CALL_SETUP] camera permission denied — degrading to audio-only")
            guard currentCallId == callId else { return }
            isVideoEnabled = false
            do {
                try await startLocalMediaKeepingMute(isVideo: false, callId: callId)
            } catch {
                // Le repli a échoué à son tour : l'appel n'a PLUS AUCUN média
                // (ni vidéo ni audio) — état muet invisible sans cette trace.
                Logger.calls.error("Audio-only fallback failed, call has no local media at all: \(error.localizedDescription, privacy: .public)")
            }
            guard currentCallId == callId else { return }
            FeedbackToastManager.shared.showError(
                String(localized: "call.video.permission.denied",
                       defaultValue: "Caméra : accès refusé — toucher pour ouvrir les Paramètres",
                       bundle: .main)
            ) {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                UIApplication.shared.open(url)
            }
        } catch is CancellationError {
            return
        } catch {
            Logger.calls.error("startLocalMedia failed: \(error.localizedDescription)")
            if currentCallId == callId {
                failCall(String(localized: "call.error.media"))
            }
        }
    }

    // MARK: - Signal Offer (real SDP from caller after auto-join)

    func handleSignalOffer(callId: String, sdp: SessionDescription, generation: Int = 0) {
        guard currentCallId == callId else {
            Logger.calls.warning("Signal offer for unknown call: \(callId)")
            return
        }
        // §3.5 — drop offers from an older negotiation epoch (churned socket /
        // replayed buffer). The newest generation always wins.
        guard acceptIncomingNegotiation(generation, isOffer: true) else { return }
        guard let userId = remoteUserId else { return }

        switch callState {
        case .ringing:
            // User hasn't accepted yet — buffer the offer
            pendingRemoteOffer = sdp
            Logger.calls.info("SDP offer buffered for call: \(callId), waiting for user to accept")

        case .connecting:
            // User already accepted but SDP arrived late — create answer immediately
            let previousToggleConnecting = videoToggleTask
            let previousHoldConnecting = holdVideoTask
            let previousSurvivalConnecting = survivalVideoTask
            let previousICERestartConnecting = iceRestartTask
            let previousAnswerConnecting = signalOfferAnswerTask
            let previousCameraSwitchConnecting = cameraSwitchTask
            signalOfferAnswerTask = Task { [weak self] in
                // Serialize with every other in-flight video-transition/renegotiation
                // path — see the doc-comment on `survivalVideoTask`.
                await previousToggleConnecting?.value
                await previousHoldConnecting?.value
                _ = await previousSurvivalConnecting?.value
                await previousICERestartConnecting?.value
                await previousAnswerConnecting?.value
                await previousCameraSwitchConnecting?.value
                guard let self else { return }
                // Phase 2 fix — Bug 2: wait for local media transceivers before
                // createAnswer (called concurrently with emitCallJoin).
                await self.localMediaTask?.value
                guard let answer = await self.webRTCService.createAnswer(from: sdp) else {
                    guard self.currentCallId == callId else { return }
                    // Local SDP generation failure is invisible to the peer — without
                    // this signal the caller sits in .connecting/.ringing until the
                    // gateway's CallCleanupService cron reaps the zombie (~60s).
                    MessageSocketManager.shared.emitCallEnd(callId: callId)
                    self.failCall("Failed to create SDP answer")
                    return
                }
                guard self.currentCallId == callId else {
                    Logger.calls.info("[CALL] late-offer answer discarded: call ended during createAnswer")
                    return
                }
                await self.emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
                Logger.calls.info("SDP answer created from late offer for call: \(callId)")
            }

        case .connected, .reconnecting:
            // §4.2 — mid-call renegotiation (the peer's A/V switch, or an ICE
            // restart it initiated). Previously this fell into `default` and was
            // DROPPED, leaving the peer's newly-enabled video one-way. Apply the
            // offer in place and answer it; the perfect-negotiation glare guard
            // in the client handles a simultaneous local offer.
            //
            // Audit finding — this used to call createAnswer() directly here,
            // unserialized against videoToggleTask/holdVideoTask/survivalVideoTask/
            // iceRestartTask: a peer offer landing while a local hold/toggle/ICE
            // restart is mid-createOffer() could run createAnswer() concurrently on
            // the same RTCPeerConnection. Chained onto `signalOfferAnswerTask` — see
            // the doc-comment on `survivalVideoTask`.
            let previousToggle = videoToggleTask
            let previousHold = holdVideoTask
            let previousSurvival = survivalVideoTask
            let previousICERestart = iceRestartTask
            let previousAnswer = signalOfferAnswerTask
            let previousCameraSwitch = cameraSwitchTask
            signalOfferAnswerTask = Task { [weak self] in
                await previousToggle?.value
                await previousHold?.value
                _ = await previousSurvival?.value
                await previousICERestart?.value
                await previousAnswer?.value
                await previousCameraSwitch?.value
                guard let self else { return }
                guard let answer = await self.webRTCService.createAnswer(from: sdp) else {
                    guard self.currentCallId == callId else { return }
                    Logger.calls.error("Failed to answer mid-call renegotiation offer for call: \(callId)")
                    return
                }
                guard self.currentCallId == callId else {
                    Logger.calls.info("[CALL] renegotiation answer discarded: call ended during createAnswer")
                    return
                }
                await self.emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
                Logger.calls.info("Renegotiation answer sent for call: \(callId)")
            }

        default:
            Logger.calls.warning("Signal offer received in unexpected state: \(String(describing: self.callState))")
        }
    }

    // MARK: - Reliable call:join (incoming paths)

    /// [Fix 2026-07-02] Reliable `call:join` — replaces the fire-and-forget
    /// `emitCallJoin` on BOTH incoming-call paths.
    ///
    /// On a VoIP-push cold start (locked phone, answer from the CallKit lock
    /// screen) no view is mounted, so `connect()` — only triggered by
    /// RootView/ConversationView appearing in the foreground — has never run:
    /// the socket is nil and `socket?.emit("call:join")` vanishes. The gateway
    /// never creates our CallParticipant, then rejects every `call:signal` we
    /// send ("Sender not a participant") and the caller times out to `missed`
    /// even though the user answered (observed in prod, callIds
    /// 6a461091/6a46110c, 2026-07-02). The P1-30 rejoin net doesn't cover this:
    /// the FIRST connection never fires `didReconnect` (`hadPreviousConnection`).
    ///
    /// Strategy: force `connect()` when needed, wait for `isConnected`
    /// (200 ms poll, 30 s budget — under the 45 s ring), then ACK-aware
    /// `call:join` with one retry. Gateway-side joinCall is idempotent, so a
    /// duplicate join from the foreground path is harmless.
    func joinCallRoomReliably(callId: String) {
        callJoinTask?.cancel()
        callJoinTask = Task { @MainActor [weak self] in
            let socket = MessageSocketManager.shared
            if !socket.isConnected {
                Logger.calls.warning("[CALL_JOIN] socket not connected — forcing connect() (callId=\(callId))")
                socket.connect()
            }
            var waitedNs: UInt64 = 0
            while !socket.isConnected && waitedNs < 30_000_000_000 && !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 200_000_000)
                waitedNs += 200_000_000
            }
            guard let self, !Task.isCancelled else { return }
            guard self.currentCallId == callId, self.callState.isActive else { return }
            guard socket.isConnected else {
                Logger.calls.error("[CALL_JOIN] socket still not connected after 30s — join impossible (callId=\(callId))")
                return
            }
            var joined = await socket.emitCallJoinWithAck(callId: callId)
            if !joined, !Task.isCancelled, self.currentCallId == callId, self.callState.isActive {
                Logger.calls.warning("[CALL_JOIN] call:join ACK failed — retrying once (callId=\(callId))")
                joined = await socket.emitCallJoinWithAck(callId: callId)
            }
            Logger.calls.info("[CALL_JOIN] call:join \(joined ? "ACKed" : "NOT ACKed") (callId=\(callId))")
        }
    }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
