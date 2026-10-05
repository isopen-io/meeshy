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

/// Décrocher un appel entrant : action CallKit, attente de l'offre SDP de
/// l'appelant et réponse.

extension CallManager {

    // MARK: - Answer Call

    func answerCall() {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard let callId = currentCallId, let userId = remoteUserId else { return }

        // Micro absolument requis pour répondre. Sur le chemin in-app,
        // `IncomingCallView` a déjà demandé la permission avant d'afficher
        // Accepter/Refuser ; sur le chemin CallKit, l'acceptation vient de
        // l'UI système et rien ne peut être demandé en amont — on tranche donc
        // ici. Sans micro, l'appel se connecterait muet : on raccroche tout de
        // suite avec un renvoi vers les Réglages, plutôt que de laisser
        // l'appelant parler dans le vide.
        guard MediaPermissionState.microphone.isUsable else {
            Logger.calls.warning("[CALL] answer refused: microphone permission missing — ending call")
            FeedbackToastManager.shared.showError(
                MediaPermissionCoordinator.deniedMessage(for: .microphone)
            ) { MediaPermissionCoordinator.openSettings() }
            endCall()
            return
        }

        // CALL-FIX 2026-06-06 — stop the incoming ringtone the INSTANT the user
        // accepts, not at .connected (which is seconds later after ICE). Otherwise
        // the ringtone keeps playing through the connecting phase.
        ringbackPlayer.stop()
        ringbackPlayer.stopRingtone()

        analyticsNegotiationStartDate = Date()
        callState = .connecting
        // Audio session is configured at peer-connection setup (handleIncoming…),
        // not here — CallKit drives activation via provider:didActivate:.

        // Guard behind `callUsesCallKit`: a foreground in-app call (or iOS-app-on-Mac)
        // never calls `reportNewIncomingCall`, so requesting CXAnswerCallAction for its
        // UUID is guaranteed to fail (CallKit never heard of it) — same rationale as
        // the `callUsesCallKit` guard on `toggleMute()`.
        if let uuid = activeCallUUID, callUsesCallKit {
            let answerAction = CXAnswerCallAction(call: uuid)
            let transaction = CXTransaction(action: answerAction)
            callController.request(transaction) { error in
                if let error { Logger.calls.error("CallKit answer failed: \(error.localizedDescription)") }
            }
        }

        if let remoteOffer = pendingRemoteOffer {
            // SDP offer already received while ringing — create answer immediately.
            // Audit finding — this called webRTCService.createAnswer() directly,
            // unserialized against the videoToggleTask/holdVideoTask/survivalVideoTask/
            // iceRestartTask family: a foreground answer landing while a local
            // hold/toggle/ICE-restart is mid-createOffer() could run createAnswer()
            // concurrently on the same RTCPeerConnection. Chained onto
            // `signalOfferAnswerTask` — see the doc-comment on `survivalVideoTask`.
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
                // Phase 2 fix — Bug 2: wait for local media transceivers
                // (emitCallJoin is now decoupled from startLocalMedia).
                await self.localMediaTask?.value
                guard let answer = await self.webRTCService.createAnswer(from: remoteOffer) else {
                    guard self.currentCallId == callId else { return }
                    // Local SDP generation failure is invisible to the peer — without
                    // this signal the caller sits in .connecting/.ringing until the
                    // gateway's CallCleanupService cron reaps the zombie (~60s).
                    MessageSocketManager.shared.emitCallEnd(callId: callId)
                    self.failCall("Failed to create SDP answer")
                    return
                }
                guard self.currentCallId == callId else {
                    Logger.calls.info("[CALL] buffered-offer answer discarded: call ended during createAnswer")
                    return
                }
                await self.emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
                self.pendingRemoteOffer = nil
                Logger.calls.info("Call answered with buffered SDP offer: \(callId)")
            }
        } else {
            // SDP offer not yet received — wait for it via handleSignalOffer with timeout
            Logger.calls.info("Call answered but SDP offer not yet received, waiting: \(callId)")
            scheduleSdpOfferTimeout(callId: callId)
        }

        HapticFeedback.success()
    }

    /// Arms the "peer never sent an SDP offer" watchdog shared by `answerCall()`
    /// and `answerCallReady()` — both enter `.connecting` before the offer has
    /// arrived and must proactively fail (and notify the gateway) instead of
    /// hanging until the cron reaper eventually cleans up the zombie call.
    private func scheduleSdpOfferTimeout(callId: String) {
        sdpOfferTimeoutTask?.cancel()
        sdpOfferTimeoutTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.sdpOfferTimeoutSeconds))
            guard let self, !Task.isCancelled else { return }
            guard case .connecting = self.callState, self.currentCallId == callId else { return }
            Logger.calls.error("SDP offer timeout for call: \(callId)")
            // The peer is still waiting on an answer that will never come —
            // tell the gateway now instead of leaving it to the cron reaper.
            MessageSocketManager.shared.emitCallEnd(callId: callId)
            self.failCall(String(localized: "call.error.timeout"))
        }
    }

    /// Async SDP+media setup kicked off by `CXAnswerCallAction`. As of the
    /// [Fix 2026-07-02]/[Fix 2026-07-03] hold-and-settle model, the action is
    /// NOT fulfilled synchronously here: `provider(_:perform: CXAnswerCallAction)`
    /// holds it via `holdPendingAnswerAction` (so CallKit's callee elapsed-timer
    /// doesn't start before the connection exists) and this method settles it
    /// later — fulfilled in `transitionToConnected`, failed on pre-connect
    /// teardown, or fulfilled by the 10s safety net — never inline here. A
    /// `createAnswer` failure in this method tears the call down via
    /// `endCallInternal`/`failCall`, which routes back to `settlePendingAnswerAction`
    /// rather than calling `action.fail()` directly.
    func answerCallReady() async {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard let callId = currentCallId, let userId = remoteUserId else { return }

        // Same guard as `answerCall()` — on THIS path the acceptance came from
        // CallKit's system UI (lock screen, Dynamic Island, CarPlay, AirPods),
        // so nothing could be requested upstream either. Without it, a call
        // answered via CallKit with the microphone denied/revoked connects
        // silently muted: no toast, no Settings redirect, no hangup — the
        // caller just talks into silence. Routed through `failCall()` rather
        // than `endCall()`/`endCallInternal()` directly because a
        // `CXAnswerCallAction` is already held (`holdPendingAnswerAction`) and
        // must be resolved via `settlePendingAnswerAction`, which `failCall()`
        // reaches through `endCallInternal`.
        guard MediaPermissionState.microphone.isUsable else {
            Logger.calls.warning("[CALL] CallKit answer refused: microphone permission missing — ending call")
            FeedbackToastManager.shared.showError(
                MediaPermissionCoordinator.deniedMessage(for: .microphone)
            ) { MediaPermissionCoordinator.openSettings() }
            failCall("Microphone permission missing")
            return
        }

        analyticsNegotiationStartDate = Date()
        callState = .connecting

        if let remoteOffer = pendingRemoteOffer {
            self.pendingRemoteOffer = nil
            // Audit finding — this called webRTCService.createAnswer() directly,
            // unserialized against the videoToggleTask/holdVideoTask/survivalVideoTask/
            // iceRestartTask family: a CallKit answer landing while a local
            // hold/toggle/ICE-restart is mid-createOffer() could run createAnswer()
            // concurrently on the same RTCPeerConnection — a race that can bake a
            // wrong transceiver direction into the SDP answer, producing a
            // one-way/silent-video call. Chained onto `signalOfferAnswerTask` —
            // see the doc-comment on `survivalVideoTask`.
            let previousToggle = videoToggleTask
            let previousHold = holdVideoTask
            let previousSurvival = survivalVideoTask
            let previousICERestart = iceRestartTask
            let previousAnswer = signalOfferAnswerTask
            let previousCameraSwitch = cameraSwitchTask
            let answerTask = Task { [weak self] in
                await previousToggle?.value
                await previousHold?.value
                _ = await previousSurvival?.value
                await previousICERestart?.value
                await previousAnswer?.value
                await previousCameraSwitch?.value
                guard let self else { return }
                // Phase 2 fix — Bug 2: wait for local media transceivers before
                // createAnswer. CallKit gives ample time for CXAnswerCallAction
                // (10s+), so awaiting camera/mic warmup here is safe.
                await self.localMediaTask?.value
                guard let answer = await self.webRTCService.createAnswer(from: remoteOffer) else {
                    guard self.currentCallId == callId else { return }
                    // Local SDP generation failure is invisible to the peer — without
                    // this signal the caller sits in .connecting/.ringing until the
                    // gateway's CallCleanupService cron reaps the zombie (~60s).
                    MessageSocketManager.shared.emitCallEnd(callId: callId)
                    self.failCall("Failed to create SDP answer")
                    return
                }
                guard self.currentCallId == callId else {
                    Logger.calls.info("[CALL] CallKit answer discarded: call ended during createAnswer")
                    return
                }
                // PERF-004: await the gateway ACK (3s) so when answerCallReady
                // returns, the CXAnswerCallAction fulfill is paired with an SDP
                // answer that has actually been relayed to the peer.
                await self.emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
                Logger.calls.info("Call answered (CallKit) with buffered SDP offer: \(callId)")
            }
            signalOfferAnswerTask = answerTask
            await answerTask.value
        } else {
            Logger.calls.info("Call answered (CallKit), awaiting SDP offer: \(callId)")
            scheduleSdpOfferTimeout(callId: callId)
        }

        HapticFeedback.success()
    }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
