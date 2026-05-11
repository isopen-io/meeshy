import Foundation

// MARK: - Agnostic Types (no WebRTC framework dependency)

enum SDPType: String, Codable, Sendable {
    case offer
    case answer
    case prAnswer = "pranswer"
    case iceRestart = "ice-restart"
}

struct SessionDescription: Codable, Sendable {
    let type: SDPType
    let sdp: String
}

struct IceCandidate: Codable, Sendable {
    let sdpMid: String?
    let sdpMLineIndex: Int32
    let candidate: String
}

struct IceServer {
    let urls: [String]
    let username: String?
    let credential: String?

    static let defaultServers: [IceServer] = [
        IceServer(urls: ["stun:stun.l.google.com:19302"], username: nil, credential: nil),
        IceServer(urls: ["stun:stun1.l.google.com:19302"], username: nil, credential: nil),
        IceServer(urls: ["stun:stun2.l.google.com:19302"], username: nil, credential: nil)
    ]
}

struct MediaTracks {
    let audioEnabled: Bool
    let videoEnabled: Bool
}

enum CallMediaType: Sendable {
    case audioOnly
    case audioVideo
}

// MARK: - Peer Connection State

enum PeerConnectionState: String, Sendable {
    case new
    case connecting
    case connected
    case disconnected
    case failed
    case closed
}

// MARK: - Call Stats

struct CallStats: Equatable, Sendable {
    let roundTripTimeMs: Double
    let packetsLost: Int
    let bandwidth: Int
    let codec: String?
    let inboundPacketsReceived: Int   // Phase 1 fix E6 — RTP gate

    init(
        roundTripTimeMs: Double = 0,
        packetsLost: Int = 0,
        bandwidth: Int = 0,
        codec: String? = nil,
        inboundPacketsReceived: Int = 0
    ) {
        self.roundTripTimeMs = roundTripTimeMs
        self.packetsLost = packetsLost
        self.bandwidth = bandwidth
        self.codec = codec
        self.inboundPacketsReceived = inboundPacketsReceived
    }
}

// MARK: - WebRTC Client Protocol

protocol WebRTCClientProviding: AnyObject {
    var delegate: (any WebRTCClientDelegate)? { get set }
    var isConnected: Bool { get }
    var localVideoTrack: Any? { get }
    var remoteVideoTrack: Any? { get }

    func configure(iceServers: [IceServer]) throws
    func updateIceServers(_ iceServers: [IceServer])
    func createOffer() async throws -> SessionDescription
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription
    func setRemoteAnswer(_ answer: SessionDescription) async throws
    func addIceCandidate(_ candidate: IceCandidate) async throws
    func startLocalMedia(type: CallMediaType) async throws
    func toggleAudio(_ enabled: Bool)
    func toggleVideo(_ enabled: Bool)
    func switchCamera() async throws
    func getStats() async -> CallStats?
    func createDataChannel(label: String) -> Bool
    func sendDataChannelMessage(_ data: Data)
    func disconnect()

    var audioEffectsService: CallAudioEffectsServiceProviding? { get }
    func setAudioEffect(_ effect: AudioEffectConfig?) throws
    func updateAudioEffectParams(_ config: AudioEffectConfig) throws
}

// MARK: - DataChannel Transcription Message

struct DataChannelTranscriptionMessage: Codable, Sendable {
    let type: String  // "transcription-segment"
    let text: String
    let speakerId: String
    let startTime: Double
    let isFinal: Bool
    let language: String
    let translatedText: String?
    let translatedLanguage: String?
}

// MARK: - WebRTC Client Delegate

protocol WebRTCClientDelegate: AnyObject {
    func webRTCClient(_ client: any WebRTCClientProviding, didGenerateCandidate candidate: IceCandidate)
    func webRTCClient(_ client: any WebRTCClientProviding, didChangeConnectionState state: PeerConnectionState)
    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveRemoteVideoTrack track: Any)
    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveRemoteAudioTrack track: Any)
    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveDataChannelMessage data: Data)
}

// MARK: - Call End Reason

enum CallEndReason: Equatable {
    case local
    case remote
    case rejected
    case missed
    case failed(String)
    case connectionLost
}

// MARK: - Call Display Mode

enum CallDisplayMode: Sendable {
    case fullScreen
    case pip
}

// MARK: - Quality Thresholds

enum QualityThresholds {
    static let excellentRTT: Double = 100
    static let goodRTT: Double = 250
    static let poorRTT: Double = 500

    static let excellentPacketLoss: Double = 0.01
    static let goodPacketLoss: Double = 0.05
    static let poorPacketLoss: Double = 0.10

    static let maxBitrate: Int = 128_000
    static let minBitrate: Int = 24_000
    static let defaultBitrate: Int = 64_000

    // Audit P2-iOS-12 — bumped from 3s to 5s. RTCPeerConnection.statistics
    // walks the entire stats graph (~5–10ms CPU per call); 5s is the
    // industry baseline (WhatsApp/Jitsi use 2–5s during reconnection only).
    static let statsIntervalSeconds: TimeInterval = 5.0
    /// Phase 1 fix P1: cellular networks have RTT 800ms+ ; 5s heartbeat with
    /// 15s lost was too aggressive (false-positive reconnects). SOTA matches
    /// WhatsApp/Telegram with 10s/30s. Reference §5.12.
    static let heartbeatIntervalSeconds: TimeInterval = 10.0

    /// 3 missed beats (~30s) marks heartbeat as lost. After this, FSM
    /// transitions active → reconnecting.
    static let heartbeatLostThresholdSeconds: TimeInterval = 30.0

    /// Phase 1 fix P10: cellular ACK round-trip can take 3-4s in poor signal.
    /// 5s timeout absorbs worst-case without false positives.
    static let heartbeatAckTimeoutSeconds: TimeInterval = 5.0
    static let maxReconnectAttempts: Int = 3

    static let initialVideoBitrate: Int = 500_000
    static let minVideoBitrate: Int = 100_000
    static let maxVideoBitrate: Int = 2_500_000

    /// Phase 1 fix E6 — RTP gate before transitioning to .connected.
    /// ICE connected does NOT mean media flows: NAT, codec mismatch, audio
    /// session not flipped, or routing bug can leave us with iceState=.connected
    /// but zero RTP packets. We poll stats every 2s up to 5 times (10s budget),
    /// require ≥5 inbound RTP packets (≈100ms of audio at 50pps Opus) before
    /// declaring "connected". Beyond 10s with no RTP → ended(.failed).
    /// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.3
    static let rtpGatePollIntervalSeconds: TimeInterval = 2.0
    static let rtpGateMaxAttempts: Int = 5
    static let rtpGateRequiredPackets: Int = 5

    /// Caller-side ringing timeout. The gateway has its own 60s server-side
    /// timeout (CallEventsHandler.ts §scheduleRingingTimeout) but a snappier
    /// 45s client-side cutoff gives the user a faster fail path when:
    ///   - the recipient is unreachable yet the gateway delays the no_answer
    ///   - the network drops the call:ended event before we receive it
    ///   - the server timeout misfires
    /// Picked at 45s to align with WhatsApp/FaceTime UX while leaving 15s
    /// headroom under the gateway's hard cap.
    static let outgoingRingTimeoutSeconds: TimeInterval = 45.0
}

// MARK: - Video Quality Level (§4.8)

enum VideoQualityLevel: String, Comparable, Sendable {
    case excellent
    case good
    case fair
    case poor
    case critical

    private var rank: Int {
        switch self {
        case .excellent: 4
        case .good: 3
        case .fair: 2
        case .poor: 1
        case .critical: 0
        }
    }

    static func < (lhs: VideoQualityLevel, rhs: VideoQualityLevel) -> Bool {
        lhs.rank < rhs.rank
    }

    var targetResolutionHeight: Int {
        switch self {
        case .excellent: 720
        case .good: 720
        case .fair: 480
        case .poor: 360
        case .critical: 0
        }
    }

    var targetFPS: Int {
        switch self {
        case .excellent: 30
        case .good: 24
        case .fair: 20
        case .poor: 15
        case .critical: 0
        }
    }

    var targetVideoBitrate: Int {
        switch self {
        case .excellent: 2_500_000
        case .good: 1_500_000
        case .fair: 800_000
        case .poor: 400_000
        case .critical: 0
        }
    }

    static func from(rtt: Double, packetLoss: Double) -> VideoQualityLevel {
        if rtt > 500 || packetLoss > 0.10 { return .critical }
        if rtt > 300 || packetLoss > 0.05 { return .poor }
        if rtt > 200 || packetLoss > 0.03 { return .fair }
        if rtt > 100 || packetLoss > 0.01 { return .good }
        return .excellent
    }
}

// MARK: - Errors

enum WebRTCError: Error, LocalizedError {
    case noPeerConnection
    case failedToCreatePeerConnection
    case failedToCreateSDP
    case noCameraAvailable
    case noCameraFormatAvailable
    case notSupported
    case simulatorVideoUnsupported

    var errorDescription: String? {
        switch self {
        case .noPeerConnection: "No peer connection available"
        case .failedToCreatePeerConnection: "Failed to create peer connection"
        case .failedToCreateSDP: "Failed to create SDP"
        case .noCameraAvailable: "No camera available"
        case .noCameraFormatAvailable: "No suitable camera format"
        case .notSupported: "WebRTC not available on this device"
        case .simulatorVideoUnsupported:
            "Video unsupported on iOS Simulator (FigCaptureSourceRemote XPC failure). " +
            "Use a real device for video calls."
        }
    }
}
