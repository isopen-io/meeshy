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

/// La mise en attente CallKit d'un appel (et sa reprise), et le relais des
/// tonalités DTMF.

extension CallManager {

    // MARK: - CallKit Hold/Unhold

    /// Called by `CXSetHeldCallAction`. Suspends/restores outbound video on hold so
    /// the peer receives a proper "camera off" signal rather than a frozen frame.
    /// Mirrors the background-suspension pattern: `isVideoEnabled` (user intent) is
    /// preserved; video auto-resumes on unhold unless the survival controller or
    /// background is also suspending it.
    func handleHold(_ isOnHold: Bool) {
        guard callState.isActive, let callId = currentCallId else { return }
        if isOnHold {
            if isVideoEnabled {
                isVideoSuspendedByHold = true
                // Chain onto the previous hold-video task instead of cancelling it:
                // `Task.cancel()` is cooperative and `disableLocalVideo`/`enableLocalVideo`
                // never check `Task.isCancelled` mid-flight (they await `stopCapture`/
                // `startCapture`), so a rapid hold→unhold→hold could otherwise let a
                // cancelled downgrade and a fresh upgrade mutate the same camera
                // capturer/transceiver concurrently, leaving video stuck broken.
                // Awaiting the prior task's `.value` first serializes every hold
                // transition without relying on cancellation to stop in-flight work.
                //
                // Mirrors toggleVideo/applySurvivalVideoSend: a direction flip alone
                // (inside downgradeFromVideo) never reaches the peer. If ANY other
                // renegotiation fires while on hold (e.g. an ICE restart from a
                // WiFi↔cellular handoff — exactly what a GSM call causes), it would
                // otherwise bake the stale recvOnly direction into the SDP and
                // permanently negotiate it, breaking outbound video for the rest of
                // the call even after unhold. Renegotiating immediately keeps the
                // locally-flipped direction and the negotiated SDP state in sync.
                let previousToggle = videoToggleTask
                let previousHold = holdVideoTask
                let previousSurvival = survivalVideoTask
                let previousICERestart = iceRestartTask
                let previousAnswer = signalOfferAnswerTask
                let previousCameraSwitch = cameraSwitchTask
                holdVideoTask = Task { [weak self] in
                    // Serialize with every other in-flight video-transition path
                    // (manual toggle, prior hold/unhold, survival suspend/resume,
                    // ICE restart, peer-initiated renegotiation answer) — see the
                    // doc-comment on `survivalVideoTask`.
                    await previousHold?.value
                    await previousToggle?.value
                    _ = await previousSurvival?.value
                    await previousICERestart?.value
                    await previousAnswer?.value
                    await previousCameraSwitch?.value
                    guard let self, !Task.isCancelled else { return }
                    let needsRenegotiation = await self.webRTCService.downgradeFromVideo()
                    guard !Task.isCancelled else { return }
                    self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                    if needsRenegotiation,
                       let callId = self.currentCallId,
                       let userId = self.remoteUserId,
                       let offer = await self.webRTCService.createOffer(),
                       self.currentCallId == callId {
                        self.emitCallOffer(callId: callId, toUserId: userId, isVideo: false, sdp: offer)
                        Logger.calls.info("[CALL] hold renegotiation offer sent (video=false)")
                    }
                }
                MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
                Logger.calls.info("CallKit hold — video suspended, peer notified (callId=\(callId))")
            }
        } else {
            if isVideoSuspendedByHold {
                isVideoSuspendedByHold = false
                // L6-1 — `isVideoSuspended` retiré de cette condition : un gel
                // réseau ne relâche pas la caméra, donc il ne doit pas empêcher
                // le unhold de la REPRENDRE. L'y laisser gardait la vidéo noire
                // jusqu'à la reprise indépendante du contrôleur de survie.
                if isVideoEnabled && !isVideoSuspendedByCaptureInterruption {
                    // Companion fix: without renegotiating here, unhold only flips
                    // the local track/direction back — the peer's negotiated SDP
                    // state (possibly stuck at recvOnly from a hold-time ICE
                    // restart) never actually gets corrected, leaving outbound
                    // video silently broken for the rest of the call. Chains onto
                    // the previous task rather than cancelling it for the same
                    // reason as the hold path above.
                    let previousToggle = videoToggleTask
                    let previousHold = holdVideoTask
                    let previousSurvival = survivalVideoTask
                    let previousICERestart = iceRestartTask
                    let previousAnswer = signalOfferAnswerTask
                    let previousCameraSwitch = cameraSwitchTask
                    holdVideoTask = Task { [weak self] in
                        // Serialize with every other in-flight video-transition path —
                        // see the doc-comment on `survivalVideoTask`.
                        await previousHold?.value
                        await previousToggle?.value
                        _ = await previousSurvival?.value
                        await previousICERestart?.value
                        await previousAnswer?.value
                        await previousCameraSwitch?.value
                        guard let self, !Task.isCancelled else { return }
                        do {
                            let needsRenegotiation = try await self.webRTCService.upgradeToVideo()
                            guard !Task.isCancelled else { return }
                            self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                            if needsRenegotiation,
                               let callId = self.currentCallId,
                               let userId = self.remoteUserId,
                               let offer = await self.webRTCService.createOffer(),
                               self.currentCallId == callId {
                                self.emitCallOffer(callId: callId, toUserId: userId, isVideo: true, sdp: offer)
                                Logger.calls.info("[CALL] unhold renegotiation offer sent (video=true)")
                            }
                        } catch WebRTCError.cameraPermissionDenied {
                            // Audit finding — this previously swallowed the error via
                            // `try?`, which left `isVideoEnabled == true` with no video
                            // track, no peer correction, and no user feedback: a silent,
                            // unrecoverable video outage for the rest of the call.
                            // Mirror toggleVideo/actuateSurvivalVideoSend's handling.
                            guard !Task.isCancelled else { return }
                            Logger.calls.error("unhold video recovery failed: camera permission denied — disabling video")
                            self.isVideoEnabled = false
                            self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                            self.videoSurvivalController.reset()
                            if let callId = self.currentCallId {
                                MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
                            }
                            FeedbackToastManager.shared.showError(
                                String(localized: "call.video.permission.denied",
                                       defaultValue: "Caméra : accès refusé — toucher pour ouvrir les Paramètres",
                                       bundle: .main)
                            ) {
                                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                                UIApplication.shared.open(url)
                            }
                        } catch {
                            guard !Task.isCancelled else { return }
                            Logger.calls.error("unhold video recovery failed: \(error.localizedDescription)")
                            self.isVideoEnabled = false
                            self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                            // Same discipline as the cameraPermissionDenied branch above:
                            // isVideoEnabled=false alone only resets survival state on its
                            // NEXT quality tick, and `handle()` no-ops entirely while a
                            // transition is already in flight — leaving a stale
                            // isVideoSuspended/isTransitioning behind this generic failure.
                            self.videoSurvivalController.reset()
                            if let callId = self.currentCallId {
                                MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
                            }
                        }
                    }
                    MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: true)
                    Logger.calls.info("CallKit unhold — video restored, peer notified (callId=\(callId))")
                }
            }
        }
    }

    // MARK: - DTMF Forwarding

    /// Called by `CXPlayDTMFCallAction` to forward CallKit keypad digits to WebRTC.
    func sendDTMF(digits: String) {
        let validCharacters = CharacterSet(charactersIn: "0123456789*#ABCD")
        guard !digits.isEmpty, digits.unicodeScalars.allSatisfy({ validCharacters.contains($0) }) else { return }
        webRTCService.sendDTMF(digits: digits)
    }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
