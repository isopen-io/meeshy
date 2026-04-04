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

struct CallStats: Sendable {
    let roundTripTimeMs: Double
    let packetsLost: Int
    let bandwidth: Int
    let codec: String?
}

// MARK: - WebRTC Client Protocol

protocol WebRTCClientProviding: AnyObject {
    var delegate: (any WebRTCClientDelegate)? { get set }
    var isConnected: Bool { get }
    var localVideoTrack: Any? { get }
    var remoteVideoTrack: Any? { get }

    func configure(iceServers: [IceServer]) throws
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

    static let statsIntervalSeconds: TimeInterval = 3.0
    static let heartbeatIntervalSeconds: TimeInterval = 15.0
    static let maxReconnectAttempts: Int = 3

    static let initialVideoBitrate: Int = 500_000
    static let minVideoBitrate: Int = 100_000
    static let maxVideoBitrate: Int = 2_500_000
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

    var errorDescription: String? {
        switch self {
        case .noPeerConnection: "No peer connection available"
        case .failedToCreatePeerConnection: "Failed to create peer connection"
        case .failedToCreateSDP: "Failed to create SDP"
        case .noCameraAvailable: "No camera available"
        case .noCameraFormatAvailable: "No suitable camera format"
        case .notSupported: "WebRTC not available on this device"
        }
    }
}
