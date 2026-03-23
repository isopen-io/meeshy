import Foundation
import AVFoundation
import os

// MARK: - WebRTC Service Delegate

protocol WebRTCServiceDelegate: AnyObject {
    func webRTCService(_ service: WebRTCService, didGenerateCandidate candidate: IceCandidate)
    func webRTCService(_ service: WebRTCService, didChangeConnectionState state: PeerConnectionState)
    func webRTCServiceDidConnect(_ service: WebRTCService)
    func webRTCServiceDidDisconnect(_ service: WebRTCService)
}

// MARK: - WebRTC Service

final class WebRTCService: @unchecked Sendable {
    weak var delegate: WebRTCServiceDelegate?

    private let client: any WebRTCClientProviding
    private var iceCandidateBuffer: [IceCandidate] = []
    private var hasRemoteDescription = false
    private(set) var connectionState: PeerConnectionState = .new

    init(client: (any WebRTCClientProviding)? = nil) {
        self.client = client ?? P2PWebRTCClient()
        self.client.delegate = self
        Logger.webrtc.info("WebRTCService initialized")
    }

    deinit {
        Logger.webrtc.info("WebRTCService deinit")
    }

    // MARK: - Peer Connection Lifecycle

    func configure(isVideo: Bool) {
        do {
            try client.configure(iceServers: IceServer.defaultServers)
            Logger.webrtc.info("WebRTC configured - video: \(isVideo)")
        } catch {
            Logger.webrtc.error("WebRTC configuration failed: \(error.localizedDescription)")
        }
    }

    func createOffer() async -> SessionDescription? {
        do {
            let offer = try await client.createOffer()
            Logger.webrtc.info("Created SDP offer")
            return offer
        } catch {
            Logger.webrtc.error("Failed to create offer: \(error.localizedDescription)")
            return nil
        }
    }

    func createAnswer(from offer: SessionDescription) async -> SessionDescription? {
        do {
            hasRemoteDescription = true
            let answer = try await client.createAnswer(for: offer)
            flushBufferedCandidates()
            Logger.webrtc.info("Created SDP answer")
            return answer
        } catch {
            Logger.webrtc.error("Failed to create answer: \(error.localizedDescription)")
            return nil
        }
    }

    func setRemoteDescription(_ description: SessionDescription) async {
        do {
            try await client.setRemoteAnswer(description)
            hasRemoteDescription = true
            flushBufferedCandidates()
            Logger.webrtc.info("Set remote description: \(description.type.rawValue)")
        } catch {
            Logger.webrtc.error("Failed to set remote description: \(error.localizedDescription)")
        }
    }

    func addICECandidate(_ candidate: IceCandidate) {
        guard hasRemoteDescription else {
            iceCandidateBuffer.append(candidate)
            Logger.webrtc.debug("Buffered ICE candidate (no remote description yet)")
            return
        }
        Task {
            do {
                try await client.addIceCandidate(candidate)
            } catch {
                Logger.webrtc.error("Failed to add ICE candidate: \(error.localizedDescription)")
            }
        }
    }

    func startLocalMedia(isVideo: Bool) async {
        do {
            try await client.startLocalMedia(type: isVideo ? .audioVideo : .audioOnly)
            Logger.webrtc.info("Local media started - video: \(isVideo)")
        } catch {
            Logger.webrtc.error("Failed to start local media: \(error.localizedDescription)")
        }
    }

    // MARK: - Media Controls

    func muteAudio(_ muted: Bool) {
        client.toggleAudio(!muted)
    }

    func enableVideo(_ enabled: Bool) {
        client.toggleVideo(enabled)
    }

    func switchCamera() {
        Task {
            do {
                try await client.switchCamera()
            } catch {
                Logger.webrtc.error("Failed to switch camera: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Audio Session

    func configureAudioSession(speaker: Bool) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: speaker ? [.defaultToSpeaker] : [])
            try session.setActive(true)
            Logger.webrtc.info("Audio session configured - speaker: \(speaker)")
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
        client.disconnect()
        iceCandidateBuffer.removeAll()
        hasRemoteDescription = false
        connectionState = .closed
        deactivateAudioSession()
        Logger.webrtc.info("WebRTC connection closed")
    }

    // MARK: - Private

    private func flushBufferedCandidates() {
        guard hasRemoteDescription else { return }
        let buffered = iceCandidateBuffer
        iceCandidateBuffer.removeAll()
        Logger.webrtc.info("Flushing \(buffered.count) buffered ICE candidates")
        Task {
            for candidate in buffered {
                do {
                    try await client.addIceCandidate(candidate)
                } catch {
                    Logger.webrtc.error("Failed to add buffered ICE candidate: \(error.localizedDescription)")
                }
            }
        }
    }
}

// MARK: - WebRTCClientDelegate

extension WebRTCService: WebRTCClientDelegate {
    func webRTCClient(_ client: any WebRTCClientProviding, didGenerateCandidate candidate: IceCandidate) {
        delegate?.webRTCService(self, didGenerateCandidate: candidate)
    }

    func webRTCClient(_ client: any WebRTCClientProviding, didChangeConnectionState state: PeerConnectionState) {
        connectionState = state
        delegate?.webRTCService(self, didChangeConnectionState: state)

        switch state {
        case .connected:
            delegate?.webRTCServiceDidConnect(self)
        case .disconnected, .failed, .closed:
            delegate?.webRTCServiceDidDisconnect(self)
        default:
            break
        }
    }

    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveRemoteVideoTrack track: Any) {
        Logger.webrtc.info("Remote video track received")
    }

    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveRemoteAudioTrack track: Any) {
        Logger.webrtc.info("Remote audio track received")
    }
}

// MARK: - Logger Extension

private extension Logger {
    static let webrtc = Logger(subsystem: "me.meeshy.app", category: "webrtc")
}
