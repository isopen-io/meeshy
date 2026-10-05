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

/// La survie vidéo d'un appel : quand la liaison se dégrade durablement,
/// `VideoSurvivalController` coupe l'envoi de la caméra puis le rétablit ;
/// ce fichier en est l'actionneur côté `CallManager`.

// MARK: - VideoSurvivalActuating

extension CallManager: VideoSurvivalActuating {
    /// FREEZE outbound video (sustained poor link): the encoder drops to its
    /// floor at 2 fps, so the peer keeps seeing a still image instead of losing
    /// the picture. Deliberately does NOT touch `isVideoEnabled` (the user's
    /// camera intent is preserved), NOT the track, NOT the capture session, and
    /// signals nothing to the peer — see `actuateSurvivalVideoSend`.
    func suspendOutboundVideo() async -> Bool {
        await applySurvivalVideoSend(enabled: false)
    }

    /// Hand the encoder back to the quality ladder once the link has recovered.
    /// There is no camera to re-acquire: the freeze never released it.
    func resumeOutboundVideo() async -> Bool {
        await applySurvivalVideoSend(enabled: true)
    }

    private func applySurvivalVideoSend(enabled: Bool) async -> Bool {
        // Only act while the user still wants video and we're in an active call.
        guard isVideoEnabled, let callId = currentCallId else { return false }
        // Do NOT act during an ICE restart: media parameters written against a
        // sender whose transport is mid-restart are lost with the old encoding,
        // and the published `isVideoSuspended` would then describe a floor that
        // is no longer applied. The survival controller re-evaluates once the
        // call reaches .connected and stats start flowing again.
        if case .reconnecting = callState { return false }
        // Do NOT act — in EITHER direction — while an OS-level suspension is
        // active: a CallKit hold (cellular pre-emption) or a background/capture
        // interruption has genuinely stopped the capture, `handleHold` already
        // owns the media transition for that window, and there is no live
        // encoding to floor or to release. Both directions are blocked, not just
        // resume: letting a suspend through mid-hold would publish
        // `isVideoSuspended = true` — the local "video paused" affordance — for
        // a call whose video is already off for an unrelated, visible reason.
        if isVideoSuspendedByHold || isVideoSuspendedByCaptureInterruption { return false }

        let previousToggle = videoToggleTask
        let previousHold = holdVideoTask
        let previousSurvival = survivalVideoTask
        let previousICERestart = iceRestartTask
        let previousAnswer = signalOfferAnswerTask
        let previousCameraSwitch = cameraSwitchTask
        let task = Task<Bool, Never> { @MainActor [weak self] in
            // Serialize with every other in-flight video-transition path (manual
            // toggle, CallKit hold/unhold, ICE restart, peer-initiated renegotiation
            // answer) — see the doc-comment on `survivalVideoTask`. The
            // `.reconnecting` state guards above already stop a NEW survival
            // transition from starting once a restart is under way, but chaining
            // here too closes the reverse window: an ICE restart beginning while
            // THIS task's own createOffer() is in flight.
            await previousToggle?.value
            await previousHold?.value
            _ = await previousSurvival?.value
            await previousICERestart?.value
            await previousAnswer?.value
            await previousCameraSwitch?.value
            guard let self, !Task.isCancelled else { return false }
            // Re-validate every guard: state may have changed while this transition
            // was queued behind a concurrent manual toggle or CallKit hold.
            guard self.isVideoEnabled, self.currentCallId == callId else { return false }
            if case .reconnecting = self.callState { return false }
            // Mirrors the pre-flight guard above — re-validated because state
            // may have changed (e.g. a hold started) while this transition
            // was queued behind a concurrent task.
            if self.isVideoSuspendedByHold || self.isVideoSuspendedByCaptureInterruption { return false }
            return await self.actuateSurvivalVideoSend(enabled: enabled, callId: callId)
        }
        survivalVideoTask = task
        return await task.value
    }

    /// L6-1/L6-2 — the actuator is an ENCODER floor, not a media transition.
    /// `freezeVideoForSurvival()` rewrites the video sender's parameters
    /// (100 kbps · 2 fps · 360p · `.maintainResolution`) and nothing else: the
    /// capture session keeps running, the track stays attached and the
    /// transceiver stays `sendRecv`. Consequences, both deliberate:
    ///
    /// • nothing to renegotiate — no `createOffer`, no `emitCallOffer`, so a
    ///   degraded link never risks SDP glare with an in-flight ICE restart;
    /// • nothing to ANNOUNCE — `call:media-toggled` stays reserved for the three
    ///   cases where capture really stops (camera button, capture interruption,
    ///   CallKit hold). Emitting it here made a weak link indistinguishable from
    ///   a deliberate camera-off, and the peer answered by DESTROYING the last
    ///   frame in favour of our avatar. It now keeps the last frame; the weak
    ///   link is surfaced by the quality channel (`call:quality-alert`) when the
    ///   gateway's own rtt/loss thresholds fire — which is NOT equivalent
    ///   coverage (a `.poor` tier reached through bandwidth or jitter alone
    ///   raises no alert), an accepted trade: a frame without a pill beats a
    ///   false "camera off".
    private func actuateSurvivalVideoSend(enabled: Bool, callId: String) async -> Bool {
        if enabled {
            webRTCService.unfreezeVideoAfterSurvival()
        } else {
            webRTCService.freezeVideoForSurvival()
        }
        hasLocalVideoTrack = webRTCService.hasLocalVideoTrack
        Logger.calls.info("[CALL] survival video \(enabled ? "thawed" : "frozen") (callId=\(callId))")
        return true
    }
}


private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
