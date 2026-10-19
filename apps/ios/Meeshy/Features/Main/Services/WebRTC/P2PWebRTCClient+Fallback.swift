import AVFoundation
import Foundation
import os

#if canImport(WebRTC)
#else

// MARK: - Fallback (WebRTC framework not available)

final class P2PWebRTCClient: WebRTCClientProviding {
    weak var delegate: (any WebRTCClientDelegate)?
    var localVideoTrack: Any? { nil }
    var remoteVideoTrack: Any? { nil }

    func configure(iceServers: [IceServer]) throws {
        Logger.webrtc.warning("WebRTC framework not available - calls are disabled")
        throw WebRTCError.notSupported
    }

    func updateIceServers(_ iceServers: [IceServer]) {}
    func setNegotiationRole(isPolite: Bool) {}
    func restartIce() {}

    func createOffer() async throws -> SessionDescription { throw WebRTCError.notSupported }
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription { throw WebRTCError.notSupported }
    func setRemoteAnswer(_ answer: SessionDescription) async throws { throw WebRTCError.notSupported }
    func addIceCandidate(_ candidate: IceCandidate) async throws { throw WebRTCError.notSupported }
    func startLocalMedia(type: CallMediaType) async throws { throw WebRTCError.notSupported }
    func toggleAudio(_ enabled: Bool) {}
    func toggleVideo(_ enabled: Bool) {}
    func applyVideoEncoding(maxBitrateBps: Int, maxFramerate: Int, scaleResolutionDownBy: Double, degradationPreference: VideoDegradationPreference) {}
    func applyAudioEncoding(maxBitrateBps: Int) {}
    var hasLocalVideoTrack: Bool { false }
    func enableLocalVideo() async throws -> Bool { throw WebRTCError.notSupported }
    func disableLocalVideo() async -> Bool { false }
    func switchCamera() async throws {}
    func availableCameras() -> [CameraDeviceOption] { [] }
    func switchToCamera(uniqueID: String) async throws {}
    func getStats() async -> CallStats? { nil }
    func createDataChannel(label: String) -> Bool { false }
    func sendDataChannelMessage(_ data: Data) {}
    func sendDTMF(digits: String) {}
    func disconnect() {}
    func disconnectAfterFlushingPendingSend() {}

    let videoFilterPipeline = VideoFilterPipeline()
}

#endif
