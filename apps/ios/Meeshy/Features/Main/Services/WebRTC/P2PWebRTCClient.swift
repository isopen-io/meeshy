import Foundation
import AVFoundation
import os

#if canImport(WebRTC)
@preconcurrency import WebRTC

final class P2PWebRTCClient: NSObject, WebRTCClientProviding, @unchecked Sendable {
    weak var delegate: (any WebRTCClientDelegate)?

    private var peerConnection: RTCPeerConnection?
    private var factory: RTCPeerConnectionFactory!
    private var localAudioTrack: RTCAudioTrack?
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

        super.init()
        RTCInitializeSSL()
        let encoderFactory = RTCDefaultVideoEncoderFactory()
        let decoderFactory = RTCDefaultVideoDecoderFactory()
        factory = RTCPeerConnectionFactory(
            encoderFactory: encoderFactory,
            decoderFactory: decoderFactory
        )
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
            mandatoryConstraints: [
                "echoCancellation": "true",
                "noiseSuppression": "true",
                "autoGainControl": "true"
            ],
            optionalConstraints: nil
        )
        let audioSource = factory.audioSource(with: audioConstraints)
        let audioTrack = factory.audioTrack(with: audioSource, trackId: "audio0")
        audioTrack.isEnabled = true
        localAudioTrack = audioTrack
        peerConnection?.add(audioTrack, streamIds: ["meeshy-stream-0"])

        guard type == .audioVideo else {
            Logger.webrtc.info("Local audio track started")
            return
        }

        let videoSource = factory.videoSource()
        let videoTrack = factory.videoTrack(with: videoSource, trackId: "video0")
        videoTrack.isEnabled = true
        localVideoTrack_ = videoTrack
        peerConnection?.add(videoTrack, streamIds: ["meeshy-stream-0"])

        let filterDelegate = VideoFilterCapturerDelegate(target: videoSource, pipeline: videoFilterPipeline)
        videoFilterDelegate = filterDelegate
        let capturer = RTCCameraVideoCapturer(delegate: filterDelegate)
        videoCapturer = capturer

        guard let frontCamera = RTCCameraVideoCapturer.captureDevices().first(where: { $0.position == .front }) else {
            throw WebRTCError.noCameraAvailable
        }

        let selectedFormat = selectFormat(for: frontCamera)
        guard let format = selectedFormat else {
            throw WebRTCError.noCameraFormatAvailable
        }

        let fps = targetFrameRate(for: format)
        try await capturer.startCapture(with: frontCamera, format: format, fps: fps)
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

        var mungedSDP = Self.mungeOpusSDP(sdp.sdp)
        mungedSDP = Self.addAudioRedundancy(mungedSDP)
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
        mungedSDP = Self.addAudioRedundancy(mungedSDP)
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
                var bandwidth: Int = 0
                var codec: String?

                for (_, stats) in report.statistics {
                    if stats.type == "candidate-pair", let values = stats.values as? [String: NSObject] {
                        if let rttValue = values["currentRoundTripTime"] as? NSNumber {
                            rtt = rttValue.doubleValue * 1000
                        }
                    }
                    if stats.type == "inbound-rtp", let values = stats.values as? [String: NSObject] {
                        if let lost = values["packetsLost"] as? NSNumber {
                            packetsLost = lost.intValue
                        }
                        if let codecId = values["codecId"] as? String {
                            codec = codecId
                        }
                    }
                    if stats.type == "outbound-rtp", let values = stats.values as? [String: NSObject] {
                        if let bytesSent = values["bytesSent"] as? NSNumber {
                            bandwidth = bytesSent.intValue
                        }
                    }
                }

                continuation.resume(returning: CallStats(
                    roundTripTimeMs: rtt,
                    packetsLost: packetsLost,
                    bandwidth: bandwidth,
                    codec: codec
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

    static func mungeOpusSDP(_ sdp: String) -> String {
        let opusParams = [
            "maxaveragebitrate=128000",
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
        let rates: [Float64] = format.videoSupportedFrameRateRanges.map { $0.maxFrameRate }
        let closest: Float64 = rates.min(by: { abs($0 - 30) < abs($1 - 30) }) ?? 30
        return Int(closest)
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
        if dataChannel.label == "transcription" {
            dataChannel.delegate = self
            transcriptionDataChannel = dataChannel
        }
    }
}

// MARK: - RTCDataChannelDelegate

extension P2PWebRTCClient: RTCDataChannelDelegate {
    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        Logger.webrtc.info("DataChannel '\(dataChannel.label)' state: \(dataChannel.readyState.rawValue)")
    }

    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        delegate?.webRTCClient(self, didReceiveDataChannelMessage: buffer.data)
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
    static let webrtc = Logger(subsystem: "me.meeshy.app", category: "webrtc")
}
