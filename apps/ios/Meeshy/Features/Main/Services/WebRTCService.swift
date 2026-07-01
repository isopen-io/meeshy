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
    /// Periodic stats tick (every `statsIntervalSeconds`) carrying cumulative
    /// data usage, the current quality level, and the interval packet-loss
    /// percentage (0–100) — reported to the gateway so the call-summary message
    /// can surface "data spent · network quality" and drive loss alerts.
    func webRTCService(_ service: WebRTCService, didCollectStats stats: CallStats, level: VideoQualityLevel, packetLossPercent: Double)
}

extension WebRTCServiceDelegate {
    // Optional by default — only CallManager needs the stats tick.
    func webRTCService(_ service: WebRTCService, didCollectStats stats: CallStats, level: VideoQualityLevel, packetLossPercent: Double) {}
}

// MARK: - WebRTC Service

// Audit P1-3 — marked `@MainActor` so all mutable state (`connectionState`,
// `iceCandidateBuffer`, `hasRemoteDescription`, `currentBitrate`,
// `currentQualityLevel`, `lastStats`, `qualityMonitorTask`, etc.) is
// accessed from a single isolation domain. Was `@unchecked Sendable` with
// no lock — TSAN-detectable data race because `webRTCClient(_:didChangeConnectionState:)`
// mutated `connectionState` from `DispatchQueue.main.async` while other
// callers read it from arbitrary actors. The delegate extension below is
// `nonisolated` and hops via `Task { @MainActor in }` so callers from
// P2PWebRTCClient (which dispatches to main queue but not to the MainActor
// isolation domain) keep working unchanged.
@MainActor
final class WebRTCService {
    weak var delegate: WebRTCServiceDelegate?

    var videoFilters: VideoFilterPipeline { client.videoFilterPipeline }

    var audioEffectsService: CallAudioEffectsServiceProviding? { client.audioEffectsService }
    var localVideoTrack: Any? { client.localVideoTrack }
    var remoteVideoTrack: Any? { client.remoteVideoTrack }

    private let client: any WebRTCClientProviding
    private var iceCandidateBuffer: [IceCandidate] = []
    private var hasRemoteDescription = false
    private(set) var connectionState: PeerConnectionState = .new
    // Tracks the in-flight flush task so it can be cancelled when the
    // connection is closed — prevents post-teardown addIceCandidate calls
    // against a disposed RTCPeerConnection (which throw and log spurious errors).
    private var flushCandidatesTask: Task<Void, Never>?
    // Tracks a single live addIceCandidate task (when remote description is
    // already set). Cancelled in close() so it cannot outlive teardown and
    // attempt addIceCandidate on a disposed peer connection.
    private var pendingCandidateTask: Task<Void, Never>?

    private(set) var currentBitrate: Int = QualityThresholds.defaultBitrate
    private(set) var currentQualityLevel: VideoQualityLevel = .excellent
    // Audit P1-4 — replace Timer.scheduledTimer with cancellable Task to
    // align with PERF-011 (heartbeat / duration migrated; this monitor was
    // missed). Timers run on RunLoop.main, are App-Nap-unfriendly, and have
    // no structured cancellation hand-off.
    private var qualityMonitorTask: Task<Void, Never>?
    private var lastStats: CallStats?
    private var comfortNoiseEnabled = true
    private var qualityLevelDebounceDate: Date?
    // §5.6 — last device thermal state applied to the encoder. A change here
    // re-applies the video encoding ceiling even when the network quality
    // level is steady (see adjustBitrate / VideoThermalProfile).
    private var lastThermalState: ProcessInfo.ThermalState = .nominal
    // §3.2 — debounce window for transient `.disconnected` blips. Cancelled
    // the moment the connection recovers (`.connected`) or decisively fails
    // (`.failed`/`.closed`, which fire `webRTCServiceDidDisconnect` at once).
    private var disconnectDebounceTask: Task<Void, Never>?

    init(client: (any WebRTCClientProviding)? = nil) {
        self.client = client ?? P2PWebRTCClient()
        self.client.delegate = self
        Logger.webrtc.info("WebRTCService initialized")
    }

    deinit {
        // Belt-and-suspenders: cancel all in-flight tasks so they stop
        // referencing self as soon as the object is deallocated, rather than
        // waiting for the next [weak self] guard to fire. Task.cancel() is
        // nonisolated and safe to call from any context.
        qualityMonitorTask?.cancel()
        disconnectDebounceTask?.cancel()
        flushCandidatesTask?.cancel()
        pendingCandidateTask?.cancel()
        Logger.webrtc.info("WebRTCService deinit")
    }

    // MARK: - Peer Connection Lifecycle

    func configure(isVideo: Bool, iceServers: [IceServer]? = nil) {
        do {
            let servers = iceServers ?? IceServer.defaultServers
            try client.configure(iceServers: servers)
            Logger.webrtc.info("WebRTC configured - video: \(isVideo), ICE servers: \(servers.count)")
        } catch {
            Logger.webrtc.error("WebRTC configuration failed: \(error.localizedDescription)")
        }
    }

    func updateIceServers(_ iceServers: [IceServer]) {
        client.updateIceServers(iceServers)
    }

    /// §3.4 — forward the deterministic polite/impolite role to the client.
    func setNegotiationRole(isPolite: Bool) {
        client.setNegotiationRole(isPolite: isPolite)
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
            let answer = try await client.createAnswer(for: offer)
            hasRemoteDescription = true
            flushBufferedCandidates()
            Logger.webrtc.info("Created SDP answer")
            return answer
        } catch {
            // Do NOT set `hasRemoteDescription` before this can throw (e.g. the
            // perfect-negotiation glare guard raising `.offerIgnored` for a
            // collided offer): leaving it `true` on a failed answer would make
            // `addICECandidate` forward candidates straight to the ICE agent
            // for a remote description that was never actually applied,
            // instead of buffering them for the retried negotiation.
            Logger.webrtc.error("Failed to create answer: \(error.localizedDescription)")
            return nil
        }
    }

    /// Apply the remote answer/description. Returns `true` on success, `false` on
    /// failure. Callers that are part of the call-setup path should end the call on
    /// `false` — a peer connection without a remote description will never produce
    /// media even if ICE connects, so continuing silently leads to a silent call.
    @discardableResult
    func setRemoteDescription(_ description: SessionDescription) async -> Bool {
        do {
            try await client.setRemoteAnswer(description)
            hasRemoteDescription = true
            flushBufferedCandidates()
            Logger.webrtc.info("Set remote description: \(description.type.rawValue)")
            return true
        } catch {
            Logger.webrtc.error("Failed to set remote description: \(error.localizedDescription)")
            return false
        }
    }

    func addICECandidate(_ candidate: IceCandidate) {
        guard hasRemoteDescription else {
            // Cap the buffer to prevent unbounded growth in environments with many
            // network interfaces (WiFi + cellular + VPN + Bluetooth + TURN relays
            // each produce host/srflx/relay candidates). Beyond ~200 candidates
            // the ICE agent has already selected a pair; additional ones add no
            // connection value and only bloat memory.
            //
            // FIFO eviction: when the buffer is full, evict the OLDEST candidate
            // rather than discarding the NEW one. Newer candidates are typically
            // more valuable — they reflect more recently discovered interfaces
            // (e.g. relay candidates gathered after STUN, or candidates from a
            // network handoff). Dropping the tail means the freshest paths never
            // reach the ICE agent.
            if iceCandidateBuffer.count >= QualityThresholds.iceCandidateBufferCap {
                iceCandidateBuffer.removeFirst()
                Logger.webrtc.warning("ICE candidate buffer full — evicting oldest to make room")
            }
            iceCandidateBuffer.append(candidate)
            Logger.webrtc.debug("Buffered ICE candidate (no remote description yet), count=\(self.iceCandidateBuffer.count)")
            return
        }
        pendingCandidateTask?.cancel()
        pendingCandidateTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await self.client.addIceCandidate(candidate)
            } catch WebRTCError.noPeerConnection {
                // Expected after call teardown: peerConnection is nil once
                // disconnect() runs. Log at debug to avoid error noise in
                // post-call candidate drains.
                Logger.webrtc.debug("ICE candidate discarded — peer connection already torn down")
            } catch {
                Logger.webrtc.error("Failed to add ICE candidate: \(error.localizedDescription)")
            }
        }
    }

    func startLocalMedia(isVideo: Bool) async throws {
        try await client.startLocalMedia(type: isVideo ? .audioVideo : .audioOnly)
        Logger.webrtc.info("Local media started - video: \(isVideo)")
    }

    // MARK: - Media Controls

    func muteAudio(_ muted: Bool) {
        client.toggleAudio(!muted)
    }

    func enableVideo(_ enabled: Bool) {
        client.toggleVideo(enabled)
    }

    var hasLocalVideoTrack: Bool { client.hasLocalVideoTrack }

    /// §5.4 — mid-call audio→video upgrade (FaceTime-style). Builds the camera
    /// track, attaches it to the reserved video transceiver and flips to
    /// sendRecv. Returns true when a renegotiation (createOffer) is required.
    func upgradeToVideo() async throws -> Bool {
        try await client.enableLocalVideo()
    }

    /// §5.4 — mid-call video→audio downgrade. Returns true when a renegotiation
    /// is required.
    func downgradeFromVideo() async -> Bool {
        await client.disableLocalVideo()
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

    // §7.1 — Continuity / external camera picker passthrough.
    func availableCameras() -> [CameraDeviceOption] {
        client.availableCameras()
    }

    func switchToCamera(uniqueID: String) {
        Task {
            do {
                try await client.switchToCamera(uniqueID: uniqueID)
            } catch {
                Logger.webrtc.error("Failed to switch to camera \(uniqueID): \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Comfort Noise

    func handleRemoteAudioMuted(_ muted: Bool) {
        guard comfortNoiseEnabled else { return }
        Logger.webrtc.info("Remote audio \(muted ? "muted" : "unmuted") — CNG active via Opus")
    }

    // MARK: - Quality Monitoring

    /// Public passthrough to the underlying client's stats. Used by the RTP gate
    /// in CallManager to confirm media is flowing before transitioning .connecting → .connected.
    /// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.3
    func getStats() async -> CallStats? {
        await client.getStats()
    }

    func startQualityMonitor() {
        stopQualityMonitor()
        let interval = QualityThresholds.statsIntervalSeconds
        // The outer Task inherits @MainActor isolation (created from a @MainActor
        // method), so all state mutations inside are actor-safe without an extra
        // nested Task { @MainActor in }. The previous nested-Task pattern had a
        // subtle bug: `guard let stats … else { return }` returned from the INNER
        // task, not the outer loop — monitoring silently resumed. Here, `continue`
        // correctly skips the tick without exiting the loop.
        qualityMonitorTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(interval))
                if Task.isCancelled { break }
                guard let self else { return }
                guard let stats = await self.client.getStats() else { continue }
                let previous = self.lastStats
                self.lastStats = stats
                self.adjustBitrate(basedOn: stats, previous: previous)
                // Interval packet-loss % from cumulative-counter deltas (same
                // formula as adjustBitrate) — reported alongside cumulative
                // data usage + current quality to the gateway so the
                // call-summary message can show "data spent · quality" and
                // loss alerts can fire.
                let deltaLost = max(0, stats.packetsLost - (previous?.packetsLost ?? 0))
                let deltaReceived = max(0, stats.inboundPacketsReceived - (previous?.inboundPacketsReceived ?? 0))
                let denom = deltaLost + deltaReceived
                let packetLossPercent = denom > 0 ? Double(deltaLost) / Double(denom) * 100 : 0
                self.delegate?.webRTCService(self, didCollectStats: stats, level: self.currentQualityLevel, packetLossPercent: packetLossPercent)
            }
        }
        Logger.webrtc.info("Quality monitor started (interval: \(interval)s, task-based)")
    }

    func stopQualityMonitor() {
        qualityMonitorTask?.cancel()
        qualityMonitorTask = nil
        lastStats = nil
    }

    private func adjustBitrate(basedOn stats: CallStats, previous: CallStats?) {
        let rtt = stats.roundTripTimeMs
        // P1-4 — `packetsLost` / `inboundPacketsReceived` are CUMULATIVE counters.
        // Compute a real loss RATIO between two snapshots: Δlost / (Δlost+Δrecv).
        // The old code passed the raw cumulative count as a fraction, so a single
        // lost packet read as >100% loss and pinned quality to .critical for life.
        let deltaLost = max(0, stats.packetsLost - (previous?.packetsLost ?? 0))
        let deltaReceived = max(0, stats.inboundPacketsReceived - (previous?.inboundPacketsReceived ?? 0))
        let denom = deltaLost + deltaReceived
        let lossRatio = denom > 0 ? Double(deltaLost) / Double(denom) : 0

        // Merge the RTT/loss heuristic with the TWCC GCC bandwidth estimate.
        // When TWCC is active (bps > 0), GCC has better visibility into the
        // actual available path capacity than RTT alone. Taking the min of both
        // ensures we never over-commit beyond what either signal permits.
        let heuristicLevel = VideoQualityLevel.from(rtt: rtt, packetLoss: lossRatio)
        let bweLevel: VideoQualityLevel? = stats.availableOutgoingBitrateBps > 0
            ? VideoQualityLevel.from(availableOutgoingBitrateBps: stats.availableOutgoingBitrateBps)
            : nil
        let newLevel = bweLevel.map { min(heuristicLevel, $0) } ?? heuristicLevel

        let newBitrate: Int
        if rtt <= QualityThresholds.excellentRTT && lossRatio <= QualityThresholds.excellentPacketLoss {
            newBitrate = QualityThresholds.maxBitrate
        } else if rtt <= QualityThresholds.goodRTT && lossRatio <= QualityThresholds.goodPacketLoss {
            newBitrate = QualityThresholds.defaultBitrate
        } else {
            newBitrate = QualityThresholds.minBitrate
        }
        // Jitter > 30ms degrades Opus PLC; cap to minBitrate even on a low-RTT path.
        let effectiveBitrate = stats.jitterMs > QualityThresholds.highJitterThresholdMs
            ? QualityThresholds.minBitrate : newBitrate

        if effectiveBitrate != currentBitrate {
            currentBitrate = effectiveBitrate
            // Apply the new ceiling to the live audio sender so the encoder
            // actually sheds bandwidth — previously this was only logged.
            client.applyAudioEncoding(maxBitrateBps: effectiveBitrate)
            let lossPct = String(format: "%.1f%%", lossRatio * 100)
            let bweMbps = stats.availableOutgoingBitrateBps > 0
                ? String(format: " bwe=%.1fMbps", Double(stats.availableOutgoingBitrateBps) / 1_000_000)
                : ""
            let jitterTag = stats.jitterMs > QualityThresholds.highJitterThresholdMs
                ? String(format: " jitter=%.0fms[capped]", stats.jitterMs)
                : ""
            Logger.webrtc.info("Audio bitrate adjusted to \(effectiveBitrate / 1000)kbps (RTT: \(rtt)ms, loss: \(lossPct)\(bweMbps)\(jitterTag))")
        }

        // §5.6 — a thermal transition must re-apply the encoder ceiling even
        // when the network quality level is steady (a hot device sheds frames
        // regardless of net health). Detected here on the periodic stats tick;
        // thermal changes are slow (minutes) so tick latency is irrelevant.
        let thermal = ProcessInfo.processInfo.thermalState
        let thermalChanged = thermal != lastThermalState
        lastThermalState = thermal

        guard newLevel != currentQualityLevel else {
            if thermalChanged { applyVideoQuality(currentQualityLevel) }
            return
        }

        let now = Date()
        if let debounce = qualityLevelDebounceDate, now.timeIntervalSince(debounce) < QualityThresholds.qualityLevelDebounceSeconds {
            return
        }
        qualityLevelDebounceDate = now

        let previousLevel = currentQualityLevel
        currentQualityLevel = newLevel
        Logger.webrtc.info("Quality level changed: \(previousLevel.rawValue) → \(newLevel.rawValue)")
        delegate?.webRTCService(self, didChangeQualityLevel: newLevel, from: previousLevel)

        applyVideoQuality(newLevel)
    }

    /// P1-3 — drive the actual video encoder from the quality ladder. The old
    /// code only ever toggled video OFF at `.critical` (never back ON, never
    /// touched bitrate/fps), so adaptation was all-or-nothing. We instead scale
    /// the SENDER caps continuously. We intentionally NEVER toggle the video
    /// track here: on/off is the USER's control (privacy). Even `.critical` is
    /// floored to a low resolution/bitrate (360p15 @ 100 kbps) rather than killed
    /// — `degradationPreference = .maintainFramerate` + low caps handle severe
    /// congestion gracefully without desyncing the peer.
    private func applyVideoQuality(_ level: VideoQualityLevel) {
        let bitrate = level.targetVideoBitrate > 0 ? level.targetVideoBitrate : QualityThresholds.minVideoBitrate
        let fps = level.targetFPS > 0 ? level.targetFPS : QualityThresholds.criticalVideoFloorFPS
        let height = level.targetResolutionHeight > 0 ? level.targetResolutionHeight : QualityThresholds.criticalVideoFloorHeight
        let scale = max(1.0, 720.0 / Double(height))
        // §5.6 — compose the network-driven target with the device thermal
        // ceiling so a hot device sheds frames/bitrate even when the network is
        // healthy. `.nominal` is a no-op, so cool devices keep full quality.
        let thermal = VideoThermalProfile.apply(
            bitrateBps: bitrate,
            framerate: fps,
            scaleDownBy: scale,
            thermalState: ProcessInfo.processInfo.thermalState
        )
        client.applyVideoEncoding(
            maxBitrateBps: thermal.bitrateBps,
            maxFramerate: thermal.framerate,
            scaleResolutionDownBy: thermal.scaleDownBy
        )
    }

    // MARK: - DataChannel Transcription (H7)

    func createTranscriptionChannel() -> Bool {
        client.createDataChannel(label: "transcription")
    }

    func sendTranscription(_ message: DataChannelTranscriptionMessage) {
        guard let data = try? JSONEncoder().encode(message) else { return }
        client.sendDataChannelMessage(data)
    }

    func sendDTMF(digits: String) {
        client.sendDTMF(digits: digits)
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
        // P0-4 — signal the peer connection to embed new ICE credentials in the
        // next offer (IceRestart:true constraint → full ICE re-gather, new ufrag/pwd).
        client.restartIce()
        return await createOffer()
    }

    // MARK: - Cleanup

    func close() {
        stopQualityMonitor()
        disconnectDebounceTask?.cancel()
        disconnectDebounceTask = nil
        flushCandidatesTask?.cancel()
        flushCandidatesTask = nil
        pendingCandidateTask?.cancel()
        pendingCandidateTask = nil
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
        flushCandidatesTask?.cancel()
        flushCandidatesTask = Task { [weak self] in
            guard let self else { return }
            for candidate in buffered {
                if Task.isCancelled { break }
                do {
                    try await self.client.addIceCandidate(candidate)
                } catch WebRTCError.noPeerConnection {
                    Logger.webrtc.debug("Buffered ICE candidate discarded — peer connection torn down mid-flush")
                    break
                } catch {
                    Logger.webrtc.error("Failed to add buffered ICE candidate: \(error.localizedDescription)")
                }
            }
        }
    }
}

// MARK: - WebRTCClientDelegate

extension WebRTCService: WebRTCClientDelegate {
    // Audit P1-3 — every delegate method is `nonisolated` (because the
    // protocol is not @MainActor and the caller — P2PWebRTCClient — invokes
    // these from `DispatchQueue.main.async`, not from the MainActor
    // isolation domain). They hop to MainActor via `Task` to mutate state
    // safely.
    nonisolated func webRTCClient(_ client: any WebRTCClientProviding, didGenerateCandidate candidate: IceCandidate) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.delegate?.webRTCService(self, didGenerateCandidate: candidate)
        }
    }

    nonisolated func webRTCClient(_ client: any WebRTCClientProviding, didChangeConnectionState state: PeerConnectionState) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.connectionState = state
            self.delegate?.webRTCService(self, didChangeConnectionState: state)

            switch state {
            case .connected:
                // Recovered (or first connect) — cancel any pending disconnect
                // debounce so a transient blip that healed does not fire.
                self.disconnectDebounceTask?.cancel()
                self.disconnectDebounceTask = nil
                self.delegate?.webRTCServiceDidConnect(self)
            case .disconnected:
                // §3.2 — debounce: only escalate to the FSM if still
                // disconnected after the window. Transient ICE blips self-heal.
                self.scheduleDisconnectEscalation()
            case .failed, .closed:
                // Decisive — escalate immediately.
                self.disconnectDebounceTask?.cancel()
                self.disconnectDebounceTask = nil
                self.delegate?.webRTCServiceDidDisconnect(self)
            case .connecting, .reconnecting, .checking, .new:
                // No longer in a settled-disconnected state — drop the debounce.
                self.disconnectDebounceTask?.cancel()
                self.disconnectDebounceTask = nil
            }
        }
    }

    /// §3.2 — fire `webRTCServiceDidDisconnect` only if the connection is still
    /// `.disconnected` after `disconnectDebounceSeconds`. Re-arming cancels the
    /// previous task so the window always reflects the latest `.disconnected`.
    private func scheduleDisconnectEscalation() {
        disconnectDebounceTask?.cancel()
        disconnectDebounceTask = Task { @MainActor [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: .seconds(QualityThresholds.disconnectDebounceSeconds))
            if Task.isCancelled { return }
            guard self.connectionState == .disconnected else { return }
            Logger.webrtc.info("disconnect debounce elapsed — escalating to reconnect")
            self.delegate?.webRTCServiceDidDisconnect(self)
        }
    }

    nonisolated func webRTCClient(_ client: any WebRTCClientProviding, didReceiveRemoteVideoTrack track: sending Any) {
        Logger.webrtc.info("Remote video track received")
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.delegate?.webRTCService(self, didReceiveRemoteVideoTrack: track)
        }
    }

    nonisolated func webRTCClient(_ client: any WebRTCClientProviding, didReceiveRemoteAudioTrack track: sending Any) {
        Logger.webrtc.info("Remote audio track received")
    }

    nonisolated func webRTCClient(_ client: any WebRTCClientProviding, didReceiveDataChannelMessage data: Data) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.delegate?.webRTCService(self, didReceiveTranscriptionData: data)
        }
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let webrtc = Logger(subsystem: "me.meeshy.app", category: "webrtc")
}
