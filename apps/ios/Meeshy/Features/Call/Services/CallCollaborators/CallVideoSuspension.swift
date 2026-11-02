import Foundation
import Combine
import UIKit
import MeeshySDK
import MeeshyUI
@preconcurrency import WebRTC
import os

/// Les trois raisons pour lesquelles la vidéo sortante d'un appel s'arrête ou se
/// fige sans que l'utilisateur y touche : la mise en attente CallKit, la survie
/// quand la liaison se dégrade durablement (`VideoSurvivalController` coupe
/// l'envoi puis le rétablit) et l'échauffement de l'appareil. Le collaborateur
/// en est l'actionneur ; les six emplacements de tâches de la chaîne de
/// transitions vidéo (`videoToggleTask`, `holdVideoTask`, `survivalVideoTask`,
/// `iceRestartTask`, `signalOfferAnswerTask`, `cameraSwitchTask`) restent sur
/// l'appel, de sorte que `videoTransitionsInFlight()` ne change pas (#11522).
@MainActor
final class CallVideoSuspension: CallVideoSuspensionProviding {
    nonisolated deinit {}

    private weak var call: CallManager?
    private var cancellables = Set<AnyCancellable>()

    func attach(to call: CallManager) {
        self.call = call
    }

    /// Le gel a DEUX propriétaires : le contrôleur (politique) et
    /// WebRTCService (encodeur). `reset()` n'efface que le premier ; sans ce
    /// dégel branché sur le FRONT DESCENDANT, un reset pendant un gel
    /// (toggleVideo, unhold, thermique critique, fin d'appel) épingle
    /// l'encodeur au plancher pour tout le reste de l'appel, sans affordance ni
    /// chemin de reprise. `removeDuplicates()` en amont ne laisse donc passer
    /// que les vraies transitions.
    func bindSurvivalFreeze() {
        call?.videoSurvivalController.$isVideoSuspended
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] suspended in
                guard let self, let call = self.call else { return }
                call.isVideoSuspended = suspended
                if !suspended { call.builtWebRTCService?.unfreezeVideoAfterSurvival() }
            }
            .store(in: &cancellables)
    }

    // MARK: - CallKit Hold/Unhold

    /// Called by `CXSetHeldCallAction`. Suspends/restores outbound video on hold so
    /// the peer receives a proper "camera off" signal rather than a frozen frame.
    /// Mirrors the background-suspension pattern: `isVideoEnabled` (user intent) is
    /// preserved; video auto-resumes on unhold unless the survival controller or
    /// background is also suspending it.
    func handleHold(_ isOnHold: Bool) {
        guard let call, call.callState.isActive, let callId = call.currentCallId else { return }
        call.isOnHold = isOnHold
        if isOnHold {
            suspendVideoForHold(callId: callId)
        } else {
            restoreVideoAfterHold(callId: callId)
        }
    }

    /// Hold: outbound video goes dark and the peer is told, without touching
    /// `isVideoEnabled` (the user's intent, restored on unhold).
    private func suspendVideoForHold(callId: String) {
        guard let call, call.isVideoEnabled else { return }
        call.isVideoSuspendedByHold = true
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
        let inFlight = call.videoTransitionsInFlight()
        call.holdVideoTask = Task { [weak self] in
            // Serialize with every other in-flight video-transition path
            // (manual toggle, prior hold/unhold, survival suspend/resume,
            // ICE restart, peer-initiated renegotiation answer) — see the
            // doc-comment on `survivalVideoTask`.
            await inFlight.settle()
            guard let self, let call = self.call, !Task.isCancelled else { return }
            let needsRenegotiation = await call.webRTCService.downgradeFromVideo()
            guard !Task.isCancelled else { return }
            call.hasLocalVideoTrack = call.webRTCService.hasLocalVideoTrack
            if needsRenegotiation,
               let callId = call.currentCallId,
               let userId = call.remoteUserId,
               let offer = await call.webRTCService.createOffer(),
               call.currentCallId == callId {
                call.emitCallOffer(callId: callId, toUserId: userId, isVideo: false, sdp: offer)
                Logger.calls.info("[CALL] hold renegotiation offer sent (video=false)")
            }
        }
        MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
        Logger.calls.info("CallKit hold — video suspended, peer notified (callId=\(callId))")
    }

    /// The unhold upgrade and its renegotiation; on failure, video is disabled
    /// for the rest of the call and the peer is told.
    private func actuateUnholdVideo() async {
        guard let call else { return }
        do {
            let needsRenegotiation = try await call.webRTCService.upgradeToVideo()
            guard !Task.isCancelled else { return }
            call.hasLocalVideoTrack = call.webRTCService.hasLocalVideoTrack
            if needsRenegotiation,
               let callId = call.currentCallId,
               let userId = call.remoteUserId,
               let offer = await call.webRTCService.createOffer(),
               call.currentCallId == callId {
                call.emitCallOffer(callId: callId, toUserId: userId, isVideo: true, sdp: offer)
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
            call.isVideoEnabled = false
            call.hasLocalVideoTrack = call.webRTCService.hasLocalVideoTrack
            call.videoSurvivalController.reset()
            if let callId = call.currentCallId {
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
            call.isVideoEnabled = false
            call.hasLocalVideoTrack = call.webRTCService.hasLocalVideoTrack
            // Same discipline as the cameraPermissionDenied branch above:
            // isVideoEnabled=false alone only resets survival state on its
            // NEXT quality tick, and `handle()` no-ops entirely while a
            // transition is already in flight — leaving a stale
            // isVideoSuspended/isTransitioning behind this generic failure.
            call.videoSurvivalController.reset()
            if let callId = call.currentCallId {
                MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
            }
        }
    }

    /// Unhold: video comes back only when hold was the reason it went dark and
    /// no capture interruption still holds the camera.
    private func restoreVideoAfterHold(callId: String) {
        guard let call, call.isVideoSuspendedByHold else { return }
        call.isVideoSuspendedByHold = false
        // L6-1 — `isVideoSuspended` retiré de cette condition : un gel
        // réseau ne relâche pas la caméra, donc il ne doit pas empêcher
        // le unhold de la REPRENDRE. L'y laisser gardait la vidéo noire
        // jusqu'à la reprise indépendante du contrôleur de survie.
        guard call.isVideoEnabled && !call.isVideoSuspendedByCaptureInterruption else { return }
        // Companion fix: without renegotiating here, unhold only flips
        // the local track/direction back — the peer's negotiated SDP
        // state (possibly stuck at recvOnly from a hold-time ICE
        // restart) never actually gets corrected, leaving outbound
        // video silently broken for the rest of the call. Chains onto
        // the previous task rather than cancelling it for the same
        // reason as the hold path above.
        let inFlight = call.videoTransitionsInFlight()
        call.holdVideoTask = Task { [weak self] in
            // Serialize with every other in-flight video-transition path —
            // see the doc-comment on `survivalVideoTask`.
            await inFlight.settle()
            guard let self, !Task.isCancelled else { return }
            await self.actuateUnholdVideo()
        }
        MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: true)
        Logger.calls.info("CallKit unhold — video restored, peer notified (callId=\(callId))")
    }

    // MARK: - DTMF Forwarding

    /// Called by `CXPlayDTMFCallAction` to forward CallKit keypad digits to WebRTC.
    func sendDTMF(digits: String) {
        guard let call else { return }
        let validCharacters = CharacterSet(charactersIn: "0123456789*#ABCD")
        guard !digits.isEmpty, digits.unicodeScalars.allSatisfy({ validCharacters.contains($0) }) else { return }
        call.webRTCService.sendDTMF(digits: digits)
    }

    // MARK: - VideoSurvivalActuating

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
        guard let call, call.isVideoEnabled, let callId = call.currentCallId else { return false }
        // Do NOT act during an ICE restart: media parameters written against a
        // sender whose transport is mid-restart are lost with the old encoding,
        // and the published `isVideoSuspended` would then describe a floor that
        // is no longer applied. The survival controller re-evaluates once the
        // call reaches .connected and stats start flowing again.
        if case .reconnecting = call.callState { return false }
        // Do NOT act — in EITHER direction — while an OS-level suspension is
        // active: a CallKit hold (cellular pre-emption) or a background/capture
        // interruption has genuinely stopped the capture, `handleHold` already
        // owns the media transition for that window, and there is no live
        // encoding to floor or to release. Both directions are blocked, not just
        // resume: letting a suspend through mid-hold would publish
        // `isVideoSuspended = true` — the local "video paused" affordance — for
        // a call whose video is already off for an unrelated, visible reason.
        if call.isVideoSuspendedByHold || call.isVideoSuspendedByCaptureInterruption { return false }

        let inFlight = call.videoTransitionsInFlight()
        let task = Task<Bool, Never> { @MainActor [weak self] in
            // Serialize with every other in-flight video-transition path (manual
            // toggle, CallKit hold/unhold, ICE restart, peer-initiated renegotiation
            // answer) — see the doc-comment on `survivalVideoTask`. The
            // `.reconnecting` state guards above already stop a NEW survival
            // transition from starting once a restart is under way, but chaining
            // here too closes the reverse window: an ICE restart beginning while
            // THIS task's own createOffer() is in flight.
            await inFlight.settle()
            guard let self, let call = self.call, !Task.isCancelled else { return false }
            // Re-validate every guard: state may have changed while this transition
            // was queued behind a concurrent manual toggle or CallKit hold.
            guard call.isVideoEnabled, call.currentCallId == callId else { return false }
            if case .reconnecting = call.callState { return false }
            // Mirrors the pre-flight guard above — re-validated because state
            // may have changed (e.g. a hold started) while this transition
            // was queued behind a concurrent task.
            if call.isVideoSuspendedByHold || call.isVideoSuspendedByCaptureInterruption { return false }
            return await self.actuateSurvivalVideoSend(enabled: enabled, callId: callId)
        }
        call.survivalVideoTask = task
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
        guard let call else { return false }
        if enabled { call.webRTCService.unfreezeVideoAfterSurvival() } else { call.webRTCService.freezeVideoForSurvival() }
        GroupCallMeshCoordinator.shared.setSurvivalFloor(!enabled)
        call.hasLocalVideoTrack = call.webRTCService.hasLocalVideoTrack
        Logger.calls.info("[CALL] survival video \(enabled ? "thawed" : "frozen") (callId=\(callId))")
        return true
    }

    // MARK: - ThermalStateMonitorDelegate

    nonisolated func thermalStateDidChange(to state: ProcessInfo.ThermalState) {
        Task { @MainActor [weak self] in
            guard let self, let call = self.call, call.callState == .connected else { return }
            // PiP : framerate thermal-aware (la vignette est petite → throttle
            // agressif possible). Restauré à 15 fps dès le retour en nominal/fair.
            call.pip.setMaxFrameRate(call.pipFrameRate(for: state))
            if state == .critical {
                call.webRTCService.videoFilters.reset()
                Logger.calls.warning("Thermal critical — disabled all filters (video)")
                if call.isVideoEnabled {
                    call.isVideoEnabled = false
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
                    let inFlight = call.videoTransitionsInFlight()
                    call.videoToggleTask?.cancel()
                    call.videoToggleTask = Task { @MainActor [weak self] in
                        await inFlight.settle()
                        guard let self, let call = self.call, !Task.isCancelled else { return }
                        // §5.4 — use downgradeFromVideo (sets transceiver direction +
                        // stops capture) rather than enableVideo(false) (track.enabled
                        // only). Without the direction change the peer's SDP still
                        // advertises sendRecv and the RTP session stays open, which
                        // means the peer's decoder never tears down and the "camera off"
                        // media-toggled is the only signal it gets — race-prone and
                        // semantically wrong. Mirror the manual toggleVideo() path.
                        let needsRenegotiation = await call.webRTCService.downgradeFromVideo()
                        guard !Task.isCancelled else { return }
                        // Audit finding — the line above was missing: without it, an
                        // in-flight thermal downgrade that got cancelled (e.g. the user
                        // re-enabled video, which cancels this Task via videoToggleTask)
                        // ran to completion anyway, emitting a stale "video off" offer to
                        // the peer right after the newer task's "video on" offer — a
                        // real, avoidable flicker. Mirrors toggleVideo/handleHold, which
                        // both recheck cancellation immediately after this same await.
                        call.hasLocalVideoTrack = call.webRTCService.hasLocalVideoTrack
                        call.audio.updateAudioSessionModeForCurrentVideoState()
                        call.videoSurvivalController.reset()
                        // P0-3 — signal the peer (avatar placeholder, not a frozen frame).
                        if let callId = call.currentCallId {
                            MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
                        }
                        // Renegotiate so the peer's SDP transceiver direction matches
                        // the video downgrade (media-toggled alone does not update the
                        // remote offer's m-sections).
                        if needsRenegotiation,
                           let callId = call.currentCallId,
                           let userId = call.remoteUserId,
                           let offer = await call.webRTCService.createOffer(),
                           call.currentCallId == callId {
                            call.emitCallOffer(callId: callId, toUserId: userId, isVideo: false, sdp: offer)
                            Logger.calls.warning("Thermal critical — SDP renegotiation offer emitted (video downgrade)")
                        }
                        Logger.calls.warning("Thermal critical — disabled video")
                    }
                }
            } else if state == .serious {
                call.webRTCService.videoFilters.config.backgroundBlurEnabled = false
                call.webRTCService.videoFilters.config = call.webRTCService.videoFilters.config.selectingFaceEffect(.none)
                Logger.calls.warning("Thermal serious — disabled advanced filters")
            }
        }
    }
}

/// Déclaré après le type : les gardes de l'unité lisent la PREMIÈRE
/// occurrence de chaque signature, qui doit être son corps.
@MainActor
protocol CallVideoSuspensionProviding: VideoSurvivalActuating, ThermalStateMonitorDelegate {
    func attach(to call: CallManager)
    func bindSurvivalFreeze()
    func handleHold(_ isOnHold: Bool)
    func sendDTMF(digits: String)
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
