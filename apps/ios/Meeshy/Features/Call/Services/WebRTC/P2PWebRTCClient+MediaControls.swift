import Foundation
import AVFoundation
import os

#if canImport(WebRTC)
@preconcurrency import WebRTC
import MeeshySDK

extension P2PWebRTCClient {

    func toggleAudio(_ enabled: Bool) {
        localAudioTrack?.isEnabled = enabled
        Logger.webrtc.info("Audio \(enabled ? "enabled" : "muted")")
    }

    func toggleVideo(_ enabled: Bool) {
        localVideoTrack_?.isEnabled = enabled
        Logger.webrtc.info("Video \(enabled ? "enabled" : "disabled")")

        // Audit P1-7 — also stop the capturer when video is disabled.
        // Without this, AVCaptureSession keeps the camera LED on and delivers
        // ~30fps frames at 720p (~44 MB/s NV12) through the filter pipeline
        // even though the encoder is fed disabled frames. Stopping the
        // capturer frees ~80–150 mA on iPhone 13. On re-enable we restart
        // the capturer with the same camera/format/fps as the initial start.
        //
        // Cancel any in-flight capturer task from a prior toggle so only the
        // most-recent intent races to the camera. The pending task is cancelled
        // before it starts (isCancelled check at entry); if it has already
        // suspended inside startCapture/stopCapture it finishes atomically —
        // the new task then runs after and leaves the camera in the correct state.
        toggleVideoTask?.cancel()
        // @MainActor on the Task literal: this function is a synchronous, non-isolated
        // entry point (P2PWebRTCClient is not @MainActor), so a bare `Task { }` here
        // would run on the cooperative pool, not necessarily on the same queue as
        // disconnect()'s synchronous videoCapturer/sessionGeneration mutations. Pinning
        // the task to MainActor keeps it serialized with every other mutation site.
        toggleVideoTask = Task { @MainActor [weak self] in
            guard let self, !Task.isCancelled else { return }
            if enabled {
                await self.restartCapturerIfStopped()
            } else {
                await self.videoCapturer?.stopCapture()
            }
        }
    }

    /// Whether local video is currently being sent (drives the UI's
    /// self-preview / camera-toggle affordance, `effectiveSwapStreams`, and
    /// the bitrate/quality policy's `isSendingVideo` gate). Deliberately keyed
    /// off `isEnabled`, NOT `localVideoTrack_ != nil` — `disableLocalVideo()`
    /// keeps the track object alive (just disabled + capture stopped) so a
    /// later `enableLocalVideo()` can cheaply resume the SAME track instead of
    /// rebuilding the capturer. A raw nil-check would therefore stay `true`
    /// through every survival-triggered downgrade, silently breaking the
    /// `localVideoSuspendedTile` fallback and `effectiveSwapStreams` in
    /// CallView.swift for the rest of the call.
    var hasLocalVideoTrack: Bool { localVideoTrack_?.isEnabled == true }

    /// Mid-call audio→video upgrade (FaceTime-style asymmetric — we control our
    /// own outbound video only). Lazily builds the camera track, attaches it to
    /// the reserved video transceiver and flips it to sendRecv. Returns true when
    /// the SDP direction changed and a renegotiation (createOffer) is required;
    /// false when video was already being sent (no SDP change needed).
    func enableLocalVideo() async throws -> Bool {
        guard let pc = peerConnection else { throw WebRTCError.noPeerConnection }
        localVideoWithheld = false
        if localVideoTrack_ == nil {
            try await buildLocalVideoTrackAndStartCapture()
        } else {
            localVideoTrack_?.isEnabled = true
            await restartCapturerIfStopped()
        }
        guard let videoTrack = localVideoTrack_ else { return false }

        if let vt = videoTransceiver {
            let wasSending = vt.direction == .sendRecv || vt.direction == .sendOnly
            vt.sender.track = videoTrack
            forceSendRecv(vt)
            applyVideoCodecPreferences(videoTransceiver: vt)
            applyVideoEncoding()
            Logger.webrtc.info("[WEBRTC] local video enabled (upgrade) renegotiation=\(!wasSending, privacy: .public)")
            return !wasSending
        }

        // Legacy peer with no reserved video m-line → add one (sendRecv).
        let vinit = RTCRtpTransceiverInit()
        vinit.direction = .sendRecv
        vinit.streamIds = ["meeshy-stream-0"]
        guard let vt = pc.addTransceiver(of: .video, init: vinit) else {
            throw WebRTCError.failedToCreateSDP
        }
        vt.sender.track = videoTrack
        self.videoTransceiver = vt
        applyVideoCodecPreferences(videoTransceiver: vt)
        applyVideoEncoding()
        Logger.webrtc.info("[WEBRTC] local video enabled (added transceiver) renegotiation=true")
        return true
    }

    /// Mid-call video→audio downgrade. Stops the camera, detaches the outbound
    /// track and flips the transceiver to recvonly (we keep receiving the peer's
    /// video). Returns true when a renegotiation is required.
    func disableLocalVideo() async -> Bool {
        localVideoWithheld = true
        localVideoTrack_?.isEnabled = false
        await videoCapturer?.stopCapture()
        guard let vt = videoTransceiver else { return false }
        let wasSending = vt.direction == .sendRecv || vt.direction == .sendOnly
        vt.sender.track = nil
        var error: NSError?
        vt.setDirection(.recvOnly, error: &error)
        if let error {
            Logger.webrtc.warning("[WEBRTC] setDirection(.recvOnly) failed: \(error.localizedDescription, privacy: .public)")
        }
        Logger.webrtc.info("[WEBRTC] local video disabled (downgrade) renegotiation=\(wasSending, privacy: .public)")
        return wasSending
    }

    /// Restarts the existing capturer using the current camera selection
    /// (front vs back) and the same format-selection logic as the initial
    /// start. No-op if there is no capturer (audio-only call).
    private func restartCapturerIfStopped() async {
        guard let capturer = videoCapturer else { return }
        // disconnect() during the 0.5–3 s warm-up bumps the generation: the
        // orphan capturer is stopped (same guard as the initial start).
        let generation = sessionGeneration
        let position: AVCaptureDevice.Position = usingFrontCamera ? .front : .back
        guard let camera = Self.pickCaptureDevice(preferring: position),
              let format = camera.callCaptureFormat(within: captureCeiling) else {
            Logger.webrtc.warning("[WEBRTC] toggleVideo on — no camera/format available, skipping capturer restart")
            return
        }
        let fps = format.callFrameRate(within: captureCeiling)
        do {
            try await capturer.startCapture(with: camera, format: format, fps: fps)
            let isStale = await MainActor.run { generation != sessionGeneration }
            if isStale {
                Logger.webrtc.warning("[WEBRTC] session changed during capturer restart — stopping orphan capture")
                await capturer.stopCapture()
                return
            }
            await attachLiveCamera(camera)
            Logger.webrtc.info("[WEBRTC] capturer restarted on toggleVideo(true) (\(fps)fps)")
        } catch {
            Logger.webrtc.error("[WEBRTC] capturer restart failed: \(error.localizedDescription)")
        }
    }

    func switchCamera() async throws {
        guard let capturer = videoCapturer else { return }
        usingFrontCamera.toggle()
        let position: AVCaptureDevice.Position = usingFrontCamera ? .front : .back

        // Sur Mac (caméra unique `.unspecified`) il n'y a généralement pas de
        // seconde caméra : pickCaptureDevice retombe sur le même device, le
        // switch est alors un no-op visuel plutôt qu'une erreur.
        guard let camera = Self.pickCaptureDevice(preferring: position) else {
            usingFrontCamera.toggle()
            throw WebRTCError.noCameraAvailable
        }

        guard let selectedFormat = camera.callCaptureFormat(within: captureCeiling) else {
            usingFrontCamera.toggle()
            throw WebRTCError.noCameraFormatAvailable
        }

        // Capture the session generation before either async suspension point
        // (stopCapture + startCapture). If disconnect() fires in the stop→start
        // window the generation token mismatch stops the orphan capturer via the
        // local reference, matching the identical guard in buildLocalVideoTrackAndStartCapture
        // and restartCapturerIfStopped.
        let generation = sessionGeneration
        await capturer.stopCapture()
        let fps = selectedFormat.callFrameRate(within: captureCeiling)
        do {
            try await capturer.startCapture(with: camera, format: selectedFormat, fps: fps)
        } catch {
            // Mirror the two guard-throws above: a failed startCapture must not leave
            // usingFrontCamera claiming the switch succeeded. restartCapturerIfStopped()
            // reads this flag to decide which physical camera to resume — a stale value
            // here would target the camera that just failed to start (capturer is now
            // stopped, capturing nothing) instead of the one the user was actually seeing
            // before this attempt. CallManager already reverts its own optimistic
            // isUsingFrontCamera mirroring flag on this same failure (see
            // CallManagerSwitchCameraFailureCorrectionSourceTests) — this keeps the
            // internal capture-restart target in sync with that correction.
            usingFrontCamera.toggle()
            throw error
        }
        let isStale = await MainActor.run { generation != sessionGeneration }
        if isStale {
            Logger.webrtc.warning("[WEBRTC] session changed during camera switch — stopping orphan capture")
            await capturer.stopCapture()
            return
        }
        await attachLiveCamera(camera)
        Logger.webrtc.info("Switched to \(self.usingFrontCamera ? "front" : "back") camera")
    }

    // §7.1 — Continuity / external camera picker (Mac/iPad). Enumerate the
    // capture devices and project them into the framework-agnostic catalog so
    // the UI can present named cameras instead of a meaningless front/back flip.
    func availableCameras() -> [CameraDeviceOption] {
        let descriptors = RTCCameraVideoCapturer.captureDevices().map { device in
            CameraCatalog.Descriptor(
                uniqueID: device.uniqueID,
                localizedName: device.localizedName,
                facing: Self.facing(for: device)
            )
        }
        return CameraCatalog.options(from: descriptors)
    }

    // §7.1 — switch to a specific capture device by uniqueID. Mirrors
    // `switchCamera` (stop → reselect format → start) but targets a named device
    // (Continuity / USB) rather than toggling front/back.
    func switchToCamera(uniqueID: String) async throws {
        guard let capturer = videoCapturer else { return }
        guard let camera = RTCCameraVideoCapturer.captureDevices().first(where: { $0.uniqueID == uniqueID }).map(Self.zoomCapable) else {
            throw WebRTCError.noCameraAvailable
        }
        guard let selectedFormat = camera.callCaptureFormat(within: captureCeiling) else {
            throw WebRTCError.noCameraFormatAvailable
        }
        // Same session-generation guard as switchCamera / restartCapturerIfStopped:
        // if disconnect() fires during the stop→start window, abort and stop the
        // orphan capturer rather than leaving the camera LED on with no shutdown path.
        let generation = sessionGeneration
        await capturer.stopCapture()
        let fps = selectedFormat.callFrameRate(within: captureCeiling)
        try await capturer.startCapture(with: camera, format: selectedFormat, fps: fps)
        let isStale = await MainActor.run { generation != sessionGeneration }
        if isStale {
            Logger.webrtc.warning("[WEBRTC] session changed during camera switch (by ID) — stopping orphan capture")
            await capturer.stopCapture()
            return
        }
        usingFrontCamera = (camera.position == .front)
        await attachLiveCamera(camera)
        Logger.webrtc.info("[WEBRTC] switched to camera \(camera.localizedName, privacy: .public)")
    }

    func getStats() async -> CallStats? {
        guard let pc = peerConnection else { return nil }
        return await PeerConnectionAsync.callStats(of: pc)
    }
}

#endif
