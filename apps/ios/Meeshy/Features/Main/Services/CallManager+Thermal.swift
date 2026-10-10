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

/// La réponse de `CallManager` à l'échauffement de l'appareil : à chaque palier
/// thermique, la cadence et les effets vidéo de l'appel se replient.

// MARK: - ThermalStateMonitorDelegate

extension CallManager: ThermalStateMonitorDelegate {
    nonisolated func thermalStateDidChange(to state: ProcessInfo.ThermalState) {
        Task { @MainActor [weak self] in
            guard let self, self.callState == .connected else { return }
            // PiP : framerate thermal-aware (la vignette est petite → throttle
            // agressif possible). Restauré à 15 fps dès le retour en nominal/fair.
            self.pip.setMaxFrameRate(self.pipFrameRate(for: state))
            if state == .critical {
                self.webRTCService.videoFilters.reset()
                Logger.calls.warning("Thermal critical — disabled all filters (video)")
                if self.isVideoEnabled {
                    self.isVideoEnabled = false
                    // Audit finding — this used to call downgradeFromVideo()
                    // directly here, unserialized against videoToggleTask/
                    // holdVideoTask/survivalVideoTask. A thermal-critical event
                    // firing mid-toggle (or mid-hold/unhold) ran a fourth,
                    // concurrent camera/transceiver actuation — exactly what
                    // every other site in this file chains onto the previous
                    // task to prevent (upgradeToVideo/downgradeFromVideo never
                    // check cancellation mid-flight and two concurrent calls
                    // corrupt state). Route through the same chained-task
                    // pattern as toggleVideo/handleHold/applySurvivalVideoSend.
                    let previousToggle = self.videoToggleTask
                    let previousHold = self.holdVideoTask
                    let previousSurvival = self.survivalVideoTask
                    let previousICERestart = self.iceRestartTask
                    let previousAnswer = self.signalOfferAnswerTask
                    let previousCameraSwitch = self.cameraSwitchTask
                    self.videoToggleTask?.cancel()
                    self.videoToggleTask = Task { @MainActor [weak self] in
                        await previousToggle?.value
                        await previousHold?.value
                        _ = await previousSurvival?.value
                        await previousICERestart?.value
                        await previousAnswer?.value
                        await previousCameraSwitch?.value
                        guard let self, !Task.isCancelled else { return }
                        // §5.4 — use downgradeFromVideo (sets transceiver direction +
                        // stops capture) rather than enableVideo(false) (track.enabled
                        // only). Without the direction change the peer's SDP still
                        // advertises sendRecv and the RTP session stays open, which
                        // means the peer's decoder never tears down and the "camera off"
                        // media-toggled is the only signal it gets — race-prone and
                        // semantically wrong. Mirror the manual toggleVideo() path.
                        let needsRenegotiation = await self.webRTCService.downgradeFromVideo()
                        guard !Task.isCancelled else { return }
                        // Audit finding — the line above was missing: without it, an
                        // in-flight thermal downgrade that got cancelled (e.g. the user
                        // re-enabled video, which cancels this Task via videoToggleTask)
                        // ran to completion anyway, emitting a stale "video off" offer to
                        // the peer right after the newer task's "video on" offer — a
                        // real, avoidable flicker. Mirrors toggleVideo/handleHold, which
                        // both recheck cancellation immediately after this same await.
                        self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                        self.updateAudioSessionModeForCurrentVideoState()
                        self.videoSurvivalController.reset()
                        // P0-3 — signal the peer (avatar placeholder, not a frozen frame).
                        if let callId = self.currentCallId {
                            MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
                        }
                        // Renegotiate so the peer's SDP transceiver direction matches
                        // the video downgrade (media-toggled alone does not update the
                        // remote offer's m-sections).
                        if needsRenegotiation,
                           let callId = self.currentCallId,
                           let userId = self.remoteUserId,
                           let offer = await self.webRTCService.createOffer(),
                           self.currentCallId == callId {
                            self.emitCallOffer(callId: callId, toUserId: userId, isVideo: false, sdp: offer)
                            Logger.calls.warning("Thermal critical — SDP renegotiation offer emitted (video downgrade)")
                        }
                        Logger.calls.warning("Thermal critical — disabled video")
                    }
                }
            } else if state == .serious {
                self.webRTCService.videoFilters.config.backgroundBlurEnabled = false
                self.webRTCService.videoFilters.config = self.webRTCService.videoFilters.config.selectingFaceEffect(.none)
                Logger.calls.warning("Thermal serious — disabled advanced filters")
            }
        }
    }
}


private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
