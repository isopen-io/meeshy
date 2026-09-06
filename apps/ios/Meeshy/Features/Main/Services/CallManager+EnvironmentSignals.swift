import Foundation
import os

// **Ce que l'appel écoute de son ENVIRONNEMENT** — la chaleur de l'appareil et
// la survie du lien vidéo.
//
// Extrait de `CallManager.swift` le 2026-09-06. Ce fichier est dans la dette
// héritée du budget de taille, et le cliquet du CUMUL était rouge : la
// directive du 2026-08-28 interdit d'ajouter à un fichier hors budget et dit
// d'EXTRAIRE d'abord. `CallManager` reste très au-dessus du plafond — ce
// découpage ne prétend pas l'y ramener, il rend au cumul les lignes que des
// lots récents lui avaient ajoutées ailleurs.
//
// La coupe suit une question : ces deux conformances ne parlent ni au réseau ni
// à CallKit, elles RÉAGISSENT à un signal extérieur — le thermique du système,
// la qualité mesurée du lien. Le reste de `CallManager` conduit l'appel ; ceci
// l'ajuste à ce qui l'entoure.
//
// > `Logger.calls` est redéclaré ici, comme dans les cinq autres fichiers du
// > domaine appel : la convention du dépôt est une `private extension Logger`
// > par fichier, et la suivre coûte trois lignes là où l'exporter changerait la
// > visibilité d'un symbole partagé par cinq sites.

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
                self.webRTCService.videoFilters.config.skinSmoothingEnabled = false
                Logger.calls.warning("Thermal serious — disabled advanced filters")
            }
        }
    }
}

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

// MARK: - Logger

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
