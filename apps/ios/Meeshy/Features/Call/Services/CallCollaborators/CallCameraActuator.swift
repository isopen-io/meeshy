import AVFoundation
import Foundation
@preconcurrency import CallKit
import UIKit
import MeeshySDK
import MeeshyUI
import os

/// La caméra d'un appel : activation et coupure mid-call, bascule avant/arrière
/// et choix de l'appareil. Le collaborateur actionne la caméra ; les emplacements
/// de tâches de la chaîne de transitions vidéo (`videoToggleTask`,
/// `cameraSwitchTask`) restent sur l'appel, de sorte que
/// `videoTransitionsInFlight()` ne change pas (#11522).
@MainActor
final class CallCameraActuator: CallCameraActuatorProviding {
    nonisolated deinit {}

    private weak var call: CallManager?

    func attach(to call: CallManager) {
        self.call = call
    }

    /// §5.4 — mid-call audio↔video switch (FaceTime-style asymmetric). Acquires/
    /// releases the camera, attaches/detaches it on the reserved video
    /// transceiver and, when the SDP direction changes, drives a renegotiation
    /// (createOffer → emit; the peer answers via handleSignalOffer's connected
    /// case). Replaces the old track.enabled flip, which left the upgrade
    /// invisible to the peer (no transceiver / no renegotiation).
    func toggleVideo() {
        guard let call else { return }
        guard !call.screenShare.isSharing else { return }
        let inFlight = call.videoTransitionsInFlight()
        call.videoToggleTask?.cancel()
        let target = !call.isVideoEnabled
        // Optimistic update: reflect intent immediately so rapid double-taps
        // read the new isVideoEnabled value and don't launch a duplicate toggle.
        // The tracked videoToggleTask ensures the later intent always wins:
        // if a second tap cancels this Task, the cancelled path does not update
        // any state — the second Task's result is authoritative.
        call.isVideoEnabled = target
        call.videoToggleTask = Task { @MainActor [weak self] in
            // Serialize on every other in-flight video-transition path before
            // starting ours: `cancel()` above only replaces a same-kind toggle and
            // is cooperative — upgradeToVideo/downgradeFromVideo never observe it
            // mid-flight (they await stopCapture/startCapture) — so without waiting
            // on hold, survival, and ICE restart too, a manual toggle landing
            // mid-hold/mid-survival-recovery/mid-ICE-restart could run two
            // concurrent camera/transceiver/createOffer() actuations and corrupt
            // state (audit finding — ICE restart used to be excluded from this
            // chain, see the doc-comment on `survivalVideoTask`).
            await inFlight.settle()
            guard let self, let call = self.call, !Task.isCancelled else { return }
            guard await self.videoToggleMayActuate(target: target) else { return }
            do {
                let needsRenegotiation: Bool
                if target {
                    needsRenegotiation = try await call.webRTCService.upgradeToVideo()
                } else {
                    needsRenegotiation = await call.webRTCService.downgradeFromVideo()
                }
                guard !Task.isCancelled else { return }
                call.hasLocalVideoTrack = call.webRTCService.hasLocalVideoTrack
                call.audio.updateAudioSessionModeForCurrentVideoState()

                // User intent is authoritative: forget any survival state so the
                // controller never fights a manual toggle (and re-evaluates fresh).
                call.videoSurvivalController.reset()

                await self.announceVideoToggle(target: target, needsRenegotiation: needsRenegotiation)
                HapticFeedback.light()
            } catch WebRTCError.cameraPermissionDenied {
                guard !Task.isCancelled else { return }
                self.videoToggleFailedOnCameraPermission()
            } catch {
                guard !Task.isCancelled else { return }
                self.videoToggleFailed(error)
            }
        }
    }

    /// Re-enabling video is refused while CallKit holds the call or the OS
    /// suspended capture, and after a camera permission refusal.
    private func videoToggleMayActuate(target: Bool) async -> Bool {
        guard let call else { return false }
        // Audit finding (Vague 158): re-enabling video while CallKit holds the
        // call (cellular pre-emption) or the OS has suspended capture must NOT
        // actually acquire the camera / announce "camera active" to the peer —
        // mirrors the guard `applySurvivalVideoSend` already applies for the
        // automatic survival-recovery path. Without this, a hold→toggle-off→
        // toggle-on sequence (a normal double-tap while the CallKit hold banner
        // is up) called `upgradeToVideo()` unconditionally, starting capture and
        // renegotiating with the peer while the call is still on hold — exactly
        // the false "camera active" signal `applyCameraSuspension`'s doc-comment
        // and `applySurvivalVideoSend`'s guard both exist to prevent.
        // `isVideoEnabled` (already set to the new intent above) stays the
        // source of truth: `handleHold`'s unhold branch resumes video
        // automatically once the suspension lifts, so intent is never lost —
        // only the actuation is deferred.
        if target, call.isVideoSuspendedByHold || call.isVideoSuspendedByCaptureInterruption {
            FeedbackToastManager.shared.showError(
                String(localized: "call.video.hold.blocked",
                       defaultValue: "Vidéo indisponible pendant la mise en attente de l'appel",
                       bundle: .main)
            )
            return false
        }
        // Caméra jamais demandée : sans ce pré-flight, le prompt système
        // surgissait au beau milieu de `upgradeToVideo()` — l'utilisateur
        // voyait la vidéo « s'activer » puis retomber. On tranche avant.
        // Un refus est déjà annoncé par le `catch cameraPermissionDenied`
        // en aval, d'où `announcesRefusal: false` (pas deux toasts).
        if target, await MediaPermissionCoordinator.ensureCamera(announcesRefusal: false) == false {
            guard !Task.isCancelled else { return false }
            call.isVideoEnabled = false
            // Same reset as the success path below and toggleVideo's own
            // catch branches: isVideoEnabled = false alone only clears
            // survival state on the controller's NEXT quality tick, and
            // handle() no-ops entirely while a suspend/resume transition
            // is already in flight — user intent (video refused) must win
            // immediately, not after that transition settles.
            call.videoSurvivalController.reset()
            FeedbackToastManager.shared.showError(
                String(localized: "call.video.permission.denied",
                       defaultValue: "Caméra : accès refusé — toucher pour ouvrir les Paramètres",
                       bundle: .main)
            ) { MediaPermissionCoordinator.openSettings() }
            return false
        }
        return true
    }

    private func announceVideoToggle(target: Bool, needsRenegotiation: Bool) async {
        guard let call else { return }
        // Inform CallKit of the updated media type so the call appears
        // as audio or video in the lock screen, Recents, and Car Play.
        if let uuid = call.activeCallUUID, call.callUsesCallKit {
            let update = CXCallUpdate()
            update.hasVideo = target
            call.callProvider.reportCall(with: uuid, updated: update)
        }

        // P0-3 — tell the peer so it shows our avatar placeholder instead
        // of a frozen last frame. Gateway broadcasts to the other peer only.
        if let callId = call.currentCallId {
            MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: target)
        }

        // Renegotiate so the peer actually starts/stops receiving our
        // video stream (a track.enabled flip alone never reaches it).
        // Guard post-await: if the call ended while createOffer() was
        // building the SDP, currentCallId is nil — don't emit a stale
        // offer for a dead call (mirrors applySurvivalVideoSend).
        if needsRenegotiation,
           let callId = call.currentCallId,
           let userId = call.remoteUserId,
           let offer = await call.webRTCService.createOffer(),
           call.currentCallId == callId {
            call.emitCallOffer(callId: callId, toUserId: userId, isVideo: target, sdp: offer)
            Logger.calls.info("[CALL] A/V switch renegotiation offer sent (video=\(target))")
        }
    }

    private func videoToggleFailedOnCameraPermission() {
        guard let call else { return }
        Logger.calls.error("toggleVideo failed: camera permission denied — prompting settings redirect")
        call.isVideoEnabled = false
        call.hasLocalVideoTrack = call.webRTCService.hasLocalVideoTrack
        // Audit finding (Vague 169) — mirrors handleHold's unhold catches
        // (Vague 167/168) and this same function's success path above:
        // isVideoEnabled = false alone only clears survival state on the
        // controller's NEXT quality tick, and handle() no-ops entirely
        // while a suspend/resume transition is already in flight.
        call.videoSurvivalController.reset()
        // Show a tappable error so the user can open Settings to grant
        // camera access without ending the audio-only call. The toast's
        // tap action is the primary affordance; the message text says "tap"
        // so screen-reader users also know the toast is actionable.
        FeedbackToastManager.shared.showError(
            String(localized: "call.video.permission.denied",
                   defaultValue: "Caméra : accès refusé — toucher pour ouvrir les Paramètres",
                   bundle: .main)
        ) {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            UIApplication.shared.open(url)
        }
    }

    private func videoToggleFailed(_ error: Error) {
        guard let call else { return }
        Logger.calls.error("toggleVideo failed: \(error.localizedDescription)")
        call.isVideoEnabled = false
        call.hasLocalVideoTrack = call.webRTCService.hasLocalVideoTrack
        // Same reset as the cameraPermissionDenied catch just above —
        // any OTHER upgradeToVideo()/downgradeFromVideo() failure disables
        // video for the rest of the call just as surely, and owes the
        // survival controller the same immediate clear.
        call.videoSurvivalController.reset()
        FeedbackToastManager.shared.showError(String(localized: "call.video.enable.error", defaultValue: "Impossible d'activer la vidéo", bundle: .main))
    }

    func switchCamera() {
        guard let call else { return }
        // §7.7 — optimistic front/back tracking for mirroring. On iPhone/iPad a
        // flip alternates front↔back; on Mac switchCamera is usually a no-op so
        // the flag rarely matters there. Corrected on failure (hardware busy,
        // single-camera device) so the mirror flag never stays desynced from
        // the camera actually in use for the rest of the call.
        let previousFrontCamera = call.isUsingFrontCamera
        call.isUsingFrontCamera.toggle()
        HapticFeedback.light()

        // Serialize with every other in-flight video-transition/renegotiation path
        // — see the doc-comment on `cameraSwitchTask`/`survivalVideoTask`. Chained
        // (not cancelled) onto the previous cameraSwitchTask so a rapid double-flip
        // still applies both flips in order instead of dropping one.
        let inFlight = call.videoTransitionsInFlight()
        call.cameraSwitchTask = Task { @MainActor [weak self] in
            await inFlight.settle()
            guard let self, let call = self.call, !Task.isCancelled else { return }
            // Audit finding (Vague 159): mirrors the toggleVideo() guard
            // (Vague 158). A hold or a capture-interruption has RELEASED the
            // camera — flipping front/back here would call capturer.startCapture
            // and silently reacquire it (camera hardware + OS indicator turn
            // back on) even though the transceiver stays recvOnly and the peer
            // never sees the switch. Revert the optimistic mirror flag instead
            // of actuating; `handleHold`'s unhold branch restores the real
            // camera state once suspension lifts.
            //
            // L6-1 — `isVideoSuspended` is deliberately NOT part of this guard
            // any more: the survival layer FREEZES the encoder, it no longer
            // stops the capture. Keeping it here made flipping the camera INERT
            // for a whole degraded episode (a silent revert of the mirror flag),
            // for a camera that was running the entire time.
            if call.isVideoSuspendedByHold || call.isVideoSuspendedByCaptureInterruption {
                call.isUsingFrontCamera = previousFrontCamera
                return
            }
            let success = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
                call.webRTCService.switchCamera { success in
                    continuation.resume(returning: success)
                }
            }
            guard !success else { return }
            call.isUsingFrontCamera = previousFrontCamera
        }
    }

    // §7.1 — Continuity / external camera picker. On iPhone the front/back flip
    // (`switchCamera`) is the right affordance; on Mac/iPad with named external
    // (Continuity / USB) cameras the UI offers this device picker instead.
    func refreshAvailableCameras() {
        guard let call else { return }
        call.availableCameras = call.webRTCService.availableCameras()
        if call.selectedCameraId == nil {
            call.selectedCameraId = call.availableCameras.first(where: { $0.facing == .front })?.id
                ?? call.availableCameras.first?.id
        }
    }

    func selectCamera(id: String) {
        guard let call else { return }
        guard id != call.selectedCameraId else { return }
        // §7.1/§7.7 — optimistic picker/mirroring state, corrected on failure
        // (camera busy, no matching capture format) so neither the picker
        // selection nor the self-preview mirror stays desynced from the
        // camera actually in use for the rest of the call. Mirrors the
        // revert-on-failure pattern already established for switchCamera().
        let previousSelectedCameraId = call.selectedCameraId
        let previousFrontCamera = call.isUsingFrontCamera
        call.selectedCameraId = id
        if let cam = call.availableCameras.first(where: { $0.id == id }) {
            // §7.7 — only the front camera is mirrored; external/back are not.
            call.isUsingFrontCamera = (cam.facing == .front)
        }
        HapticFeedback.light()

        // Serialize with every other in-flight video-transition/renegotiation path
        // — see the doc-comment on `cameraSwitchTask`/`survivalVideoTask`. Same
        // rationale as `switchCamera()`: this drives the same capturer.
        let inFlight = call.videoTransitionsInFlight()
        call.cameraSwitchTask = Task { @MainActor [weak self] in
            await inFlight.settle()
            guard let self, let call = self.call, !Task.isCancelled else { return }
            // Audit finding (Vague 159): same guard as switchCamera() above —
            // both drive the same capturer through the same OS-level suspension
            // state. L6-1 — and, for the same reason as its twin, WITHOUT the
            // survival freeze: a frozen encoder still owns a running camera.
            if call.isVideoSuspendedByHold || call.isVideoSuspendedByCaptureInterruption {
                call.selectedCameraId = previousSelectedCameraId
                call.isUsingFrontCamera = previousFrontCamera
                return
            }
            let success = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
                call.webRTCService.switchToCamera(uniqueID: id) { success in
                    continuation.resume(returning: success)
                }
            }
            guard !success else { return }
            call.selectedCameraId = previousSelectedCameraId
            call.isUsingFrontCamera = previousFrontCamera
        }
    }
}

/// Déclaré après le type : les gardes de l'unité lisent la PREMIÈRE
/// occurrence de chaque signature, qui doit être son corps.
@MainActor
protocol CallCameraActuatorProviding: AnyObject {
    func attach(to call: CallManager)
    func toggleVideo()
    func switchCamera()
    func refreshAvailableCameras()
    func selectCamera(id: String)
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
