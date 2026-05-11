import Foundation
import AVFoundation
import os

#if canImport(WebRTC)
@preconcurrency import WebRTC

// PERF-001: Cache RTCPeerConnectionFactory + SSL init as a process-wide singleton.
// RTCInitializeSSL() and RTCPeerConnectionFactory(...) are heavy (boringssl init,
// codec enumeration, GPU probing). Doing this on every P2PWebRTCClient.init blew
// ~150–250ms of main-thread time per call setup. The factory is internally
// thread-safe and meant to be reused for the process lifetime.
//
// PERF-002: Strip software fallback codecs (VP8/VP9) by pinning the encoder's
// preferred codec to H.264 when available. Hardware H.264 is ~3× more energy
// efficient than software VP8/VP9 on iOS and matches what the Apple ecosystem
// negotiates by default for FaceTime-style calls.
private enum WebRTCSharedFactory {
    static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        let encoder = RTCDefaultVideoEncoderFactory()
        let h264Codecs = encoder.supportedCodecs().filter { $0.name == kRTCVideoCodecH264Name }
        if let preferred = h264Codecs.first {
            encoder.preferredCodec = preferred
        }
        let decoder = RTCDefaultVideoDecoderFactory()
        return RTCPeerConnectionFactory(encoderFactory: encoder, decoderFactory: decoder)
    }()
}

final class P2PWebRTCClient: NSObject, WebRTCClientProviding, @unchecked Sendable {
    weak var delegate: (any WebRTCClientDelegate)?

    private var peerConnection: RTCPeerConnection?
    private let factory: RTCPeerConnectionFactory
    private var localAudioTrack: RTCAudioTrack?
    private var audioTransceiver: RTCRtpTransceiver?
    private var videoTransceiver: RTCRtpTransceiver?
    private var localVideoTrack_: RTCVideoTrack?
    private var videoCapturer: RTCCameraVideoCapturer?
    private var videoFilterDelegate: VideoFilterCapturerDelegate?
    private var remoteVideoTrack_: RTCVideoTrack?
    private var remoteAudioTrack_: RTCAudioTrack?
    private var usingFrontCamera = true
    private(set) var videoFilterPipeline = VideoFilterPipeline()
    private var transcriptionDataChannel: RTCDataChannel?
    private let audioProcessingModule: MeeshyAudioProcessingModule
    private let _audioEffectsService: CallAudioEffectsService

    var audioEffectsService: CallAudioEffectsServiceProviding? { _audioEffectsService }

    var isConnected: Bool {
        peerConnection?.connectionState == .connected
    }

    var localVideoTrack: Any? { localVideoTrack_ }
    var remoteVideoTrack: Any? { remoteVideoTrack_ }

    override init() {
        let effectsService = CallAudioEffectsService()
        self._audioEffectsService = effectsService
        self.audioProcessingModule = MeeshyAudioProcessingModule(effectsService: effectsService)

        // PERF-001: reuse the process-wide cached factory (initialized lazily once).
        // SSL init is performed inside the factory's lazy block.
        self.factory = WebRTCSharedFactory.factory

        super.init()

        // CallKit owns AVAudioSession lifecycle (didActivate/didDeactivate).
        // Switching WebRTC into manual-audio mode means it stops touching the
        // session on its own and waits for us (CallManager + CallKit delegate)
        // to flip `isAudioEnabled`. Without this, WebRTC's auto-managed mode
        // races with CallKit and the audio engine never starts cleanly.
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        session.useManualAudio = true
        session.isAudioEnabled = false
        session.unlockForConfiguration()

        // factory.audioDeviceModule is not available in the public WebRTC SDK build
        // Custom audio processing delegate requires a custom WebRTC build with ADM exposed
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
        // PERF-003: pre-warm ICE candidate gathering while the user is still
        // tapping Answer. With pool size = 4, host/srflx/relay candidates start
        // resolving as soon as setConfiguration runs, so ICE checks can begin
        // immediately after the SDP answer is sent — typically shaving 200–400ms
        // off the connect time on cellular.
        config.iceCandidatePoolSize = 4

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

    func updateIceServers(_ iceServers: [IceServer]) {
        guard let pc = peerConnection else { return }
        let config = pc.configuration
        config.iceServers = iceServers.map { server in
            RTCIceServer(
                urlStrings: server.urls,
                username: server.username,
                credential: server.credential
            )
        }
        pc.setConfiguration(config)
        Logger.webrtc.info("ICE servers updated to \(iceServers.count) servers (no reconnect)")
    }

    // MARK: - Local Media

    func startLocalMedia(type: CallMediaType) async throws {
        Logger.webrtc.info("[WEBRTC] startLocalMedia begin type=\(String(describing: type))")
        guard let pc = peerConnection else { throw WebRTCError.noPeerConnection }

        let audioConstraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "echoCancellation": "true",
                "noiseSuppression": "true",
                "autoGainControl": "true"
            ],
            optionalConstraints: nil
        )
        Logger.webrtc.info("[WEBRTC] audioSource begin")
        let audioSource = factory.audioSource(with: audioConstraints)
        Logger.webrtc.info("[WEBRTC] audioTrack begin")
        let audioTrack = factory.audioTrack(with: audioSource, trackId: "audio0")
        audioTrack.isEnabled = true
        localAudioTrack = audioTrack
        Logger.webrtc.info("[WEBRTC] addTransceiver audio")
        // Phase 2 — addTransceiver garantit la présence du transceiver dans
        // pc.transceivers AVANT setLocalDescription, ce qui permet d'appliquer
        // setCodecPreferences de manière fiable. add(track:streamIds:) crée
        // un transceiver implicite mais la liste pc.transceivers peut rester
        // vide jusqu'au premier setLocalDescription, rendant setCodecPreferences
        // inopérant. Reference §3.8 + §7 E9/E12.
        let audioInit = RTCRtpTransceiverInit()
        audioInit.direction = .sendRecv
        audioInit.streamIds = ["meeshy-stream-0"]
        guard let audioTransceiver = pc.addTransceiver(of: .audio, init: audioInit) else {
            throw WebRTCError.failedToCreatePeerConnection
        }
        audioTransceiver.sender.track = audioTrack
        self.audioTransceiver = audioTransceiver
        applyAudioCodecPreferences(audioTransceiver: audioTransceiver)

        guard type == .audioVideo else {
            Logger.webrtc.info("Local audio track started")
            return
        }

        #if targetEnvironment(simulator)
        // iOS Simulator's AVCaptureDevice.DiscoverySession returns phantom devices,
        // but RTCCameraVideoCapturer.startCapture fails with FigCaptureSourceRemote
        // err=-17281 (kCMIOHardwareDeviceUnsupportedFormatError) on most simulator
        // images. Throw a typed error so the UI can degrade to audio-only.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §4.8
        Logger.webrtc.warning("[WEBRTC] simulator detected — skipping video capture (audio-only fallback)")
        throw WebRTCError.simulatorVideoUnsupported
        #else

        Logger.webrtc.info("[WEBRTC] videoSource begin")
        let videoSource = factory.videoSource()
        Logger.webrtc.info("[WEBRTC] videoTrack begin")
        let videoTrack = factory.videoTrack(with: videoSource, trackId: "video0")
        videoTrack.isEnabled = true
        localVideoTrack_ = videoTrack
        Logger.webrtc.info("[WEBRTC] addTransceiver video")
        let videoInit = RTCRtpTransceiverInit()
        videoInit.direction = .sendRecv
        videoInit.streamIds = ["meeshy-stream-0"]
        guard let videoTransceiver = pc.addTransceiver(of: .video, init: videoInit) else {
            throw WebRTCError.failedToCreatePeerConnection
        }
        videoTransceiver.sender.track = videoTrack
        self.videoTransceiver = videoTransceiver
        applyVideoCodecPreferences(videoTransceiver: videoTransceiver)

        let filterDelegate = VideoFilterCapturerDelegate(target: videoSource, pipeline: videoFilterPipeline)
        videoFilterDelegate = filterDelegate
        Logger.webrtc.info("[WEBRTC] RTCCameraVideoCapturer init")
        let capturer = RTCCameraVideoCapturer(delegate: filterDelegate)
        videoCapturer = capturer

        Logger.webrtc.info("[WEBRTC] captureDevices probe")
        let cams = RTCCameraVideoCapturer.captureDevices()
        Logger.webrtc.info("[WEBRTC] captureDevices count=\(cams.count)")
        guard let frontCamera = cams.first(where: { $0.position == .front }) else {
            // Sur simulator iOS il n'y a aucune caméra, donc on tombe ici si
            // type == .audioVideo. Renvoyer l'erreur typée fait remonter
            // l'échec proprement au lieu de laisser RTCCameraVideoCapturer
            // throw plus tard une NSException sur un device list vide.
            Logger.webrtc.error("[WEBRTC] no front camera (simulator?) — throwing noCameraAvailable")
            throw WebRTCError.noCameraAvailable
        }

        Logger.webrtc.info("[WEBRTC] selectFormat begin")
        let selectedFormat = selectFormat(for: frontCamera)
        guard let format = selectedFormat else {
            Logger.webrtc.error("[WEBRTC] no usable camera format — throwing noCameraFormatAvailable")
            throw WebRTCError.noCameraFormatAvailable
        }

        let fps = targetFrameRate(for: format)
        Logger.webrtc.info("[WEBRTC] capturer.startCapture begin fps=\(fps)")
        try await capturer.startCapture(with: frontCamera, format: format, fps: fps)
        Logger.webrtc.info("Local audio + video tracks started (front camera, \(fps)fps)")
        #endif
    }

    // Phase 2 — Apply audio codec preferences via libwebrtc 141 API.
    // Order: Opus first (primary), RED second (RFC 2198 redundancy).
    // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.8 + ADR-4
    //
    // RED was previously enabled via SDP munging (`addAudioRedundancy`) which
    // triggered an iOS libwebrtc bug with `a=fmtp:63 PT/PT` (silent audio after
    // ICE connected, commit 9e663039). Using setCodecPreferences avoids the
    // SDP regex path entirely — libwebrtc 141 negotiates RED via the standard
    // API correctly.
    private func applyAudioCodecPreferences(audioTransceiver: RTCRtpTransceiver) {
        let factory = WebRTCSharedFactory.factory
        let capabilities = factory.rtpReceiverCapabilities(forKind: kRTCMediaStreamTrackKindAudio)

        let opusCodecs = capabilities.codecs.filter { $0.name.lowercased() == "opus" }
        let redCodecs = capabilities.codecs.filter { $0.name.lowercased() == "red" }

        // Opus primary, RED secondary. Drop CN, telephone-event, G722, PCMU.
        let preferred = opusCodecs + redCodecs
        guard !preferred.isEmpty else {
            Logger.webrtc.warning("[WEBRTC] no Opus/RED codecs available — leaving default preferences")
            return
        }

        // Audit 2026-05-11 — the previous typed-function-reference trick
        // (`let setCodecs: ([X]) throws -> Void = transceiver.setCodecPreferences`)
        // still selected the deprecated void overload at compile time —
        // confirmed by the persistent deprecation warning emitted at the
        // assignment site. With the deprecated variant, the catch block was
        // unreachable and any setCodecPreferences error (codec list empty,
        // transceiver stopped, peer rejected the preference) was silently
        // swallowed. Force the throwing `setCodecPreferences:error:` selector
        // via a dynamic ObjC dispatch that bypasses Swift's overload picker.
        do {
            try Self.invokeSetCodecPreferences(on: audioTransceiver, codecs: preferred)
            let names = preferred.map { $0.name }.joined(separator: ", ")
            Logger.webrtc.info("[WEBRTC] audio codec preferences applied: \(names, privacy: .public)")
        } catch {
            Logger.webrtc.warning("[WEBRTC] setCodecPreferences (audio) threw: \(error.localizedDescription, privacy: .public)")
        }

        // Phase 2 — apply Opus bitrate range via RTCRtpEncodingParameters.
        // DTX in libwebrtc 141 iOS Objective-C binding is NOT exposed on
        // RTCRtpEncodingParameters (the WebIDL `dtx` field has no ObjC analog
        // in this xcframework — verified against
        // WebRTC.xcframework/.../RTCRtpEncodingParameters.h). DTX therefore
        // remains driven by `usedtx=1` injected into Opus fmtp via
        // mungeOpusSDP. Bitrate min/max are honored by the encoder directly
        // through RtpEncodingParameters.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.8 + ADR-4
        let params = audioTransceiver.sender.parameters
        for encoding in params.encodings {
            // DTX: no native API — see comment above; handled via SDP fmtp `usedtx=1`.
            encoding.maxBitrateBps = NSNumber(value: 64_000)
            encoding.minBitrateBps = NSNumber(value: 16_000)
        }
        audioTransceiver.sender.parameters = params
        let encodingsCount = params.encodings.count
        if encodingsCount > 0 {
            Logger.webrtc.info("[WEBRTC] audio bitrate range applied via RtpEncodingParameters (max=64kbps, min=16kbps, encodings=\(encodingsCount, privacy: .public))")
        } else {
            Logger.webrtc.warning("[WEBRTC] audio bitrate NOT applied — encodings array empty")
        }
    }

    // Phase 2 — Apply video codec preferences via libwebrtc 141 API.
    // Order H264 > VP8 > VP9 (cross-platform iOS↔Web compatibility — §6.7).
    // AV1 excluded (uneven HW support across iOS/Chrome/Safari).
    // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.8 + §6.7
    //
    // Priority rationale:
    // - H264: hardware-accelerated on iOS (VideoToolbox), supported by Chrome 80+, Safari 13+
    // - VP8: software but ubiquitous, fallback for clients without H264 HW
    // - VP9: better compression, software-only on most iOS, optional fallback
    private func applyVideoCodecPreferences(videoTransceiver: RTCRtpTransceiver) {
        let factory = WebRTCSharedFactory.factory
        let capabilities = factory.rtpReceiverCapabilities(forKind: kRTCMediaStreamTrackKindVideo)

        let priorityOrder = ["H264", "VP8", "VP9"]
        let preferred = priorityOrder.flatMap { name in
            capabilities.codecs.filter { $0.name == name }
        }
        guard !preferred.isEmpty else {
            Logger.webrtc.warning("[WEBRTC] no preferred video codecs available — leaving default")
            return
        }

        // Same dynamic ObjC dispatch rationale as applyAudioCodecPreferences.
        do {
            try Self.invokeSetCodecPreferences(on: videoTransceiver, codecs: preferred)
            let names = preferred.map { $0.name }.joined(separator: ", ")
            Logger.webrtc.info("[WEBRTC] video codec preferences applied: \(names, privacy: .public)")
        } catch {
            Logger.webrtc.warning("[WEBRTC] setCodecPreferences (video) threw: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Calls the throwing `setCodecPreferences:error:` selector on the given
    /// transceiver via the ObjC runtime, bypassing Swift's overload resolution
    /// which silently prefers the deprecated void overload (see audit
    /// 2026-05-11 §B-Claim-1). The function-pointer cast matches the real
    /// ObjC method signature: `BOOL (*)(NSObject, Selector, NSArray, NSError**)`.
    private static func invokeSetCodecPreferences(
        on transceiver: RTCRtpTransceiver,
        codecs: [RTCRtpCodecCapability]
    ) throws {
        typealias SetCodecsIMP = @convention(c) (
            NSObject, Selector, NSArray, AutoreleasingUnsafeMutablePointer<NSError?>
        ) -> Bool
        // Use #selector with the typed protocol reference so the compiler
        // verifies the selector exists at build time (Swift's recommendation
        // over string-literal Selector). The Protocol-suffixed name is
        // libwebrtc's auto-generated Swift name for the ObjC protocol.
        let selector = #selector(RTCRtpTransceiverProtocol.setCodecPreferences(_:error:))
        guard transceiver.responds(to: selector) else {
            throw NSError(
                domain: "MeeshyWebRTC", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "setCodecPreferences:error: selector not exposed by libwebrtc binding"]
            )
        }
        guard let imp = transceiver.method(for: selector) else {
            throw NSError(
                domain: "MeeshyWebRTC", code: -2,
                userInfo: [NSLocalizedDescriptionKey: "setCodecPreferences:error: IMP unavailable"]
            )
        }
        let fn = unsafeBitCast(imp, to: SetCodecsIMP.self)
        var nsError: NSError?
        let ok = fn(transceiver, selector, codecs as NSArray, &nsError)
        if !ok {
            throw nsError ?? NSError(
                domain: "MeeshyWebRTC", code: -3,
                userInfo: [NSLocalizedDescriptionKey: "setCodecPreferences returned false with no error"]
            )
        }
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

        var mungedSDP = Self.mungeOpusSDP(sdp.sdp)
        // Phase 2 — RED is now negotiated via setCodecPreferences (libwebrtc 141 API).
        // The previous SDP munging path (addAudioRedundancy) was disabled in 9e663039
        // due to a PT/PT negotiation bug. The setCodecPreferences API avoids the
        // regex entirely. addAudioRedundancy is kept as a static function for
        // diagnostic comparison but MUST NOT be called.
        // Reference §3.8 + ADR-4.
        mungedSDP = Self.addTransportCC(mungedSDP)
        mungedSDP = Self.addVideoBitrateHints(mungedSDP)
        let mungedDescription = RTCSessionDescription(type: sdp.type, sdp: mungedSDP)
        try await setLocalDescription(mungedDescription, on: pc)
        Logger.webrtc.info("SDP offer created and set as local description (Opus munged)")
        return SessionDescription(type: .offer, sdp: mungedSDP)
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

        var mungedSDP = Self.mungeOpusSDP(sdp.sdp)
        // Phase 2 — RED is now negotiated via setCodecPreferences (libwebrtc 141 API).
        // The previous SDP munging path (addAudioRedundancy) was disabled in 9e663039
        // due to a PT/PT negotiation bug. The setCodecPreferences API avoids the
        // regex entirely. addAudioRedundancy is kept as a static function for
        // diagnostic comparison but MUST NOT be called.
        // Reference §3.8 + ADR-4.
        mungedSDP = Self.addTransportCC(mungedSDP)
        mungedSDP = Self.addVideoBitrateHints(mungedSDP)
        let mungedDescription = RTCSessionDescription(type: sdp.type, sdp: mungedSDP)
        try await setLocalDescription(mungedDescription, on: pc)
        Logger.webrtc.info("SDP answer created and set as local description (Opus munged)")
        return SessionDescription(type: .answer, sdp: mungedSDP)
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

        await capturer.stopCapture()
        let fps = targetFrameRate(for: selectedFormat)
        try await capturer.startCapture(with: camera, format: selectedFormat, fps: fps)
        Logger.webrtc.info("Switched to \(self.usingFrontCamera ? "front" : "back") camera")
    }

    func getStats() async -> CallStats? {
        guard let pc = peerConnection else { return nil }
        return await withCheckedContinuation { continuation in
            pc.statistics { report in
                var rtt: Double = 0
                var packetsLost: Int = 0
                var bytesSent: Int = 0
                var bytesReceived: Int = 0
                var packetsSent: Int = 0
                var packetsReceived: Int = 0
                var codec: String?

                for (_, stats) in report.statistics {
                    if stats.type == "candidate-pair" {
                        let values = stats.values
                        if let rttValue = values["currentRoundTripTime"] as? NSNumber {
                            rtt = rttValue.doubleValue * 1000
                        }
                    }
                    if stats.type == "inbound-rtp" {
                        let values = stats.values
                        if let lost = values["packetsLost"] as? NSNumber {
                            packetsLost = lost.intValue
                        }
                        if let received = values["bytesReceived"] as? NSNumber {
                            bytesReceived += received.intValue
                        }
                        if let pkts = values["packetsReceived"] as? NSNumber {
                            packetsReceived += pkts.intValue
                        }
                        if let codecId = values["codecId"] as? String {
                            codec = codecId
                        }
                    }
                    if stats.type == "outbound-rtp" {
                        let values = stats.values
                        if let sent = values["bytesSent"] as? NSNumber {
                            bytesSent += sent.intValue
                        }
                        if let pkts = values["packetsSent"] as? NSNumber {
                            packetsSent += pkts.intValue
                        }
                    }
                }

                // DIAGNOSTIC : log explicite des bytes/packets pour confirmer
                // si l'audio circule réellement (vs juste ICE keepalives).
                Logger.webrtc.info("[STATS] sent=\(bytesSent)B/\(packetsSent)pkt recv=\(bytesReceived)B/\(packetsReceived)pkt rtt=\(rtt)ms loss=\(packetsLost)")

                continuation.resume(returning: CallStats(
                    roundTripTimeMs: rtt,
                    packetsLost: packetsLost,
                    bandwidth: bytesSent,
                    codec: codec,
                    inboundPacketsReceived: packetsReceived
                ))
            }
        }
    }

    // MARK: - DataChannel

    func createDataChannel(label: String) -> Bool {
        guard let pc = peerConnection else { return false }
        let config = RTCDataChannelConfiguration()
        config.isOrdered = true
        guard let channel = pc.dataChannel(forLabel: label, configuration: config) else {
            Logger.webrtc.error("Failed to create DataChannel: \(label)")
            return false
        }
        channel.delegate = self
        transcriptionDataChannel = channel
        Logger.webrtc.info("DataChannel created: \(label)")
        return true
    }

    func sendDataChannelMessage(_ data: Data) {
        guard let channel = transcriptionDataChannel, channel.readyState == .open else { return }
        let buffer = RTCDataBuffer(data: data, isBinary: false)
        channel.sendData(buffer)
    }

    // MARK: - Audio Effects

    func setAudioEffect(_ effect: AudioEffectConfig?) throws {
        try _audioEffectsService.setEffect(effect)
        Logger.webrtc.info("Audio effect set: \(effect?.effectType.rawValue ?? "none")")
    }

    func updateAudioEffectParams(_ config: AudioEffectConfig) throws {
        try _audioEffectsService.updateParams(config)
    }

    // MARK: - Disconnect

    func disconnect() {
        _audioEffectsService.reset()
        transcriptionDataChannel?.close()
        transcriptionDataChannel = nil
        videoCapturer?.stopCapture()
        localAudioTrack?.isEnabled = false
        localVideoTrack_?.isEnabled = false
        peerConnection?.close()
        peerConnection = nil
        localAudioTrack = nil
        localVideoTrack_ = nil
        remoteVideoTrack_ = nil
        remoteAudioTrack_ = nil
        audioTransceiver = nil
        videoTransceiver = nil
        videoCapturer = nil
        Logger.webrtc.info("Peer connection disconnected and cleaned up")
    }

    deinit {
        // disconnect() is MainActor-isolated; callers must call it explicitly
        // before release. ARC handles per-property cleanup here.
        //
        // RTCCleanupSSL() must NOT be called here: `WebRTCSharedFactory.factory`
        // initializes SSL exactly once for the whole process (PERF-001), and the
        // factory keeps using the SSL context across every P2PWebRTCClient
        // instance. Tearing it down per-deinit broke any 2nd call in the same
        // app session (silent DTLS failure or crash on the next handshake).
        // SSL state is reclaimed by the OS at process exit — that is correct
        // on iOS, no explicit cleanup needed.
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
        // Préférer un format <=720p qui supporte 30fps. Sans le filtre fps,
        // l'iPhone Pro peut sélectionner un format slow-motion 720p@120/240fps
        // (où minFrameRate=maxFrameRate=120) — `RTCCameraVideoCapturer.startCapture`
        // est alors appelé en fps=120, ce qui produit `FigCaptureSourceRemote
        // err=-17281` (kCMIOHardwareDeviceUnsupportedFormatError) sur certains
        // devices et gaspille batterie/CPU sur tous.
        let target: Float64 = 30
        let supports30fps: (AVCaptureDevice.Format) -> Bool = { f in
            f.videoSupportedFrameRateRanges.contains { $0.minFrameRate <= target && target <= $0.maxFrameRate }
        }

        let supported = RTCCameraVideoCapturer.supportedFormats(for: device)
        let sorted = supported.sorted { f1, f2 in
            let d1 = CMVideoFormatDescriptionGetDimensions(f1.formatDescription)
            let d2 = CMVideoFormatDescriptionGetDimensions(f2.formatDescription)
            return d1.width * d1.height < d2.width * d2.height
        }

        if let format = sorted.last(where: { f in
            let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return d.width <= 1280 && d.height <= 720 && supports30fps(f)
        }) {
            return format
        }

        if let format = sorted.last(where: { f in
            let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return d.width <= 1280 && d.height <= 720
        }) {
            return format
        }

        return sorted.first(where: supports30fps) ?? supported.last
    }

    static func mungeOpusSDP(_ sdp: String) -> String {
        // Phase 2 — `usedtx=1` enables Opus discontinuous transmission (silence
        // suppression). libwebrtc 141 iOS ObjC binding does NOT expose a `dtx`
        // property on RTCRtpEncodingParameters, so DTX remains driven via fmtp
        // here. `useinbandfec=1` is similarly fmtp-only (no native API).
        // maxaveragebitrate, stereo, maxplaybackrate remain as quality hints.
        // The earlier diagnostic that toggled `usedtx=0` (suspected of silent
        // audio after ICE) was disproven once RED munging was disabled in
        // 9e663039 — the PT/PT bug was the real cause, not DTX.
        // Reference §3.8 + ADR-4.
        let opusParams = [
            "maxaveragebitrate=64000",
            "stereo=1",
            "useinbandfec=1",
            "usedtx=1",
            "maxplaybackrate=48000"
        ]
        let paramString = opusParams.joined(separator: ";")

        var lines = sdp.components(separatedBy: "\r\n")
        var opusPayloadType: String?

        for line in lines where line.hasPrefix("a=rtpmap:") && line.contains("opus/48000") {
            let parts = line.dropFirst("a=rtpmap:".count).split(separator: " ", maxSplits: 1)
            if let pt = parts.first {
                opusPayloadType = String(pt)
            }
        }

        guard let payloadType = opusPayloadType else { return sdp }

        let fmtpPrefix = "a=fmtp:\(payloadType) "
        var found = false
        lines = lines.map { line in
            guard line.hasPrefix(fmtpPrefix) else { return line }
            found = true
            let existing = line.dropFirst(fmtpPrefix.count)
            var params = existing.split(separator: ";").map(String.init)
            let newKeys = Set(opusParams.map { $0.split(separator: "=", maxSplits: 1).first.map(String.init) ?? "" })
            params.removeAll { param in
                let key = param.split(separator: "=", maxSplits: 1).first.map(String.init) ?? ""
                return newKeys.contains(key)
            }
            params.append(contentsOf: opusParams)
            return fmtpPrefix + params.joined(separator: ";")
        }

        if !found {
            if let rtpmapIndex = lines.firstIndex(where: { $0.hasPrefix("a=rtpmap:\(payloadType) ") }) {
                lines.insert(fmtpPrefix + paramString, at: rtpmapIndex + 1)
            }
        }

        return lines.joined(separator: "\r\n")
    }

    @available(*, deprecated, message: "RED is now negotiated via setCodecPreferences. Calling this re-introduces the PT/PT silent-audio bug from 9e663039. Reference §3.8 + ADR-4.")
    static func addAudioRedundancy(_ sdp: String) -> String {
        var lines = sdp.components(separatedBy: "\r\n")

        var opusPayloadType: String?
        for line in lines where line.hasPrefix("a=rtpmap:") && line.contains("opus/48000") {
            let parts = line.dropFirst("a=rtpmap:".count).split(separator: " ", maxSplits: 1)
            if let pt = parts.first { opusPayloadType = String(pt) }
        }
        guard let opusPT = opusPayloadType else { return sdp }

        let redPT = "63"
        let redRtpmap = "a=rtpmap:\(redPT) red/48000/2"
        guard !lines.contains(where: { $0.contains("red/48000") }) else { return sdp }

        let redFmtp = "a=fmtp:\(redPT) \(opusPT)/\(opusPT)"

        for i in 0..<lines.count {
            guard lines[i].hasPrefix("m=audio ") else { continue }
            let parts = lines[i].split(separator: " ")
            guard parts.count >= 4 else { continue }
            let prefix = parts[0..<3].joined(separator: " ")
            let payloads = parts[3...].map(String.init)
            guard !payloads.contains(redPT) else { break }
            lines[i] = prefix + " " + redPT + " " + payloads.joined(separator: " ")

            if let rtpmapIdx = lines[(i+1)...].firstIndex(where: { $0.hasPrefix("a=rtpmap:\(opusPT) ") }) {
                lines.insert(redFmtp, at: rtpmapIdx)
                lines.insert(redRtpmap, at: rtpmapIdx)
            }
            break
        }

        return lines.joined(separator: "\r\n")
    }

    static func addTransportCC(_ sdp: String) -> String {
        let transportCCURI = "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"
        guard !sdp.contains(transportCCURI) else { return sdp }

        var lines = sdp.components(separatedBy: "\r\n")
        var usedExtmapIDs = Set<Int>()
        for line in lines where line.hasPrefix("a=extmap:") {
            let idStr = line.dropFirst("a=extmap:".count).split(separator: " ", maxSplits: 1).first ?? ""
            let cleanID = idStr.split(separator: "/").first ?? idStr
            if let id = Int(cleanID) { usedExtmapIDs.insert(id) }
        }

        var extID = 5
        while usedExtmapIDs.contains(extID) { extID += 1 }
        let extmapLine = "a=extmap:\(extID) \(transportCCURI)"

        for i in 0..<lines.count where lines[i].hasPrefix("m=audio ") || lines[i].hasPrefix("m=video ") {
            var insertIdx = i + 1
            while insertIdx < lines.count && !lines[insertIdx].hasPrefix("m=") {
                if lines[insertIdx].hasPrefix("a=extmap:") {
                    insertIdx += 1
                    continue
                }
                if lines[insertIdx].hasPrefix("a=") && !lines[insertIdx].hasPrefix("a=extmap:") { break }
                insertIdx += 1
            }
            lines.insert(extmapLine, at: insertIdx)
        }

        return lines.joined(separator: "\r\n")
    }

    static func addVideoBitrateHints(_ sdp: String) -> String {
        var lines = sdp.components(separatedBy: "\r\n")
        var inVideoSection = false

        for i in 0..<lines.count {
            if lines[i].hasPrefix("m=video ") {
                inVideoSection = true
                continue
            }
            if lines[i].hasPrefix("m=") { inVideoSection = false }
            guard inVideoSection && lines[i].hasPrefix("a=fmtp:") else { continue }
            guard !lines[i].contains("x-google-max-bitrate") else { continue }
            lines[i] += ";x-google-max-bitrate=2500;x-google-min-bitrate=100"
        }

        return lines.joined(separator: "\r\n")
    }

    static func enableSimulcast(_ sdp: String) -> String {
        var lines = sdp.components(separatedBy: "\r\n")
        var firstVideoMLine: Int?

        for i in 0..<lines.count where lines[i].hasPrefix("m=video ") {
            firstVideoMLine = i
            break
        }
        guard let videoIdx = firstVideoMLine else { return sdp }

        var endOfVideoSection = lines.count
        for i in (videoIdx + 1)..<lines.count where lines[i].hasPrefix("m=") {
            endOfVideoSection = i
            break
        }

        guard !lines[videoIdx..<endOfVideoSection].contains(where: { $0.hasPrefix("a=simulcast:") }) else {
            return sdp
        }

        let simulcastLines = [
            "a=rid:h send",
            "a=rid:m send",
            "a=rid:l send",
            "a=simulcast:send h;m;l"
        ]
        lines.insert(contentsOf: simulcastLines, at: endOfVideoSection)

        return lines.joined(separator: "\r\n")
    }

    private func targetFrameRate(for format: AVCaptureDevice.Format) -> Int {
        // Visons 30fps pour les appels vidéo (assez lisse, ~2x moins de CPU/batterie
        // que 60fps). Si le format ne contient pas 30 dans une de ses ranges
        // (ex: format slow-mo pure 120fps-only), fallback sur la valeur la plus
        // proche de 30 atteignable — JAMAIS le maxFrameRate brut, qui pour un
        // format 120fps-only ferait crasher `startCapture` avec
        // `FigCaptureSourceRemote err=-17281`.
        let target: Float64 = 30
        let ranges = format.videoSupportedFrameRateRanges
        if ranges.contains(where: { $0.minFrameRate <= target && target <= $0.maxFrameRate }) {
            return Int(target)
        }
        let candidates = ranges.flatMap { range in
            [max(range.minFrameRate, min(range.maxFrameRate, target)), range.minFrameRate, range.maxFrameRate]
        }
        let closest = candidates.min(by: { abs($0 - target) < abs($1 - target) }) ?? target
        return Int(closest)
    }
}

// MARK: - RTCPeerConnectionDelegate
//
// Toutes ces méthodes sont invoquées par WebRTC depuis son `signaling_thread`
// (et `network_thread` pour ICE). Sous Swift 6 + default isolation = MainActor
// du target Meeshy, l'@objc thunk généré par le compilateur vérifie l'executor
// au runtime et trap (`_swift_task_checkIsolatedSwift` →
// `dispatch_assert_queue_fail`) dès que WebRTC livre un callback hors du Main
// — typiquement quand `peerConnection.add(audioTrack, …)` déclenche
// `peerConnectionShouldNegotiate(_:)` synchrone depuis le signaling thread,
// ce qui ferme l'app au lancement de l'appel.
//
// Fix : marquer chaque méthode `nonisolated` pour autoriser l'appel depuis
// n'importe quel thread. Toute mutation de state qui touche le ViewModel
// reste dispatchée vers Main via `DispatchQueue.main.async` (already in
// place pour le delegate forwarding).

extension P2PWebRTCClient: RTCPeerConnectionDelegate {
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {
        Logger.webrtc.info("Signaling state: \(stateChanged.rawValue)")
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        let videoTrack = stream.videoTracks.first
        let audioTrack = stream.audioTracks.first
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if let videoTrack {
                self.remoteVideoTrack_ = videoTrack
                self.delegate?.webRTCClient(self, didReceiveRemoteVideoTrack: videoTrack)
            }
            if let audioTrack {
                self.remoteAudioTrack_ = audioTrack
                self.delegate?.webRTCClient(self, didReceiveRemoteAudioTrack: audioTrack)
            }
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {
        Logger.webrtc.info("Remote stream removed")
    }

    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {
        Logger.webrtc.info("Negotiation needed")
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
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

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        Logger.webrtc.info("ICE gathering state: \(newState.rawValue)")
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
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

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {
        Logger.webrtc.debug("Removed \(candidates.count) ICE candidates")
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        Logger.webrtc.info("Data channel opened: \(dataChannel.label)")
        guard dataChannel.label == "transcription" else { return }
        dataChannel.delegate = self
        DispatchQueue.main.async { [weak self] in
            self?.transcriptionDataChannel = dataChannel
        }
    }
}

// MARK: - RTCDataChannelDelegate
//
// Idem RTCPeerConnectionDelegate — les data channel callbacks arrivent du
// signaling thread WebRTC, donc `nonisolated`.

extension P2PWebRTCClient: RTCDataChannelDelegate {
    nonisolated func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        Logger.webrtc.info("DataChannel '\(dataChannel.label)' state: \(dataChannel.readyState.rawValue)")
    }

    nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        let data = buffer.data
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.delegate?.webRTCClient(self, didReceiveDataChannelMessage: data)
        }
    }
}

#else

// MARK: - Fallback (WebRTC framework not available)

final class P2PWebRTCClient: WebRTCClientProviding {
    weak var delegate: (any WebRTCClientDelegate)?
    var isConnected: Bool { false }
    var localVideoTrack: Any? { nil }
    var remoteVideoTrack: Any? { nil }

    func configure(iceServers: [IceServer]) throws {
        Logger.webrtc.warning("WebRTC framework not available - calls are disabled")
        throw WebRTCError.notSupported
    }

    func updateIceServers(_ iceServers: [IceServer]) {}

    func createOffer() async throws -> SessionDescription { throw WebRTCError.notSupported }
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription { throw WebRTCError.notSupported }
    func setRemoteAnswer(_ answer: SessionDescription) async throws { throw WebRTCError.notSupported }
    func addIceCandidate(_ candidate: IceCandidate) async throws { throw WebRTCError.notSupported }
    func startLocalMedia(type: CallMediaType) async throws { throw WebRTCError.notSupported }
    func toggleAudio(_ enabled: Bool) {}
    func toggleVideo(_ enabled: Bool) {}
    func switchCamera() async throws {}
    func getStats() async -> CallStats? { nil }
    func createDataChannel(label: String) -> Bool { false }
    func sendDataChannelMessage(_ data: Data) {}
    func disconnect() {}

    var audioEffectsService: CallAudioEffectsServiceProviding? { nil }
    func setAudioEffect(_ effect: AudioEffectConfig?) throws { throw WebRTCError.notSupported }
    func updateAudioEffectParams(_ config: AudioEffectConfig) throws { throw WebRTCError.notSupported }
}

#endif

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let webrtc = Logger(subsystem: "me.meeshy.app", category: "webrtc")
}
