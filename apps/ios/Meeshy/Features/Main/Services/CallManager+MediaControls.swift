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

/// Les commandes média d'un appel : micro, haut-parleur, caméra (activation,
/// bascule avant/arrière, choix de l'appareil) et intention d'écoute.

extension CallManager {

    // MARK: - Media Controls

    /// `reportToCallKit` is `false` only when this call originates FROM
    /// CallKit itself (`CXSetMutedCallAction` delegate handler, e.g. Apple
    /// Watch / lock-screen / CarPlay mute) — in that case CallKit's state
    /// already reflects `isMuted`, and resubmitting a `CXSetMutedCallAction`
    /// transaction back to it would be an avoidable no-op round-trip
    /// answering CallKit's own notification. All other call sites (the
    /// in-app mute button) keep the default and DO report to CallKit, so its
    /// system UI (Watch, lock screen, CarPlay) stays in sync.
    func toggleMute(reportToCallKit: Bool = true) {
        // Audit P1-13 — keep optimistic UX (instant local flip) but rollback
        // local state + WebRTC if CallKit refuses the transaction. Without
        // the rollback, the app's `isMuted` and the WebRTC track were
        // permanently out of sync with CallKit's system mute UI — once
        // diverged, only a call hangup recovered it.
        isMuted.toggle()
        webRTCService.muteAudio(isMuted)
        // Broadcast the new mute state so the remote peer can update its
        // "muted" indicator. This must fire regardless of CallKit path (the
        // guard below returns early for Mac / foreground in-app calls).
        if let callId = currentCallId {
            MessageSocketManager.shared.emitCallToggleAudio(callId: callId, enabled: !isMuted)
        }

        guard reportToCallKit else {
            HapticFeedback.light()
            return
        }

        // CALL-FIX 2026-06-06 (macOS) — `CXSetMutedCallAction` fails on iOS-app-on-Mac
        // (CallKit requesttransaction error 4) and the rollback below then UNDOES the
        // mute → the mute button never sticks. On Mac the WebRTC track toggle above IS
        // the mute (no CallKit system UI), so short-circuit before the transaction.
        guard let uuid = activeCallUUID, callUsesCallKit else {
            // No CallKit (Mac / foreground in-app call) — the WebRTC track toggle
            // above IS the mute; skip CXSetMutedCallAction (it fails + rolls back).
            HapticFeedback.light()
            return
        }
        let muteAction = CXSetMutedCallAction(call: uuid, muted: isMuted)
        callController.request(CXTransaction(action: muteAction)) { error in
            if let error {
                // CALL-FIX 2026-06-06 — do NOT roll back the WebRTC mute when CallKit
                // refuses the transaction (CXSetMutedCallAction error 4). The WebRTC
                // track toggle above IS the real mute; the old rollback UN-muted the
                // user against their intent ("impossible de mute — ça fall back").
                // Keep the mute; CallKit's system UI may briefly desync but the audio
                // is correctly muted.
                Logger.calls.error("CallKit mute transaction failed (keeping WebRTC mute): \(error.localizedDescription)")
            }
        }

        HapticFeedback.light()
    }

    func toggleSpeaker() {
        // §7.8 — optimistic toggle, reverted on failure (`insufficientPriority`
        // under Bluetooth). #8735 — the route applies OFF the main thread.
        let previousSpeaker = isSpeaker
        isSpeaker.toggle()
        HapticFeedback.light()
        let intended = isSpeaker
        applySpeakerRouteOffMain { [weak self] applied in
            guard let self, !applied, self.isSpeaker == intended else { return }
            self.isSpeaker = previousSpeaker
        }
    }

    /// §5.4 — mid-call audio↔video switch (FaceTime-style asymmetric). Acquires/
    /// releases the camera, attaches/detaches it on the reserved video
    /// transceiver and, when the SDP direction changes, drives a renegotiation
    /// (createOffer → emit; the peer answers via handleSignalOffer's connected
    /// case). Replaces the old track.enabled flip, which left the upgrade
    /// invisible to the peer (no transceiver / no renegotiation).
    func toggleVideo() {
        guard !screenShare.isSharing else { return }
        let previousToggle = videoToggleTask
        let previousHold = holdVideoTask
        let previousSurvival = survivalVideoTask
        let previousICERestart = iceRestartTask
        let previousAnswer = signalOfferAnswerTask
        let previousCameraSwitch = cameraSwitchTask
        videoToggleTask?.cancel()
        let target = !isVideoEnabled
        // Optimistic update: reflect intent immediately so rapid double-taps
        // read the new isVideoEnabled value and don't launch a duplicate toggle.
        // The tracked videoToggleTask ensures the later intent always wins:
        // if a second tap cancels this Task, the cancelled path does not update
        // any state — the second Task's result is authoritative.
        isVideoEnabled = target
        videoToggleTask = Task { @MainActor [weak self] in
            // Serialize on every other in-flight video-transition path before
            // starting ours: `cancel()` above only replaces a same-kind toggle and
            // is cooperative — upgradeToVideo/downgradeFromVideo never observe it
            // mid-flight (they await stopCapture/startCapture) — so without waiting
            // on hold, survival, and ICE restart too, a manual toggle landing
            // mid-hold/mid-survival-recovery/mid-ICE-restart could run two
            // concurrent camera/transceiver/createOffer() actuations and corrupt
            // state (audit finding — ICE restart used to be excluded from this
            // chain, see the doc-comment on `survivalVideoTask`).
            await previousToggle?.value
            await previousICERestart?.value
            await previousHold?.value
            _ = await previousSurvival?.value
            await previousAnswer?.value
            await previousCameraSwitch?.value
            guard let self, !Task.isCancelled else { return }
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
            if target, self.isVideoSuspendedByHold || self.isVideoSuspendedByCaptureInterruption {
                FeedbackToastManager.shared.showError(
                    String(localized: "call.video.hold.blocked",
                           defaultValue: "Vidéo indisponible pendant la mise en attente de l'appel",
                           bundle: .main)
                )
                return
            }
            // Caméra jamais demandée : sans ce pré-flight, le prompt système
            // surgissait au beau milieu de `upgradeToVideo()` — l'utilisateur
            // voyait la vidéo « s'activer » puis retomber. On tranche avant.
            // Un refus est déjà annoncé par le `catch cameraPermissionDenied`
            // en aval, d'où `announcesRefusal: false` (pas deux toasts).
            if target, await MediaPermissionCoordinator.ensureCamera(announcesRefusal: false) == false {
                guard !Task.isCancelled else { return }
                self.isVideoEnabled = false
                // Same reset as the success path below and toggleVideo's own
                // catch branches: isVideoEnabled = false alone only clears
                // survival state on the controller's NEXT quality tick, and
                // handle() no-ops entirely while a suspend/resume transition
                // is already in flight — user intent (video refused) must win
                // immediately, not after that transition settles.
                self.videoSurvivalController.reset()
                FeedbackToastManager.shared.showError(
                    String(localized: "call.video.permission.denied",
                           defaultValue: "Caméra : accès refusé — toucher pour ouvrir les Paramètres",
                           bundle: .main)
                ) { MediaPermissionCoordinator.openSettings() }
                return
            }
            do {
                let needsRenegotiation: Bool
                if target {
                    needsRenegotiation = try await self.webRTCService.upgradeToVideo()
                } else {
                    needsRenegotiation = await self.webRTCService.downgradeFromVideo()
                }
                guard !Task.isCancelled else { return }
                self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                self.updateAudioSessionModeForCurrentVideoState()

                // User intent is authoritative: forget any survival state so the
                // controller never fights a manual toggle (and re-evaluates fresh).
                self.videoSurvivalController.reset()

                // Inform CallKit of the updated media type so the call appears
                // as audio or video in the lock screen, Recents, and Car Play.
                if let uuid = self.activeCallUUID, self.callUsesCallKit {
                    let update = CXCallUpdate()
                    update.hasVideo = target
                    self.callProvider.reportCall(with: uuid, updated: update)
                }

                // P0-3 — tell the peer so it shows our avatar placeholder instead
                // of a frozen last frame. Gateway broadcasts to the other peer only.
                if let callId = self.currentCallId {
                    MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: target)
                }

                // Renegotiate so the peer actually starts/stops receiving our
                // video stream (a track.enabled flip alone never reaches it).
                // Guard post-await: if the call ended while createOffer() was
                // building the SDP, currentCallId is nil — don't emit a stale
                // offer for a dead call (mirrors applySurvivalVideoSend).
                if needsRenegotiation,
                   let callId = self.currentCallId,
                   let userId = self.remoteUserId,
                   let offer = await self.webRTCService.createOffer(),
                   self.currentCallId == callId {
                    self.emitCallOffer(callId: callId, toUserId: userId, isVideo: target, sdp: offer)
                    Logger.calls.info("[CALL] A/V switch renegotiation offer sent (video=\(target))")
                }
                HapticFeedback.light()
            } catch WebRTCError.cameraPermissionDenied {
                guard !Task.isCancelled else { return }
                Logger.calls.error("toggleVideo failed: camera permission denied — prompting settings redirect")
                self.isVideoEnabled = false
                self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                // Audit finding (Vague 169) — mirrors handleHold's unhold catches
                // (Vague 167/168) and this same function's success path above:
                // isVideoEnabled = false alone only clears survival state on the
                // controller's NEXT quality tick, and handle() no-ops entirely
                // while a suspend/resume transition is already in flight.
                self.videoSurvivalController.reset()
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
            } catch {
                guard !Task.isCancelled else { return }
                Logger.calls.error("toggleVideo failed: \(error.localizedDescription)")
                self.isVideoEnabled = false
                self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                // Same reset as the cameraPermissionDenied catch just above —
                // any OTHER upgradeToVideo()/downgradeFromVideo() failure disables
                // video for the rest of the call just as surely, and owes the
                // survival controller the same immediate clear.
                self.videoSurvivalController.reset()
                FeedbackToastManager.shared.showError(String(localized: "call.video.enable.error", defaultValue: "Impossible d'activer la vidéo", bundle: .main))
            }
        }
    }

    func switchCamera() {
        // §7.7 — optimistic front/back tracking for mirroring. On iPhone/iPad a
        // flip alternates front↔back; on Mac switchCamera is usually a no-op so
        // the flag rarely matters there. Corrected on failure (hardware busy,
        // single-camera device) so the mirror flag never stays desynced from
        // the camera actually in use for the rest of the call.
        let previousFrontCamera = isUsingFrontCamera
        isUsingFrontCamera.toggle()
        HapticFeedback.light()

        // Serialize with every other in-flight video-transition/renegotiation path
        // — see the doc-comment on `cameraSwitchTask`/`survivalVideoTask`. Chained
        // (not cancelled) onto the previous cameraSwitchTask so a rapid double-flip
        // still applies both flips in order instead of dropping one.
        let previousToggle = videoToggleTask
        let previousHold = holdVideoTask
        let previousSurvival = survivalVideoTask
        let previousICERestart = iceRestartTask
        let previousAnswer = signalOfferAnswerTask
        let previousCameraSwitch = cameraSwitchTask
        cameraSwitchTask = Task { @MainActor [weak self] in
            await previousCameraSwitch?.value
            await previousToggle?.value
            await previousHold?.value
            _ = await previousSurvival?.value
            await previousICERestart?.value
            await previousAnswer?.value
            guard let self, !Task.isCancelled else { return }
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
            if self.isVideoSuspendedByHold || self.isVideoSuspendedByCaptureInterruption {
                self.isUsingFrontCamera = previousFrontCamera
                return
            }
            let success = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
                self.webRTCService.switchCamera { success in
                    continuation.resume(returning: success)
                }
            }
            guard !success else { return }
            self.isUsingFrontCamera = previousFrontCamera
        }
    }

    // §7.1 — Continuity / external camera picker. On iPhone the front/back flip
    // (`switchCamera`) is the right affordance; on Mac/iPad with named external
    // (Continuity / USB) cameras the UI offers this device picker instead.
    func refreshAvailableCameras() {
        availableCameras = webRTCService.availableCameras()
        if selectedCameraId == nil {
            selectedCameraId = availableCameras.first(where: { $0.facing == .front })?.id
                ?? availableCameras.first?.id
        }
    }

    func selectCamera(id: String) {
        guard id != selectedCameraId else { return }
        // §7.1/§7.7 — optimistic picker/mirroring state, corrected on failure
        // (camera busy, no matching capture format) so neither the picker
        // selection nor the self-preview mirror stays desynced from the
        // camera actually in use for the rest of the call. Mirrors the
        // revert-on-failure pattern already established for switchCamera().
        let previousSelectedCameraId = selectedCameraId
        let previousFrontCamera = isUsingFrontCamera
        selectedCameraId = id
        if let cam = availableCameras.first(where: { $0.id == id }) {
            // §7.7 — only the front camera is mirrored; external/back are not.
            isUsingFrontCamera = (cam.facing == .front)
        }
        HapticFeedback.light()

        // Serialize with every other in-flight video-transition/renegotiation path
        // — see the doc-comment on `cameraSwitchTask`/`survivalVideoTask`. Same
        // rationale as `switchCamera()`: this drives the same capturer.
        let previousToggle = videoToggleTask
        let previousHold = holdVideoTask
        let previousSurvival = survivalVideoTask
        let previousICERestart = iceRestartTask
        let previousAnswer = signalOfferAnswerTask
        let previousCameraSwitch = cameraSwitchTask
        cameraSwitchTask = Task { @MainActor [weak self] in
            await previousCameraSwitch?.value
            await previousToggle?.value
            await previousHold?.value
            _ = await previousSurvival?.value
            await previousICERestart?.value
            await previousAnswer?.value
            guard let self, !Task.isCancelled else { return }
            // Audit finding (Vague 159): same guard as switchCamera() above —
            // both drive the same capturer through the same OS-level suspension
            // state. L6-1 — and, for the same reason as its twin, WITHOUT the
            // survival freeze: a frozen encoder still owns a running camera.
            if self.isVideoSuspendedByHold || self.isVideoSuspendedByCaptureInterruption {
                self.selectedCameraId = previousSelectedCameraId
                self.isUsingFrontCamera = previousFrontCamera
                return
            }
            let success = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
                self.webRTCService.switchToCamera(uniqueID: id) { success in
                    continuation.resume(returning: success)
                }
            }
            guard !success else { return }
            self.selectedCameraId = previousSelectedCameraId
            self.isUsingFrontCamera = previousFrontCamera
        }
    }


    /// Annonce aux pairs que ce device ÉCOUTE (panneau local ouvert) — jamais
    /// qu'il capture. La distinction est vitale : la capture démarre aussi
    /// pour servir un pair, donc l'annoncer depuis la capture faisait que deux
    /// devices s'entretenaient mutuellement (« l'autre est actif, je reste
    /// actif ») sans qu'aucun ne puisse plus s'arrêter. Piloté par le panneau,
    /// le signal reste la propriété du seul utilisateur local.
    func publishListeningIntentIfChanged() {
        guard let callId = currentCallId else { return }
        let isListening = transcriptionService.isShowingOverlay
        guard isListening != publishedListeningIntent else { return }
        publishedListeningIntent = isListening
        MessageSocketManager.shared.emitCallTranscriptionActive(callId: callId, active: isListening)
    }

    /// Un participant vient d'entrer : le gateway ne rejoue PAS les
    /// `call:transcription-active` émis avant son arrivée. Sans ce renvoi, un
    /// arrivant ignorerait que quelqu'un lit déjà, ne capturerait donc pas, et
    /// resterait muet pour tout le monde alors que l'appel a des lecteurs.
    func reannounceListeningIntent() {
        guard publishedListeningIntent, let callId = currentCallId else { return }
        MessageSocketManager.shared.emitCallTranscriptionActive(callId: callId, active: true)
    }

    var videoFilters: VideoFilterPipeline { webRTCService.videoFilters }
    var localVideoTrack: Any? { webRTCService.localVideoTrack }
    var remoteVideoTrack: Any? { webRTCService.remoteVideoTrack }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
