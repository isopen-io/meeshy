import Foundation
import AVFoundation
import os

// MARK: - WebRTC Service Delegate

protocol WebRTCServiceDelegate: AnyObject {
    func webRTCService(_ service: WebRTCService, didGenerateCandidate candidate: IceCandidate)
    func webRTCService(_ service: WebRTCService, didChangeConnectionState state: PeerConnectionState)
    func webRTCServiceDidConnect(_ service: WebRTCService)
    func webRTCServiceDidDisconnect(_ service: WebRTCService)
    func webRTCService(_ service: WebRTCService, didChangeQualityLevel level: VideoQualityLevel, from previous: VideoQualityLevel)
    func webRTCService(_ service: WebRTCService, didReceiveRemoteVideoTrack track: Any)
    func webRTCService(_ service: WebRTCService, didReceiveTranscriptionData data: Data)
}

// MARK: - WebRTC Service

final class WebRTCService: @unchecked Sendable {
    weak var delegate: WebRTCServiceDelegate?

    let videoFilterPipeline = VideoFilterPipeline()
    var videoFilters: VideoFilterPipeline { videoFilterPipeline }

    var audioEffectsService: CallAudioEffectsServiceProviding? { client.audioEffectsService }
    var localVideoTrack: Any? { client.localVideoTrack }
    var remoteVideoTrack: Any? { client.remoteVideoTrack }

    private let client: any WebRTCClientProviding
    private var iceCandidateBuffer: [IceCandidate] = []
    private var hasRemoteDescription = false
    private(set) var connectionState: PeerConnectionState = .new

    private(set) var currentBitrate: Int = QualityThresholds.defaultBitrate
    private(set) var currentQualityLevel: VideoQualityLevel = .excellent
    private var qualityMonitorTimer: Timer?
    private var lastStats: CallStats?
    private var comfortNoiseEnabled = true
    private var qualityLevelDebounceDate: Date?

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

    // MARK: - Comfort Noise

    func handleRemoteAudioMuted(_ muted: Bool) {
        guard comfortNoiseEnabled else { return }
        Logger.webrtc.info("Remote audio \(muted ? "muted" : "unmuted") — CNG active via Opus")
    }

    // MARK: - Quality Monitoring

    func startQualityMonitor() {
        stopQualityMonitor()
        qualityMonitorTimer = Timer.scheduledTimer(
            withTimeInterval: QualityThresholds.statsIntervalSeconds,
            repeats: true
        ) { [weak self] _ in
            guard self != nil else { return }
            Task { @MainActor [weak self] in
                guard let self else { return }
                guard let stats = await self.client.getStats() else { return }
                self.lastStats = stats
                self.adjustBitrate(basedOn: stats)
            }
        }
        Logger.webrtc.info("Quality monitor started (interval: \(QualityThresholds.statsIntervalSeconds)s)")
    }

    func stopQualityMonitor() {
        qualityMonitorTimer?.invalidate()
        qualityMonitorTimer = nil
    }

    private func adjustBitrate(basedOn stats: CallStats) {
        let rtt = stats.roundTripTimeMs
        let loss = Double(stats.packetsLost)

        let newLevel = VideoQualityLevel.from(rtt: rtt, packetLoss: loss)

        let newBitrate: Int
        if rtt <= QualityThresholds.excellentRTT && loss <= QualityThresholds.excellentPacketLoss {
            newBitrate = QualityThresholds.maxBitrate
        } else if rtt <= QualityThresholds.goodRTT && loss <= QualityThresholds.goodPacketLoss {
            newBitrate = QualityThresholds.defaultBitrate
        } else {
            newBitrate = QualityThresholds.minBitrate
        }

        if newBitrate != currentBitrate {
            currentBitrate = newBitrate
            Logger.webrtc.info("Audio bitrate adjusted to \(newBitrate) bps (RTT: \(rtt)ms, loss: \(loss))")
        }

        guard newLevel != currentQualityLevel else { return }

        let now = Date()
        if let debounce = qualityLevelDebounceDate, now.timeIntervalSince(debounce) < 5.0 {
            return
        }
        qualityLevelDebounceDate = now

        let previousLevel = currentQualityLevel
        currentQualityLevel = newLevel
        Logger.webrtc.info("Quality level changed: \(previousLevel.rawValue) → \(newLevel.rawValue)")
        delegate?.webRTCService(self, didChangeQualityLevel: newLevel, from: previousLevel)

        if newLevel == .critical {
            client.toggleVideo(false)
            Logger.webrtc.warning("Critical quality — auto-disabled video")
        } else if previousLevel == .critical && newLevel >= .poor {
            Logger.webrtc.info("Quality recovered from critical — video can be re-enabled manually")
        }
    }

    // MARK: - DataChannel Transcription (H7)

    func createTranscriptionChannel() -> Bool {
        client.createDataChannel(label: "transcription")
    }

    func sendTranscription(_ message: DataChannelTranscriptionMessage) {
        guard let data = try? JSONEncoder().encode(message) else { return }
        client.sendDataChannelMessage(data)
    }

    // MARK: - Audio Effects

    func setAudioEffect(_ effect: AudioEffectConfig?) {
        do {
            try client.setAudioEffect(effect)
            Logger.webrtc.info("Audio effect set via service: \(effect?.effectType.rawValue ?? "none")")
        } catch {
            Logger.webrtc.error("Failed to set audio effect: \(error.localizedDescription)")
        }
    }

    func updateAudioEffectParams(_ config: AudioEffectConfig) {
        do {
            try client.updateAudioEffectParams(config)
        } catch {
            Logger.webrtc.error("Failed to update audio effect params: \(error.localizedDescription)")
        }
    }

    // MARK: - ICE Restart

    func performICERestart() async -> SessionDescription? {
        Logger.webrtc.info("Performing ICE restart")
        hasRemoteDescription = false
        iceCandidateBuffer.removeAll()
        return await createOffer()
    }

    // MARK: - Cleanup

    func close() {
        stopQualityMonitor()
        client.disconnect()
        iceCandidateBuffer.removeAll()
        hasRemoteDescription = false
        connectionState = .closed
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
        delegate?.webRTCService(self, didReceiveRemoteVideoTrack: track)
    }

    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveRemoteAudioTrack track: Any) {
        Logger.webrtc.info("Remote audio track received")
    }

    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveDataChannelMessage data: Data) {
        delegate?.webRTCService(self, didReceiveTranscriptionData: data)
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let webrtc = Logger(subsystem: "me.meeshy.app", category: "webrtc")
}
