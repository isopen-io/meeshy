import Foundation
import AVFoundation
import os

// MARK: - WebRTC Stub Types
// These types stub the WebRTC framework API so the signaling and UI layers compile
// without requiring the WebRTC binary. When the WebRTC SPM dependency is added,
// replace these stubs with `import WebRTC` and remove this section.

final class RTCSessionDescription: @unchecked Sendable {
    enum SdpType: String { case offer, answer, prAnswer = "pranswer" }
    let type: SdpType
    let sdp: String
    init(type: SdpType, sdp: String) { self.type = type; self.sdp = sdp }

    func toDictionary() -> [String: Any] {
        ["type": type.rawValue, "sdp": sdp]
    }

    static func from(dictionary: [String: Any]) -> RTCSessionDescription? {
        guard let typeStr = dictionary["type"] as? String,
              let type = SdpType(rawValue: typeStr),
              let sdp = dictionary["sdp"] as? String else { return nil }
        return RTCSessionDescription(type: type, sdp: sdp)
    }
}

final class RTCIceCandidate: @unchecked Sendable {
    let sdp: String
    let sdpMLineIndex: Int32
    let sdpMid: String?
    init(sdp: String, sdpMLineIndex: Int32, sdpMid: String?) {
        self.sdp = sdp; self.sdpMLineIndex = sdpMLineIndex; self.sdpMid = sdpMid
    }

    func toDictionary() -> [String: Any] {
        var dict: [String: Any] = ["candidate": sdp, "sdpMLineIndex": sdpMLineIndex]
        if let mid = sdpMid { dict["sdpMid"] = mid }
        return dict
    }

    static func from(dictionary: [String: Any]) -> RTCIceCandidate? {
        guard let sdp = dictionary["candidate"] as? String,
              let index = dictionary["sdpMLineIndex"] as? Int32 else { return nil }
        let mid = dictionary["sdpMid"] as? String
        return RTCIceCandidate(sdp: sdp, sdpMLineIndex: index, sdpMid: mid)
    }
}

enum RTCIceConnectionState { case new, checking, connected, completed, failed, disconnected, closed }
enum RTCSignalingState { case stable, haveLocalOffer, haveRemoteOffer, haveLocalPranswer, haveRemotePranswer, closed }

// MARK: - WebRTC Service Delegate

protocol WebRTCServiceDelegate: AnyObject {
    func webRTCService(_ service: WebRTCService, didGenerateCandidate candidate: RTCIceCandidate)
    func webRTCService(_ service: WebRTCService, didChangeIceState state: RTCIceConnectionState)
    func webRTCServiceDidAddRemoteTrack(_ service: WebRTCService)
    func webRTCServiceDidDisconnect(_ service: WebRTCService)
}

// MARK: - WebRTC Service

final class WebRTCService {
    weak var delegate: WebRTCServiceDelegate?

    private(set) var localDescription: RTCSessionDescription?
    private(set) var remoteDescription: RTCSessionDescription?
    private(set) var iceConnectionState: RTCIceConnectionState = .new
    private var iceCandidatesBuffer: [RTCIceCandidate] = []
    private var isVideoEnabled: Bool = false

    // STUN/TURN servers
    private let iceServers: [[String: Any]] = [
        ["urls": ["stun:stun.l.google.com:19302"]],
        ["urls": ["stun:stun1.l.google.com:19302"]],
        ["urls": ["stun:stun2.l.google.com:19302"]]
    ]

    init() {
        Logger.webrtc.info("WebRTCService initialized (stub mode)")
    }

    deinit {
        Logger.webrtc.info("WebRTCService deinit")
    }

    // MARK: - Peer Connection Lifecycle

    func configure(isVideo: Bool) {
        isVideoEnabled = isVideo
        Logger.webrtc.info("WebRTC configured — video: \(isVideo)")
    }

    func createOffer() async -> RTCSessionDescription? {
        // Stub: generate a placeholder SDP
        let sdp = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
        let offer = RTCSessionDescription(type: .offer, sdp: sdp)
        localDescription = offer
        Logger.webrtc.info("Created SDP offer (stub)")
        return offer
    }

    func createAnswer(from offer: RTCSessionDescription) async -> RTCSessionDescription? {
        remoteDescription = offer
        let sdp = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
        let answer = RTCSessionDescription(type: .answer, sdp: sdp)
        localDescription = answer
        Logger.webrtc.info("Created SDP answer (stub)")
        return answer
    }

    func setRemoteDescription(_ description: RTCSessionDescription) async {
        remoteDescription = description
        Logger.webrtc.info("Set remote description: \(description.type.rawValue)")
        // Flush buffered ICE candidates
        for candidate in iceCandidatesBuffer {
            addICECandidate(candidate)
        }
        iceCandidatesBuffer.removeAll()
    }

    func addICECandidate(_ candidate: RTCIceCandidate) {
        if remoteDescription == nil {
            iceCandidatesBuffer.append(candidate)
            Logger.webrtc.debug("Buffered ICE candidate (no remote description yet)")
            return
        }
        Logger.webrtc.debug("Added ICE candidate: \(candidate.sdp.prefix(40))...")
    }

    // MARK: - Media Controls

    func muteAudio(_ muted: Bool) {
        Logger.webrtc.info("Audio muted: \(muted)")
    }

    func enableVideo(_ enabled: Bool) {
        Logger.webrtc.info("Video enabled: \(enabled)")
    }

    func switchCamera() {
        Logger.webrtc.info("Camera switched")
    }

    // MARK: - Audio Session

    func configureAudioSession(speaker: Bool) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: speaker ? [.defaultToSpeaker] : [])
            try session.setActive(true)
            Logger.webrtc.info("Audio session configured — speaker: \(speaker)")
        } catch {
            Logger.webrtc.error("Audio session configuration failed: \(error.localizedDescription)")
        }
    }

    func deactivateAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            Logger.webrtc.info("Audio session deactivated")
        } catch {
            Logger.webrtc.error("Audio session deactivation failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Cleanup

    func close() {
        localDescription = nil
        remoteDescription = nil
        iceCandidatesBuffer.removeAll()
        iceConnectionState = .closed
        deactivateAudioSession()
        Logger.webrtc.info("WebRTC connection closed")
    }
}

// MARK: - Logger Extension

private extension Logger {
    static let webrtc = Logger(subsystem: "com.meeshy.app", category: "webrtc")
}
