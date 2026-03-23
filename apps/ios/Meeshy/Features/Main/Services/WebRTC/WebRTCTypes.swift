import Foundation

// MARK: - Agnostic Types (no WebRTC framework dependency)

enum SDPType: String, Codable, Sendable {
    case offer
    case answer
    case prAnswer = "pranswer"
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
    func disconnect()
}

// MARK: - WebRTC Client Delegate

protocol WebRTCClientDelegate: AnyObject {
    func webRTCClient(_ client: any WebRTCClientProviding, didGenerateCandidate candidate: IceCandidate)
    func webRTCClient(_ client: any WebRTCClientProviding, didChangeConnectionState state: PeerConnectionState)
    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveRemoteVideoTrack track: Any)
    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveRemoteAudioTrack track: Any)
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
