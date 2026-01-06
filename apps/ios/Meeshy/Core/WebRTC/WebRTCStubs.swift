//
//  WebRTCStubs.swift
//  Meeshy
//
//  Stub implementations for WebRTC types when running on iOS Simulator
//  The GoogleWebRTC framework does not support iOS Simulator
//
//  These stubs allow the app to compile and run on simulator without crashing,
//  while real WebRTC functionality is only available on physical devices.
//
//  When GoogleWebRTC pod is installed, this file is ignored via conditional compilation.
//
//  Minimum iOS 16+
//

import Foundation
import AVFoundation
import UIKit

// MARK: - Conditional Compilation
// Only compile stubs when WebRTC framework is not available

#if !canImport(WebRTC)

// MARK: - Video Frame

class RTCVideoFrame {
    let width: Int32
    let height: Int32
    let rotation: Int
    let timeStamp: Int64

    init(width: Int32, height: Int32, rotation: Int, timeStamp: Int64) {
        self.width = width
        self.height = height
        self.rotation = rotation
        self.timeStamp = timeStamp
    }
}

// MARK: - Video Source

class RTCVideoSource: RTCVideoCapturerDelegate {
    func capturer(_ capturer: RTCVideoCapturer, didCapture frame: RTCVideoFrame) {
        // Stub implementation
    }
}

// MARK: - Video Track

@MainActor
class RTCVideoTrack: RTCMediaStreamTrack {
    init() {
        super.init(trackId: UUID().uuidString, kind: "video")
    }

    func add(_ renderer: RTCVideoRenderer) {}
    func remove(_ renderer: RTCVideoRenderer) {}
}

// MARK: - Camera Video Capturer

class RTCCameraVideoCapturer {
    weak var delegate: RTCVideoCapturerDelegate?

    init(delegate: RTCVideoCapturerDelegate? = nil) {
        self.delegate = delegate
    }

    static func captureDevices() -> [AVCaptureDevice] {
        // On simulator, return empty array
        return []
    }

    static func supportedFormats(for device: AVCaptureDevice) -> [AVCaptureDevice.Format] {
        return device.formats
    }

    func startCapture(with device: AVCaptureDevice, format: AVCaptureDevice.Format, fps: Int, completionHandler: ((Error?) -> Void)? = nil) {
        completionHandler?(nil)
    }

    func startCapture(with device: AVCaptureDevice, format: AVCaptureDevice.Format, fps: Int) {
        // Stub - no camera on simulator
    }

    func stopCapture(completionHandler: (() -> Void)? = nil) {
        completionHandler?()
    }

    func stopCapture() {
        // Stub
    }
}

// MARK: - Video Renderer Protocol

@MainActor
protocol RTCVideoRenderer: AnyObject {
    func setSize(_ size: CGSize)
    func renderFrame(_ frame: RTCVideoFrame?)
}

// MARK: - Video View Delegate

@MainActor
protocol RTCVideoViewDelegate: AnyObject {
    func videoView(_ videoView: RTCVideoRenderer, didChangeVideoSize size: CGSize)
}

// MARK: - MTL Video View

class RTCMTLVideoView: UIView, RTCVideoRenderer {
    var videoContentMode: UIView.ContentMode = .scaleAspectFill
    weak var delegate: RTCVideoViewDelegate?

    func setSize(_ size: CGSize) {
        delegate?.videoView(self, didChangeVideoSize: size)
    }

    func renderFrame(_ frame: RTCVideoFrame?) {
        // Stub implementation
    }
}

// MARK: - Peer Connection Factory

class RTCPeerConnectionFactory {
    init() {}

    init(encoderFactory: RTCDefaultVideoEncoderFactory, decoderFactory: RTCDefaultVideoDecoderFactory) {}

    func videoSource() -> RTCVideoSource {
        return RTCVideoSource()
    }

    @MainActor
    func videoTrack(with source: RTCVideoSource, trackId: String) -> RTCVideoTrack {
        return RTCVideoTrack()
    }

    func audioSource(with constraints: RTCMediaConstraints?) -> RTCAudioSource {
        return RTCAudioSource()
    }

    func audioSource(with constraints: RTCMediaConstraints) -> RTCAudioSource {
        return RTCAudioSource()
    }

    func audioTrack(with source: RTCAudioSource, trackId: String) -> RTCAudioTrack {
        return RTCAudioTrack()
    }

    func peerConnection(with configuration: RTCConfiguration, constraints: RTCMediaConstraints, delegate: RTCPeerConnectionDelegate?) -> RTCPeerConnection? {
        return RTCPeerConnection(configuration: configuration, constraints: constraints, delegate: delegate)
    }
}

// MARK: - Audio Source

class RTCAudioSource {
    init() {}
}

// MARK: - Session Description

class RTCSessionDescription {
    enum SdpType: String {
        case offer
        case prAnswer
        case answer
        case rollback
    }

    let type: SdpType
    let sdp: String

    init(type: SdpType, sdp: String) {
        self.type = type
        self.sdp = sdp
    }

    // Static helper method to convert SdpType to string
    static func string(for type: SdpType) -> String {
        return type.rawValue
    }
}

// MARK: - ICE Candidate

class RTCIceCandidate {
    let sdp: String
    let sdpMLineIndex: Int32
    let sdpMid: String?

    init(sdp: String, sdpMLineIndex: Int32, sdpMid: String?) {
        self.sdp = sdp
        self.sdpMLineIndex = sdpMLineIndex
        self.sdpMid = sdpMid
    }
}

// MARK: - Video Capturer

class RTCVideoCapturer {
    weak var delegate: RTCVideoCapturerDelegate?
}

protocol RTCVideoCapturerDelegate: AnyObject {
    func capturer(_ capturer: RTCVideoCapturer, didCapture frame: RTCVideoFrame)
}

// MARK: - Pixel Buffer

class RTCCVPixelBuffer {
    init(pixelBuffer: CVPixelBuffer) {}
}

// MARK: - Video Rotation

enum RTCVideoRotation: Int {
    case rotation0 = 0
    case rotation90 = 90
    case rotation180 = 180
    case rotation270 = 270
}

// MARK: - ICE Connection State

enum RTCIceConnectionState: Int {
    case new
    case checking
    case connected
    case completed
    case failed
    case disconnected
    case closed
    case count
}

// MARK: - Audio Track

class RTCAudioTrack: RTCMediaStreamTrack {
    init() {
        super.init(trackId: UUID().uuidString, kind: "audio")
    }
}

// MARK: - Peer Connection Configuration

class RTCConfiguration {
    var iceServers: [RTCIceServer] = []
    var iceTransportPolicy: RTCIceTransportPolicy = .all
    var bundlePolicy: RTCBundlePolicy = .balanced
    var rtcpMuxPolicy: RTCRtcpMuxPolicy = .require
    var tcpCandidatePolicy: RTCTcpCandidatePolicy = .enabled
    var candidateNetworkPolicy: RTCCandidateNetworkPolicy = .all
    var continualGatheringPolicy: RTCContinualGatheringPolicy = .gatherOnce
    var sdpSemantics: RTCSdpSemantics = .unifiedPlan
    var certificate: RTCCertificate?

    init() {}
}

// MARK: - SDP Semantics

enum RTCSdpSemantics: Int {
    case unifiedPlan
    case planB
}

// MARK: - Certificate

class RTCCertificate {
    static func generate(withParams params: [String: Any]) -> RTCCertificate? {
        return RTCCertificate()
    }
}

// MARK: - ICE Server

struct RTCIceServer {
    let urlStrings: [String]
    let username: String?
    let credential: String?

    init(urlStrings: [String], username: String? = nil, credential: String? = nil) {
        self.urlStrings = urlStrings
        self.username = username
        self.credential = credential
    }
}

// MARK: - Transport Policies

enum RTCIceTransportPolicy: Int {
    case none
    case relay
    case all
}

enum RTCBundlePolicy: Int {
    case balanced
    case maxCompat
    case maxBundle
}

enum RTCRtcpMuxPolicy: Int {
    case negotiate
    case require
}

enum RTCTcpCandidatePolicy: Int {
    case enabled
    case disabled
}

enum RTCCandidateNetworkPolicy: Int {
    case all
    case lowCost
}

enum RTCContinualGatheringPolicy: Int {
    case gatherOnce
    case gatherContinually
}

// MARK: - Peer Connection Delegate

@MainActor
protocol RTCPeerConnectionDelegate: AnyObject {
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState)
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream)
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream)
    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection)
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState)
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState)
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate)
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate])
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel)
}

// MARK: - Signaling State

enum RTCSignalingState: Int {
    case stable
    case haveLocalOffer
    case haveLocalPrAnswer
    case haveRemoteOffer
    case haveRemotePrAnswer
    case closed
}

// MARK: - ICE Gathering State

enum RTCIceGatheringState: Int {
    case new
    case gathering
    case complete
}

// MARK: - Media Stream

class RTCMediaStream {
    let streamId: String
    var audioTracks: [RTCAudioTrack] = []
    var videoTracks: [RTCVideoTrack] = []

    init(streamId: String = UUID().uuidString) {
        self.streamId = streamId
    }

    func addAudioTrack(_ track: RTCAudioTrack) {
        audioTracks.append(track)
    }

    func addVideoTrack(_ track: RTCVideoTrack) {
        videoTracks.append(track)
    }
}

// MARK: - Data Channel

class RTCDataChannel {
    var label: String
    var channelId: Int32

    init(label: String = "", channelId: Int32 = 0) {
        self.label = label
        self.channelId = channelId
    }
}

// MARK: - Peer Connection

class RTCPeerConnection {
    weak var delegate: RTCPeerConnectionDelegate?
    var localDescription: RTCSessionDescription?
    var remoteDescription: RTCSessionDescription?
    var connectionState: RTCIceConnectionState = .new
    var signalingState: RTCSignalingState = .stable
    private(set) var senders: [RTCRtpSender] = []

    init(configuration: RTCConfiguration, constraints: RTCMediaConstraints, delegate: RTCPeerConnectionDelegate?) {
        self.delegate = delegate
    }

    init() {}

    func offer(for constraints: RTCMediaConstraints, completionHandler: @escaping (RTCSessionDescription?, Error?) -> Void) {
        let offer = RTCSessionDescription(type: .offer, sdp: "stub-offer-sdp")
        completionHandler(offer, nil)
    }

    func answer(for constraints: RTCMediaConstraints, completionHandler: @escaping (RTCSessionDescription?, Error?) -> Void) {
        let answer = RTCSessionDescription(type: .answer, sdp: "stub-answer-sdp")
        completionHandler(answer, nil)
    }

    func setLocalDescription(_ sdp: RTCSessionDescription, completionHandler: @escaping (Error?) -> Void) {
        localDescription = sdp
        completionHandler(nil)
    }

    func setRemoteDescription(_ sdp: RTCSessionDescription, completionHandler: @escaping (Error?) -> Void) {
        remoteDescription = sdp
        completionHandler(nil)
    }

    func add(_ candidate: RTCIceCandidate, completionHandler: ((Error?) -> Void)? = nil) {
        completionHandler?(nil)
    }

    func add(_ stream: RTCMediaStream) {}

    func remove(_ stream: RTCMediaStream) {}

    func add(_ track: RTCMediaStreamTrack, streamIds: [String]) -> RTCRtpSender {
        let sender = RTCRtpSender()
        sender.track = track
        senders.append(sender)
        return sender
    }

    func removeTrack(_ sender: RTCRtpSender) -> Bool {
        if let index = senders.firstIndex(where: { $0 === sender }) {
            senders.remove(at: index)
            return true
        }
        return false
    }

    func close() {
        connectionState = .closed
        signalingState = .closed
    }

    func statistics(completionHandler: @escaping (RTCStatisticsReport) -> Void) {
        let report = RTCStatisticsReport()
        completionHandler(report)
    }
}

// MARK: - Media Constraints

class RTCMediaConstraints {
    let mandatoryConstraints: [String: String]?
    let optionalConstraints: [String: String]?

    init(mandatoryConstraints: [String: String]?, optionalConstraints: [String: String]?) {
        self.mandatoryConstraints = mandatoryConstraints
        self.optionalConstraints = optionalConstraints
    }
}

// MARK: - Statistics Report

class RTCStatisticsReport {
    var statistics: [String: RTCStatistics] = [:]
}

// MARK: - Statistics

class RTCStatistics {
    var type: String = ""
    var values: [String: Any] = [:]
}

// MARK: - RTP Sender/Receiver

class RTCRtpSender {
    var track: RTCMediaStreamTrack?
    var parameters: RTCRtpParameters = RTCRtpParameters()
}

class RTCRtpReceiver {
    var track: RTCMediaStreamTrack?
}

class RTCRtpParameters {
    var encodings: [RTCRtpEncodingParameters] = []
}

class RTCRtpEncodingParameters {
    var maxBitrateBps: NSNumber?
    var minBitrateBps: NSNumber?
}

// MARK: - Media Stream Track

class RTCMediaStreamTrack {
    var trackId: String
    var kind: String
    var isEnabled: Bool = true

    init(trackId: String, kind: String) {
        self.trackId = trackId
        self.kind = kind
    }
}

// MARK: - Encoder/Decoder Factories

class RTCDefaultVideoEncoderFactory {
    init() {}
}

class RTCDefaultVideoDecoderFactory {
    init() {}
}

// MARK: - SSL Initialization

func RTCInitializeSSL() {
    // Stub - no actual SSL initialization needed on simulator
}

func RTCCleanupSSL() {
    // Stub - no actual SSL cleanup needed on simulator
}

#endif
