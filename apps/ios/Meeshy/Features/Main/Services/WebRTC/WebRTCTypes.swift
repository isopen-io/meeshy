import CoreGraphics
import Foundation
import MeeshySDK

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

nonisolated struct IceServer: Sendable, Equatable {
    let urls: [String]
    let username: String?
    let credential: String?

    var hasTURNURL: Bool {
        urls.contains { $0.hasPrefix("turn:") || $0.hasPrefix("turns:") }
    }

    static let defaultServers: [IceServer] = [
        IceServer(urls: ["stun:stun.l.google.com:19302"], username: nil, credential: nil),
        IceServer(urls: ["stun:stun1.l.google.com:19302"], username: nil, credential: nil),
        IceServer(urls: ["stun:stun2.l.google.com:19302"], username: nil, credential: nil),
        IceServer(urls: ["stun:stun6.l.google.com:19302"], username: nil, credential: nil),
        // Cloudflare STUN — second provider for resilience against Google STUN outages
        IceServer(urls: ["stun:stun.cloudflare.com:3478"], username: nil, credential: nil)
    ]
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
