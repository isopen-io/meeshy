import Foundation
import AVFoundation
import os

#if canImport(WebRTC)
import WebRTC

final class P2PWebRTCClient: NSObject, WebRTCClientProviding {
    weak var delegate: (any WebRTCClientDelegate)?

    private var peerConnection: RTCPeerConnection?
    private var factory: RTCPeerConnectionFactory!
    private var localAudioTrack: RTCAudioTrack?
    private var localVideoTrack_: RTCVideoTrack?
    private var videoCapturer: RTCCameraVideoCapturer?
    private var remoteVideoTrack_: RTCVideoTrack?
    private var remoteAudioTrack_: RTCAudioTrack?
    private var usingFrontCamera = true

    var isConnected: Bool {
        peerConnection?.connectionState == .connected
    }

    override init() {
        super.init()
        RTCInitializeSSL()
        let encoderFactory = RTCDefaultVideoEncoderFactory()
        let decoderFactory = RTCDefaultVideoDecoderFactory()
        factory = RTCPeerConnectionFactory(
            encoderFactory: encoderFactory,
            decoderFactory: decoderFactory
        )
    }

    // MARK: - Configuration

    func configure(iceServers: [IceServer]) throws {
        let config = RTCConfiguration()
        config.iceServers = iceServers.map { server in
            RTCIceServer(
                urlStrings: server.urls,
                username: server.username,
                credential: server.credential
            )
        }
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually
        config.bundlePolicy = .maxBundle
        config.rtcpMuxPolicy = .require

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
        )

        guard let pc = factory.peerConnection(
            with: config,
            constraints: constraints,
            delegate: self
        ) else {
            throw WebRTCError.failedToCreatePeerConnection
        }

        peerConnection = pc
        Logger.webrtc.info("Peer connection created with \(iceServers.count) ICE servers")
    }

    // MARK: - Local Media

    func startLocalMedia(type: CallMediaType) async throws {
        guard peerConnection != nil else { throw WebRTCError.noPeerConnection }

        let audioConstraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: nil
        )
        let audioSource = factory.audioSource(with: audioConstraints)
        let audioTrack = factory.audioTrack(with: audioSource, trackId: "audio0")
        audioTrack.isEnabled = true
        localAudioTrack = audioTrack
        peerConnection?.add(audioTrack, streamIds: ["stream0"])

        guard type == .audioVideo else {
            Logger.webrtc.info("Local audio track started")
            return
        }

        let videoSource = factory.videoSource()
        let videoTrack = factory.videoTrack(with: videoSource, trackId: "video0")
        videoTrack.isEnabled = true
        localVideoTrack_ = videoTrack
        peerConnection?.add(videoTrack, streamIds: ["stream0"])

        let capturer = RTCCameraVideoCapturer(delegate: videoSource)
        videoCapturer = capturer

        guard let frontCamera = RTCCameraVideoCapturer.captureDevices().first(where: { $0.position == .front }) else {
            throw WebRTCError.noCameraAvailable
        }

        let selectedFormat = selectFormat(for: frontCamera)
        guard let format = selectedFormat else {
            throw WebRTCError.noCameraFormatAvailable
        }

        let fps = targetFrameRate(for: format)
        capturer.startCapture(with: frontCamera, format: format, fps: fps)
        Logger.webrtc.info("Local audio + video tracks started (front camera, \(fps)fps)")
    }

    // MARK: - SDP Negotiation

    func createOffer() async throws -> SessionDescription {
        guard let pc = peerConnection else { throw WebRTCError.noPeerConnection }

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveAudio": "true",
                "OfferToReceiveVideo": "true"
            ],
            optionalConstraints: nil
        )

        let sdp: RTCSessionDescription = try await withCheckedThrowingContinuation { continuation in
            pc.offer(for: constraints) { sdp, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let sdp else {
                    continuation.resume(throwing: WebRTCError.failedToCreateSDP)
                    return
                }
                continuation.resume(returning: sdp)
            }
        }

        try await setLocalDescription(sdp, on: pc)
        Logger.webrtc.info("SDP offer created and set as local description")
        return SessionDescription(type: .offer, sdp: sdp.sdp)
    }

    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription {
        guard let pc = peerConnection else { throw WebRTCError.noPeerConnection }

        let rtcOffer = RTCSessionDescription(type: .offer, sdp: offer.sdp)
        try await setRemoteDescription(rtcOffer, on: pc)

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveAudio": "true",
                "OfferToReceiveVideo": "true"
            ],
            optionalConstraints: nil
        )

        let sdp: RTCSessionDescription = try await withCheckedThrowingContinuation { continuation in
            pc.answer(for: constraints) { sdp, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let sdp else {
                    continuation.resume(throwing: WebRTCError.failedToCreateSDP)
                    return
                }
                continuation.resume(returning: sdp)
            }
        }

        try await setLocalDescription(sdp, on: pc)
        Logger.webrtc.info("SDP answer created and set as local description")
        return SessionDescription(type: .answer, sdp: sdp.sdp)
    }

    func setRemoteAnswer(_ answer: SessionDescription) async throws {
        guard let pc = peerConnection else { throw WebRTCError.noPeerConnection }
        let rtcAnswer = RTCSessionDescription(type: .answer, sdp: answer.sdp)
        try await setRemoteDescription(rtcAnswer, on: pc)
        Logger.webrtc.info("Remote answer set")
    }

    func addIceCandidate(_ candidate: IceCandidate) async throws {
        guard let pc = peerConnection else { throw WebRTCError.noPeerConnection }
        let rtcCandidate = RTCIceCandidate(
            sdp: candidate.candidate,
            sdpMLineIndex: candidate.sdpMLineIndex,
            sdpMid: candidate.sdpMid
        )
        try await pc.add(rtcCandidate)
        Logger.webrtc.debug("ICE candidate added: \(candidate.candidate.prefix(40))...")
    }

    // MARK: - Media Controls

    func toggleAudio(_ enabled: Bool) {
        localAudioTrack?.isEnabled = enabled
        Logger.webrtc.info("Audio \(enabled ? "enabled" : "muted")")
    }

    func toggleVideo(_ enabled: Bool) {
        localVideoTrack_?.isEnabled = enabled
        Logger.webrtc.info("Video \(enabled ? "enabled" : "disabled")")
    }

    func switchCamera() async throws {
        guard let capturer = videoCapturer else { return }
        usingFrontCamera.toggle()
        let position: AVCaptureDevice.Position = usingFrontCamera ? .front : .back

        guard let camera = RTCCameraVideoCapturer.captureDevices().first(where: { $0.position == position }) else {
            usingFrontCamera.toggle()
            throw WebRTCError.noCameraAvailable
        }

        let format = selectFormat(for: camera)
        guard let selectedFormat = format else {
            usingFrontCamera.toggle()
            throw WebRTCError.noCameraFormatAvailable
        }

        capturer.stopCapture()
        let fps = targetFrameRate(for: selectedFormat)
        capturer.startCapture(with: camera, format: selectedFormat, fps: fps)
        Logger.webrtc.info("Switched to \(self.usingFrontCamera ? "front" : "back") camera")
    }

    func getStats() async -> CallStats? {
        nil
    }

    // MARK: - Disconnect

    func disconnect() {
        videoCapturer?.stopCapture()
        localAudioTrack?.isEnabled = false
        localVideoTrack_?.isEnabled = false
        peerConnection?.close()
        peerConnection = nil
        localAudioTrack = nil
        localVideoTrack_ = nil
        remoteVideoTrack_ = nil
        remoteAudioTrack_ = nil
        videoCapturer = nil
        Logger.webrtc.info("Peer connection disconnected and cleaned up")
    }

    deinit {
        disconnect()
        RTCCleanupSSL()
    }

    // MARK: - Private Helpers

    private func setLocalDescription(_ sdp: RTCSessionDescription, on pc: RTCPeerConnection) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.setLocalDescription(sdp) { error in
                if let error { cont.resume(throwing: error) }
                else { cont.resume() }
            }
        }
    }

    private func setRemoteDescription(_ sdp: RTCSessionDescription, on pc: RTCPeerConnection) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.setRemoteDescription(sdp) { error in
                if let error { cont.resume(throwing: error) }
                else { cont.resume() }
            }
        }
    }

    private func selectFormat(for device: AVCaptureDevice) -> AVCaptureDevice.Format? {
        RTCCameraVideoCapturer.supportedFormats(for: device)
            .sorted { f1, f2 in
                let d1 = CMVideoFormatDescriptionGetDimensions(f1.formatDescription)
                let d2 = CMVideoFormatDescriptionGetDimensions(f2.formatDescription)
                return d1.width * d1.height < d2.width * d2.height
            }
            .last(where: { f in
                let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
                return d.width <= 1280 && d.height <= 720
            }) ?? RTCCameraVideoCapturer.supportedFormats(for: device).last
    }

    private func targetFrameRate(for format: AVCaptureDevice.Format) -> Int {
        let fps = format.videoSupportedFrameRateRanges
            .compactMap { $0.maxFrameRate }
            .min(by: { abs($0 - 30) < abs($1 - 30) }) ?? 30
        return Int(fps)
    }
}

// MARK: - RTCPeerConnectionDelegate

extension P2PWebRTCClient: RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {
        Logger.webrtc.info("Signaling state: \(stateChanged.rawValue)")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        if let videoTrack = stream.videoTracks.first {
            remoteVideoTrack_ = videoTrack
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.delegate?.webRTCClient(self, didReceiveRemoteVideoTrack: videoTrack)
            }
        }
        if let audioTrack = stream.audioTracks.first {
            remoteAudioTrack_ = audioTrack
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.delegate?.webRTCClient(self, didReceiveRemoteAudioTrack: audioTrack)
            }
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {
        Logger.webrtc.info("Remote stream removed")
    }

    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {
        Logger.webrtc.info("Negotiation needed")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        let state: PeerConnectionState = switch newState {
        case .new: .new
        case .checking: .connecting
        case .connected: .connected
        case .completed: .connected
        case .disconnected: .disconnected
        case .failed: .failed
        case .closed: .closed
        case .count: .closed
        @unknown default: .new
        }
        Logger.webrtc.info("ICE connection state: \(state.rawValue)")
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.delegate?.webRTCClient(self, didChangeConnectionState: state)
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        Logger.webrtc.info("ICE gathering state: \(newState.rawValue)")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        let iceCandidate = IceCandidate(
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            candidate: candidate.sdp
        )
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.delegate?.webRTCClient(self, didGenerateCandidate: iceCandidate)
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {
        Logger.webrtc.debug("Removed \(candidates.count) ICE candidates")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        Logger.webrtc.info("Data channel opened: \(dataChannel.label)")
    }
}

#else

// MARK: - Fallback (WebRTC framework not available)

final class P2PWebRTCClient: WebRTCClientProviding {
    weak var delegate: (any WebRTCClientDelegate)?
    var isConnected: Bool { false }

    func configure(iceServers: [IceServer]) throws {
        Logger.webrtc.warning("WebRTC framework not available - calls are disabled")
        throw WebRTCError.notSupported
    }

    func createOffer() async throws -> SessionDescription { throw WebRTCError.notSupported }
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription { throw WebRTCError.notSupported }
    func setRemoteAnswer(_ answer: SessionDescription) async throws { throw WebRTCError.notSupported }
    func addIceCandidate(_ candidate: IceCandidate) async throws { throw WebRTCError.notSupported }
    func startLocalMedia(type: CallMediaType) async throws { throw WebRTCError.notSupported }
    func toggleAudio(_ enabled: Bool) {}
    func toggleVideo(_ enabled: Bool) {}
    func switchCamera() async throws {}
    func getStats() async -> CallStats? { nil }
    func disconnect() {}
}

#endif

// MARK: - Logger Extension

private extension Logger {
    static let webrtc = Logger(subsystem: "me.meeshy.app", category: "webrtc")
}
