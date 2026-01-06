//
//  WebRTCManager.swift
//  Meeshy
//
//  Complete WebRTC implementation for audio/video calls
//  Uses GoogleWebRTC pod for real device calls
//  Falls back to stubs for simulator
//
//  Minimum iOS 16+
//

import Foundation
import AVFoundation

#if canImport(WebRTC)
import WebRTC
#endif

// MARK: - WebRTC Configuration
// Note: ICEServerConfig is defined in CallSignalingService.swift

struct WebRTCConfiguration {
    let stunServers: [String]
    let turnServers: [TurnServer]
    let codecPreferences: CodecPreferences
    let mediaConstraints: MediaConstraints

    struct TurnServer {
        let url: String
        let username: String
        let credential: String
    }

    struct CodecPreferences {
        let preferredVideoCodec: String // "H264", "VP8", "VP9"
        let preferredAudioCodec: String // "opus", "PCMU", "PCMA"
    }

    struct MediaConstraints {
        let audioEnabled: Bool
        let videoEnabled: Bool
        let maxVideoBitrate: Int // kbps
        let maxAudioBitrate: Int // kbps
        let videoWidth: Int
        let videoHeight: Int
        let videoFps: Int
    }

    static var `default`: WebRTCConfiguration {
        WebRTCConfiguration(
            stunServers: [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
                "stun:stun2.l.google.com:19302",
                "stun:stun3.l.google.com:19302",
                "stun:stun4.l.google.com:19302"
            ],
            turnServers: [
                // OpenRelay public TURN servers - for production, use your own coturn or Twilio/Xirsys
                TurnServer(url: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject"),
                TurnServer(url: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject"),
                TurnServer(url: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject"),
                TurnServer(url: "turns:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject")
            ],
            codecPreferences: CodecPreferences(
                preferredVideoCodec: "H264",
                preferredAudioCodec: "opus"
            ),
            mediaConstraints: MediaConstraints(
                audioEnabled: true,
                videoEnabled: true,
                maxVideoBitrate: 2000,
                maxAudioBitrate: 128,
                videoWidth: 1280,
                videoHeight: 720,
                videoFps: 30
            )
        )
    }
}

// MARK: - WebRTC Stats

struct WebRTCStats {
    var bytesSent: Int64 = 0
    var bytesReceived: Int64 = 0
    var packetsSent: Int64 = 0
    var packetsReceived: Int64 = 0
    var packetsLost: Int64 = 0
    var jitter: Double = 0
    var roundTripTime: Double = 0
    var availableOutgoingBitrate: Double = 0
    var currentRoundTripTime: Double = 0

    var connectionQuality: ConnectionQuality {
        if packetsLost > 50 || roundTripTime > 300 {
            return .poor
        } else if packetsLost > 20 || roundTripTime > 200 {
            return .fair
        } else if roundTripTime > 100 {
            return .good
        }
        return .excellent
    }

    enum ConnectionQuality {
        case excellent, good, fair, poor
    }
}

// MARK: - WebRTC Delegate Protocol

@MainActor
protocol WebRTCManagerDelegate: AnyObject {
    func webRTCManager(_ manager: WebRTCManager, didGenerateLocalCandidate candidate: RTCIceCandidate)
    func webRTCManager(_ manager: WebRTCManager, didChangeConnectionState state: RTCIceConnectionState)
    func webRTCManager(_ manager: WebRTCManager, didReceiveRemoteVideoTrack track: RTCVideoTrack)
    func webRTCManager(_ manager: WebRTCManager, didReceiveRemoteAudioTrack track: RTCAudioTrack)
    func webRTCManager(_ manager: WebRTCManager, didUpdateStats stats: WebRTCStats)
    func webRTCManager(_ manager: WebRTCManager, didEncounterError error: Error)
}

// MARK: - WebRTC Manager

@MainActor
final class WebRTCManager: NSObject, ObservableObject {

    // MARK: - Singleton

    static let shared = WebRTCManager()

    // MARK: - Published Properties

    @Published private(set) var isConnected: Bool = false
    @Published private(set) var connectionState: RTCIceConnectionState = .new
    @Published var isMuted: Bool = false {
        didSet { updateAudioTrackState() }
    }
    @Published var isVideoEnabled: Bool = true {
        didSet { updateVideoTrackState() }
    }
    @Published var isFrontCamera: Bool = true
    @Published private(set) var stats: WebRTCStats = WebRTCStats()

    // MARK: - Properties

    weak var delegate: WebRTCManagerDelegate?

    private var configuration: WebRTCConfiguration = .default

    #if canImport(WebRTC) && !targetEnvironment(simulator)
    private var peerConnectionFactory: RTCPeerConnectionFactory?
    private var peerConnection: RTCPeerConnection?
    private var localAudioTrack: RTCAudioTrack?
    private var localVideoTrack: RTCVideoTrack?
    private var remoteAudioTrack: RTCAudioTrack?
    private var remoteVideoTrack: RTCVideoTrack?
    private var videoCapturer: RTCCameraVideoCapturer?
    private var videoSource: RTCVideoSource?
    #else
    // Stub properties for simulator
    private var peerConnectionFactory: RTCPeerConnectionFactory?
    private var peerConnection: RTCPeerConnection?
    private var localAudioTrack: RTCAudioTrack?
    private var localVideoTrack: RTCVideoTrack?
    private var remoteAudioTrack: RTCAudioTrack?
    private var remoteVideoTrack: RTCVideoTrack?
    private var videoCapturer: RTCCameraVideoCapturer?
    private var videoSource: RTCVideoSource?
    #endif

    // Audio
    private let audioQueue = DispatchQueue(label: "com.meeshy.webrtc.audio")

    // Stats timer
    private var statsTimer: Timer?

    // ICE candidates buffer (for when remote description is not set yet)
    private var pendingIceCandidates: [RTCIceCandidate] = []
    private var hasRemoteDescription = false

    // Remote participant ID for signaling
    private var remoteParticipantId: String?

    // MARK: - Initialization

    override private init() {
        super.init()

        #if canImport(WebRTC) && !targetEnvironment(simulator)
        // Initialize WebRTC for real devices
        RTCInitializeSSL()

        let encoderFactory = RTCDefaultVideoEncoderFactory()
        let decoderFactory = RTCDefaultVideoDecoderFactory()

        peerConnectionFactory = RTCPeerConnectionFactory(
            encoderFactory: encoderFactory,
            decoderFactory: decoderFactory
        )
        #else
        // Stub initialization for simulator
        RTCInitializeSSL()

        let encoderFactory = RTCDefaultVideoEncoderFactory()
        let decoderFactory = RTCDefaultVideoDecoderFactory()

        peerConnectionFactory = RTCPeerConnectionFactory(
            encoderFactory: encoderFactory,
            decoderFactory: decoderFactory
        )
        #endif

        callLogger.info("WebRTCManager initialized")
    }

    deinit {
        #if canImport(WebRTC) && !targetEnvironment(simulator)
        RTCCleanupSSL()
        #else
        RTCCleanupSSL()
        #endif
    }

    // MARK: - Configuration

    /// Configure ICE servers from CallSignalingService
    func configure(with iceServers: [ICEServerConfig]) {
        var stunServers: [String] = []
        var turnServers: [WebRTCConfiguration.TurnServer] = []

        for server in iceServers {
            if server.urls.hasPrefix("stun:") {
                stunServers.append(server.urls)
            } else if server.urls.hasPrefix("turn:") {
                if let username = server.username, let credential = server.credential {
                    turnServers.append(WebRTCConfiguration.TurnServer(
                        url: server.urls,
                        username: username,
                        credential: credential
                    ))
                }
            }
        }

        configuration = WebRTCConfiguration(
            stunServers: stunServers.isEmpty ? WebRTCConfiguration.default.stunServers : stunServers,
            turnServers: turnServers,
            codecPreferences: configuration.codecPreferences,
            mediaConstraints: configuration.mediaConstraints
        )

        callLogger.info("Configured with \(stunServers.count) STUN servers and \(turnServers.count) TURN servers")
    }

    /// Set the remote participant ID for signaling
    func setRemoteParticipantId(_ participantId: String) {
        remoteParticipantId = participantId
        callLogger.debug("Set remote participant ID: \(participantId)")
    }

    // MARK: - Peer Connection Setup

    func setupPeerConnection() {
        guard peerConnection == nil else {
            callLogger.warn("Peer connection already exists")
            return
        }

        let config = createRTCConfiguration()
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
        )

        guard let factory = peerConnectionFactory,
              let pc = factory.peerConnection(
                with: config,
                constraints: constraints,
                delegate: nil
              ) else {
            callLogger.error("Failed to create peer connection")
            return
        }

        peerConnection = pc

        #if canImport(WebRTC) && !targetEnvironment(simulator)
        // Set delegate for real WebRTC
        pc.delegate = self
        #else
        // Set delegate for stubs
        pc.delegate = self
        #endif

        createMediaTracks()
        configureAudioSession()

        callLogger.info("Peer connection created successfully")
    }

    private func createRTCConfiguration() -> RTCConfiguration {
        let config = RTCConfiguration()

        // ICE servers
        var iceServers: [RTCIceServer] = []

        // STUN servers
        for stunUrl in configuration.stunServers {
            iceServers.append(RTCIceServer(urlStrings: [stunUrl]))
        }

        // TURN servers
        for turnServer in configuration.turnServers {
            iceServers.append(RTCIceServer(
                urlStrings: [turnServer.url],
                username: turnServer.username,
                credential: turnServer.credential
            ))
        }

        config.iceServers = iceServers
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually
        config.bundlePolicy = .maxBundle
        config.rtcpMuxPolicy = .require
        config.tcpCandidatePolicy = .disabled

        // Generate certificate
        config.certificate = RTCCertificate.generate(withParams: [
            "expires": NSNumber(value: 100000),
            "name": "RSASSA-PKCS1-v1_5"
        ])

        return config
    }

    // MARK: - Media Tracks

    private func createMediaTracks() {
        createAudioTrack()

        #if !targetEnvironment(simulator)
        // Only create video track on real devices
        createVideoTrack()
        #else
        callLogger.info("Skipping video track creation on simulator")
        #endif
    }

    private func createAudioTrack() {
        guard let factory = peerConnectionFactory else { return }

        let audioConstraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "googEchoCancellation": "true",
                "googAutoGainControl": "true",
                "googNoiseSuppression": "true",
                "googHighpassFilter": "true"
            ],
            optionalConstraints: nil
        )

        let audioSource = factory.audioSource(with: audioConstraints)
        let audioTrack = factory.audioTrack(with: audioSource, trackId: "audio0")
        audioTrack.isEnabled = !isMuted

        localAudioTrack = audioTrack

        // Add to peer connection
        if let pc = peerConnection {
            pc.add(audioTrack, streamIds: ["stream0"])
        }

        callLogger.info("Audio track created")
    }

    private func createVideoTrack() {
        guard let factory = peerConnectionFactory else { return }
        guard configuration.mediaConstraints.videoEnabled else { return }

        let videoSource = factory.videoSource()

        let videoTrack = factory.videoTrack(with: videoSource, trackId: "video0")
        videoTrack.isEnabled = isVideoEnabled

        localVideoTrack = videoTrack
        self.videoSource = videoSource

        #if canImport(WebRTC) && !targetEnvironment(simulator)
        // Setup camera capturer for real devices
        let capturer = RTCCameraVideoCapturer(delegate: videoSource)
        videoCapturer = capturer
        #endif

        // Add to peer connection
        if let pc = peerConnection {
            pc.add(videoTrack, streamIds: ["stream0"])
        }

        #if !targetEnvironment(simulator)
        startCaptureLocalVideo()
        #endif

        callLogger.info("Video track created")
    }

    private func startCaptureLocalVideo() {
        #if canImport(WebRTC) && !targetEnvironment(simulator)
        guard let capturer = videoCapturer else {
            callLogger.error("No video capturer available")
            return
        }

        // Check camera permission
        let authStatus = AVCaptureDevice.authorizationStatus(for: .video)
        switch authStatus {
        case .notDetermined:
            callLogger.info("Camera permission not determined, requesting...")
            Task {
                let granted = await AVCaptureDevice.requestAccess(for: .video)
                if granted {
                    await MainActor.run {
                        self.startCaptureLocalVideoInternal()
                    }
                } else {
                    callLogger.error("Camera permission denied by user")
                }
            }
            return

        case .denied, .restricted:
            callLogger.error("Camera permission denied or restricted")
            return

        case .authorized:
            // Continue with capture
            break

        @unknown default:
            callLogger.warning("Unknown camera authorization status")
            break
        }

        startCaptureLocalVideoInternal()
        #endif
    }

    private func startCaptureLocalVideoInternal() {
        #if canImport(WebRTC) && !targetEnvironment(simulator)
        guard let capturer = videoCapturer else { return }

        let devices = RTCCameraVideoCapturer.captureDevices()

        guard let camera = devices.first(where: {
            $0.position == (isFrontCamera ? .front : .back)
        }) else {
            callLogger.error("No camera found")
            return
        }

        let formats = RTCCameraVideoCapturer.supportedFormats(for: camera)

        // Find best format
        let targetWidth = configuration.mediaConstraints.videoWidth
        let targetHeight = configuration.mediaConstraints.videoHeight
        let targetFps = configuration.mediaConstraints.videoFps

        let format = formats.first { format in
            let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            return dimensions.width == targetWidth && dimensions.height == targetHeight
        } ?? formats.first

        guard let selectedFormat = format else {
            callLogger.error("No suitable video format found")
            return
        }

        let fps = selectedFormat.videoSupportedFrameRateRanges.first?.maxFrameRate ?? Double(targetFps)

        capturer.startCapture(
            with: camera,
            format: selectedFormat,
            fps: Int(min(fps, Double(targetFps)))
        )

        callLogger.info("Started video capture: \(targetWidth)x\(targetHeight) @ \(targetFps)fps")
        #endif
    }

    // MARK: - Offer/Answer

    func createOffer(completion: @escaping (Result<RTCSessionDescription, Error>) -> Void) {
        guard let pc = peerConnection else {
            completion(.failure(WebRTCError.noPeerConnection))
            return
        }

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveAudio": "true",
                "OfferToReceiveVideo": configuration.mediaConstraints.videoEnabled ? "true" : "false"
            ],
            optionalConstraints: nil
        )

        pc.offer(for: constraints) { [weak self] sdp, error in
            guard let self = self else { return }

            if let error = error {
                callLogger.error("Error creating offer: \(error.localizedDescription)")
                Task { @MainActor in
                    completion(.failure(error))
                }
                return
            }

            guard let sdp = sdp else {
                Task { @MainActor in
                    completion(.failure(WebRTCError.invalidSDP))
                }
                return
            }

            // Set local description
            pc.setLocalDescription(sdp) { error in
                Task { @MainActor in
                    if let error = error {
                        callLogger.error("Error setting local description: \(error.localizedDescription)")
                        completion(.failure(error))
                    } else {
                        callLogger.info("Offer created successfully")
                        completion(.success(sdp))
                    }
                }
            }
        }
    }

    func createAnswer(completion: @escaping (Result<RTCSessionDescription, Error>) -> Void) {
        guard let pc = peerConnection else {
            completion(.failure(WebRTCError.noPeerConnection))
            return
        }

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveAudio": "true",
                "OfferToReceiveVideo": configuration.mediaConstraints.videoEnabled ? "true" : "false"
            ],
            optionalConstraints: nil
        )

        pc.answer(for: constraints) { [weak self] sdp, error in
            guard let self = self else { return }

            if let error = error {
                callLogger.error("Error creating answer: \(error.localizedDescription)")
                Task { @MainActor in
                    completion(.failure(error))
                }
                return
            }

            guard let sdp = sdp else {
                Task { @MainActor in
                    completion(.failure(WebRTCError.invalidSDP))
                }
                return
            }

            // Set local description
            pc.setLocalDescription(sdp) { error in
                Task { @MainActor in
                    if let error = error {
                        callLogger.error("Error setting local description: \(error.localizedDescription)")
                        completion(.failure(error))
                    } else {
                        callLogger.info("Answer created successfully")
                        completion(.success(sdp))
                    }
                }
            }
        }
    }

    func setRemoteDescription(_ sdp: RTCSessionDescription, completion: @escaping (Error?) -> Void) {
        guard let pc = peerConnection else {
            completion(WebRTCError.noPeerConnection)
            return
        }

        pc.setRemoteDescription(sdp) { [weak self] error in
            Task { @MainActor in
                if let error = error {
                    callLogger.error("Error setting remote description: \(error.localizedDescription)")
                    completion(error)
                } else {
                    callLogger.info("Remote description set successfully")
                    self?.hasRemoteDescription = true

                    // Add pending ICE candidates
                    self?.addPendingIceCandidates()

                    completion(nil)
                }
            }
        }
    }

    // MARK: - ICE Candidates

    func addIceCandidate(_ candidate: RTCIceCandidate) {
        guard let pc = peerConnection else {
            callLogger.error("Cannot add ICE candidate - no peer connection")
            return
        }

        if hasRemoteDescription {
            pc.add(candidate) { error in
                if let error = error {
                    callLogger.error("Error adding ICE candidate: \(error.localizedDescription)")
                } else {
                    callLogger.debug("ICE candidate added successfully")
                }
            }
        } else {
            // Buffer candidates until remote description is set
            pendingIceCandidates.append(candidate)
            callLogger.debug("Buffered ICE candidate (waiting for remote description)")
        }
    }

    private func addPendingIceCandidates() {
        guard let pc = peerConnection, hasRemoteDescription else { return }

        callLogger.info("Adding \(pendingIceCandidates.count) pending ICE candidates")

        for candidate in pendingIceCandidates {
            pc.add(candidate) { error in
                if let error = error {
                    callLogger.error("Error adding pending ICE candidate: \(error.localizedDescription)")
                }
            }
        }

        pendingIceCandidates.removeAll()
    }

    // MARK: - Call Controls

    func toggleMute() {
        isMuted.toggle()
    }

    func toggleVideo() {
        isVideoEnabled.toggle()
    }

    func switchCamera() {
        isFrontCamera.toggle()

        #if canImport(WebRTC) && !targetEnvironment(simulator)
        guard let capturer = videoCapturer else { return }

        let devices = RTCCameraVideoCapturer.captureDevices()
        guard let newCamera = devices.first(where: {
            $0.position == (isFrontCamera ? .front : .back)
        }) else { return }

        let formats = RTCCameraVideoCapturer.supportedFormats(for: newCamera)
        guard let format = formats.first else { return }

        let fps = format.videoSupportedFrameRateRanges.first?.maxFrameRate ?? 30

        capturer.startCapture(with: newCamera, format: format, fps: Int(fps))
        #endif

        callLogger.info("Switched to \(isFrontCamera ? "front" : "back") camera")
    }

    private func updateAudioTrackState() {
        localAudioTrack?.isEnabled = !isMuted
        callLogger.info("Audio \(isMuted ? "muted" : "unmuted")")
    }

    private func updateVideoTrackState() {
        // Safety: Only update if track exists
        if let videoTrack = localVideoTrack {
            videoTrack.isEnabled = isVideoEnabled
        } else if isVideoEnabled {
            // Video track doesn't exist but video is being enabled
            // Try to create it now
            #if !targetEnvironment(simulator)
            createVideoTrack()
            #endif
        }

        #if canImport(WebRTC) && !targetEnvironment(simulator)
        if isVideoEnabled {
            // Only start capture if capturer exists
            if videoCapturer != nil {
                startCaptureLocalVideo()
            } else {
                callLogger.warn("Video capturer not initialized, cannot start capture")
            }
        } else {
            // Safely stop capture
            videoCapturer?.stopCapture()
        }
        #endif

        callLogger.info("Video \(isVideoEnabled ? "enabled" : "disabled")")
    }

    // MARK: - Audio Session

    private func configureAudioSession() {
        audioQueue.async {
            let audioSession = AVAudioSession.sharedInstance()
            do {
                try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [
                    .allowBluetooth,
                    .allowBluetoothA2DP,
                    .defaultToSpeaker
                ])
                try audioSession.setActive(true)

                callLogger.info("Audio session configured")
            } catch {
                callLogger.error("Failed to configure audio session: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Stats Collection

    func startStatsCollection() {
        stopStatsCollection()

        statsTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.collectStats()
            }
        }
    }

    func stopStatsCollection() {
        statsTimer?.invalidate()
        statsTimer = nil
    }

    private func collectStats() {
        guard let pc = peerConnection else { return }

        pc.statistics { [weak self] report in
            guard let self = self else { return }

            Task { @MainActor in
                var newStats = WebRTCStats()

                for (_, stats) in report.statistics {
                    if stats.type == "inbound-rtp" {
                        if let bytesReceived = stats.values["bytesReceived"] as? NSNumber {
                            newStats.bytesReceived = bytesReceived.int64Value
                        }
                        if let packetsReceived = stats.values["packetsReceived"] as? NSNumber {
                            newStats.packetsReceived = packetsReceived.int64Value
                        }
                        if let packetsLost = stats.values["packetsLost"] as? NSNumber {
                            newStats.packetsLost = packetsLost.int64Value
                        }
                        if let jitter = stats.values["jitter"] as? NSNumber {
                            newStats.jitter = jitter.doubleValue
                        }
                    } else if stats.type == "outbound-rtp" {
                        if let bytesSent = stats.values["bytesSent"] as? NSNumber {
                            newStats.bytesSent = bytesSent.int64Value
                        }
                        if let packetsSent = stats.values["packetsSent"] as? NSNumber {
                            newStats.packetsSent = packetsSent.int64Value
                        }
                    } else if stats.type == "candidate-pair" {
                        if let rtt = stats.values["currentRoundTripTime"] as? NSNumber {
                            newStats.currentRoundTripTime = rtt.doubleValue * 1000 // Convert to ms
                        }
                        if let bitrate = stats.values["availableOutgoingBitrate"] as? NSNumber {
                            newStats.availableOutgoingBitrate = bitrate.doubleValue
                        }
                    }
                }

                self.stats = newStats
                self.delegate?.webRTCManager(self, didUpdateStats: newStats)
            }
        }
    }

    // MARK: - Video Renderers

    func getLocalVideoTrack() -> RTCVideoTrack? {
        return localVideoTrack
    }

    func getRemoteVideoTrack() -> RTCVideoTrack? {
        return remoteVideoTrack
    }

    // MARK: - Cleanup

    func disconnect() {
        callLogger.info("Disconnecting WebRTC")

        stopStatsCollection()

        #if canImport(WebRTC) && !targetEnvironment(simulator)
        // Stop video capture
        videoCapturer?.stopCapture()
        #endif

        // Remove tracks
        if let audioTrack = localAudioTrack {
            if let sender = peerConnection?.senders.first(where: { $0.track?.trackId == audioTrack.trackId }) {
                _ = peerConnection?.removeTrack(sender)
            }
        }

        if let videoTrack = localVideoTrack {
            if let sender = peerConnection?.senders.first(where: { $0.track?.trackId == videoTrack.trackId }) {
                _ = peerConnection?.removeTrack(sender)
            }
        }

        // Close peer connection
        peerConnection?.close()
        peerConnection = nil

        // Clear tracks
        localAudioTrack = nil
        localVideoTrack = nil
        remoteAudioTrack = nil
        remoteVideoTrack = nil
        videoCapturer = nil
        videoSource = nil

        // Clear state
        isConnected = false
        hasRemoteDescription = false
        pendingIceCandidates.removeAll()
        remoteParticipantId = nil

        // Deactivate audio session
        audioQueue.async {
            let audioSession = AVAudioSession.sharedInstance()
            do {
                try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                callLogger.error("Failed to deactivate audio session: \(error.localizedDescription)")
            }
        }

        callLogger.info("WebRTC disconnected")
    }
}

// MARK: - RTCPeerConnectionDelegate

extension WebRTCManager: RTCPeerConnectionDelegate {

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {
        Task { @MainActor in
            callLogger.debug("Signaling state changed: \(stateChanged.description)")
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        nonisolated(unsafe) let videoTracksCount = stream.videoTracks.count
        nonisolated(unsafe) let audioTracksCount = stream.audioTracks.count
        nonisolated(unsafe) let videoTrack = stream.videoTracks.first
        nonisolated(unsafe) let audioTrack = stream.audioTracks.first

        Task { @MainActor in
            callLogger.info("Remote stream added with \(videoTracksCount) video tracks and \(audioTracksCount) audio tracks")

            if let videoTrack = videoTrack {
                self.remoteVideoTrack = videoTrack
                self.delegate?.webRTCManager(self, didReceiveRemoteVideoTrack: videoTrack)
            }

            if let audioTrack = audioTrack {
                self.remoteAudioTrack = audioTrack
                self.delegate?.webRTCManager(self, didReceiveRemoteAudioTrack: audioTrack)
            }
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {
        Task { @MainActor in
            callLogger.info("Remote stream removed")
            self.remoteVideoTrack = nil
            self.remoteAudioTrack = nil
        }
    }

    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {
        Task { @MainActor in
            callLogger.debug("Peer connection should negotiate")
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        Task { @MainActor in
            callLogger.info("ICE connection state changed: \(newState.description)")

            self.connectionState = newState

            switch newState {
            case .connected, .completed:
                self.isConnected = true
                self.startStatsCollection()
            case .disconnected, .failed, .closed:
                self.isConnected = false
                self.stopStatsCollection()
            default:
                break
            }

            self.delegate?.webRTCManager(self, didChangeConnectionState: newState)
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        Task { @MainActor in
            callLogger.debug("ICE gathering state changed: \(newState.description)")
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        nonisolated(unsafe) let candidateSdp = candidate.sdp
        nonisolated(unsafe) let localCandidate = candidate
        Task { @MainActor in
            callLogger.debug("ICE candidate generated: \(candidateSdp)")
            self.delegate?.webRTCManager(self, didGenerateLocalCandidate: localCandidate)
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {
        let candidatesCount = candidates.count
        Task { @MainActor in
            callLogger.debug("ICE candidates removed: \(candidatesCount)")
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        let dataChannelLabel = dataChannel.label
        Task { @MainActor in
            callLogger.info("Data channel opened: \(dataChannelLabel)")
        }
    }
}

// MARK: - Extensions

extension RTCSignalingState {
    var description: String {
        switch self {
        case .stable: return "stable"
        case .haveLocalOffer: return "have-local-offer"
        case .haveLocalPrAnswer: return "have-local-pranswer"
        case .haveRemoteOffer: return "have-remote-offer"
        case .haveRemotePrAnswer: return "have-remote-pranswer"
        case .closed: return "closed"
        @unknown default: return "unknown"
        }
    }
}

extension RTCIceConnectionState {
    var description: String {
        switch self {
        case .new: return "new"
        case .checking: return "checking"
        case .connected: return "connected"
        case .completed: return "completed"
        case .failed: return "failed"
        case .disconnected: return "disconnected"
        case .closed: return "closed"
        case .count: return "count"
        @unknown default: return "unknown"
        }
    }
}

extension RTCIceGatheringState {
    var description: String {
        switch self {
        case .new: return "new"
        case .gathering: return "gathering"
        case .complete: return "complete"
        @unknown default: return "unknown"
        }
    }
}

// MARK: - WebRTC Error

enum WebRTCError: LocalizedError {
    case noPeerConnection
    case invalidSDP
    case connectionFailed
    case mediaAccessDenied

    var errorDescription: String? {
        switch self {
        case .noPeerConnection:
            return "Peer connection not initialized"
        case .invalidSDP:
            return "Invalid SDP"
        case .connectionFailed:
            return "Connection failed"
        case .mediaAccessDenied:
            return "Media access denied"
        }
    }
}
