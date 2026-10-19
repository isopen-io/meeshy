import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - WebRTC Client Protocol

protocol WebRTCClientProviding: AnyObject {
    var delegate: (any WebRTCClientDelegate)? { get set }
    var localVideoTrack: Any? { get }
    var remoteVideoTrack: Any? { get }

    func configure(iceServers: [IceServer]) throws
    func updateIceServers(_ iceServers: [IceServer])
    /// §3.4 perfect negotiation — sets the deterministic polite/impolite role.
    /// Computed symmetrically by both peers (lexicographically-smaller userId is
    /// polite) and fixed once for the call's lifetime, independent of caller/
    /// callee, so it survives renegotiations. The client stores it and uses it
    /// in the glare-collision guard.
    func setNegotiationRole(isPolite: Bool)
    func createOffer() async throws -> SessionDescription
    /// P0-4 — schedule an ICE restart on the next `createOffer()`. Must be
    /// called before `createOffer()` to set the `IceRestart: true` constraint
    /// so the SDP carries new ICE credentials and the peer reconnects.
    func restartIce()
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription
    func setRemoteAnswer(_ answer: SessionDescription) async throws
    func addIceCandidate(_ candidate: IceCandidate) async throws
    func startLocalMedia(type: CallMediaType) async throws
    func toggleAudio(_ enabled: Bool)
    func toggleVideo(_ enabled: Bool)
    /// Applies adaptive video sender caps (max bitrate / framerate / resolution
    /// downscale) and the encoder's degradation trade-off. No-op on audio-only
    /// calls (no video transceiver). Driven by the quality ladder in
    /// `WebRTCService.adjustBitrate`; the survival FREEZE floor is the only
    /// caller passing `.maintainResolution`. Never renegotiates — it only
    /// rewrites `RTCRtpSender.parameters`.
    func applyVideoEncoding(
        maxBitrateBps: Int,
        maxFramerate: Int,
        scaleResolutionDownBy: Double,
        degradationPreference: VideoDegradationPreference
    )
    /// Applies an adaptive audio sender cap (max bitrate). Called by
    /// `WebRTCService.adjustBitrate` when the quality ladder changes tier so
    /// the encoder sheds bandwidth on a degraded link rather than competing
    /// with video for the available budget. Min bitrate is always preserved
    /// at the value set by `applyAudioCodecPreferences` (16 kbps floor).
    func applyAudioEncoding(maxBitrateBps: Int)
    /// Whether a local camera track currently exists (audio-only calls have
    /// none until upgraded). Drives the self-preview / camera-toggle UI.
    var hasLocalVideoTrack: Bool { get }
    /// §5.4 mid-call audio→video upgrade: lazily build the camera track, attach
    /// it to the reserved video transceiver and flip to sendRecv. Returns true
    /// when a renegotiation (createOffer) is required.
    func enableLocalVideo() async throws -> Bool
    /// §5.4 mid-call video→audio downgrade: stop the camera, detach the track,
    /// flip the transceiver to recvonly. Returns true when renegotiation needed.
    func disableLocalVideo() async -> Bool
    func switchCamera() async throws
    /// §7.1 — available capture cameras (front/back/Continuity/external). Empty
    /// on the no-WebRTC stub. Drives the Mac/iPad camera picker.
    func availableCameras() -> [CameraDeviceOption]
    /// §7.1 — switch the active capture device by `uniqueID` (Continuity / USB
    /// camera selection). Reuses the same stop/start path as `switchCamera`.
    func switchToCamera(uniqueID: String) async throws
    func getStats() async -> CallStats?
    func createDataChannel(label: String) -> Bool
    func sendDataChannelMessage(_ data: Data)
    /// RFC 4733 DTMF: forward digits to the audio transceiver's RTCDTMFSender.
    /// Called from `CXPlayDTMFCallAction` when the user presses digits in the
    /// CallKit keypad (e.g. conference PIN, IVR navigation). No-op when the
    /// audio transceiver's DTMF sender is unavailable or the connection is not
    /// established. Valid characters: 0-9, A-D, *, #, comma (2 s pause).
    func sendDTMF(digits: String)
    func disconnect()
    /// Same teardown as `disconnect()`, but first gives a just-enqueued
    /// DataChannel send (e.g. the local hangup `bye`, see `sendHangupBye()`)
    /// a bounded grace period to actually reach the wire before the
    /// transport is destroyed. `RTCDataChannel.sendData` only enqueues onto
    /// libwebrtc's SCTP thread — closing the peer connection immediately
    /// after can silently drop an unflushed send. No-op difference from
    /// `disconnect()` when nothing is buffered.
    func disconnectAfterFlushingPendingSend()

    var videoFilterPipeline: VideoFilterPipeline { get }
}
