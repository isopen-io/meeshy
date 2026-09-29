import Foundation
import os
@preconcurrency import WebRTC

/// La fabrique des connexions du maillage (#3585) : toutes naissent de la
/// fabrique WebRTC du processus (`WebRTCSharedFactory`, la même que le pair
/// principal) et partagent la piste vidéo locale que `CallManager` capture.
@MainActor
final class WebRTCGroupPeerLinkFactory: GroupPeerLinkFactoryProviding {
    nonisolated deinit {}

    static let shared = WebRTCGroupPeerLinkFactory()

    private let localVideoTrack: @MainActor () -> RTCVideoTrack?

    init(localVideoTrack: @escaping @MainActor () -> RTCVideoTrack? = { CallManager.shared.webRTCService.localVideoTrack as? RTCVideoTrack }) {
        self.localVideoTrack = localVideoTrack
    }

    func makeLink(
        _ configuration: GroupPeerLinkConfiguration,
        onEvent: @escaping @MainActor (GroupPeerLinkEvent) -> Void
    ) -> any GroupPeerLinkProviding {
        WebRTCGroupPeerLink(
            configuration: configuration,
            factory: WebRTCSharedFactory.factory,
            localVideoTrack: localVideoTrack,
            onEvent: onEvent
        )
    }
}

/// UNE `RTCPeerConnection` vers UN membre du groupe — la jumelle, pour le
/// maillage, de `peer-link.ts` (web) :
///
/// - négociation parfaite : le plus petit identifiant est poli et cède en cas
///   de collision d'offres ;
/// - époque `negotiationId` : un signal plus ancien que la plus haute époque
///   vue est écarté ;
/// - offrant : ajoute ses transceivers avant l'offre ; répondant : attache
///   ses pistes APRÈS la description distante (Unified Plan — un transceiver
///   ajouté d'avance n'est pas réassocié à l'offre reçue) ;
/// - reprise ICE : `disconnected` attend 3 s, `failed` relance tout de suite,
///   puis 2 → 16 s entre deux tentatives, 5 au plus, avant `.failed`.
///
/// Les opérations de négociation passent l'une après l'autre (`enqueue`) : un
/// candidat ne peut pas doubler l'offre qui le précède.
@MainActor
final class WebRTCGroupPeerLink: NSObject, GroupPeerLinkProviding {
    nonisolated deinit {}

    static let disconnectGrace: Duration = .seconds(3)
    static let maxRestartAttempts = 5

    let remoteUserId: String
    private(set) var remoteVideoTrack: Any?

    private let isPolite: Bool
    private let receiveOnly: Bool
    private let localVideoTrack: @MainActor () -> RTCVideoTrack?
    private let onEvent: @MainActor (GroupPeerLinkEvent) -> Void
    private let audioTrack: RTCAudioTrack
    private var peerConnection: RTCPeerConnection?
    private var sendsVideo: Bool
    private var epoch = 0
    private var makingOffer = false
    private var hasRemoteDescription = false
    private var pendingCandidates: [RTCIceCandidate] = []
    private var tail: Task<Void, Never>?
    private var restartTask: Task<Void, Never>?
    private var restartAttempts = 0
    private var everConnected = false

    init(
        configuration: GroupPeerLinkConfiguration,
        factory: RTCPeerConnectionFactory,
        localVideoTrack: @escaping @MainActor () -> RTCVideoTrack?,
        onEvent: @escaping @MainActor (GroupPeerLinkEvent) -> Void
    ) {
        self.remoteUserId = configuration.remoteUserId
        self.isPolite = configuration.isPolite
        self.receiveOnly = configuration.receiveOnly
        self.localVideoTrack = localVideoTrack
        self.onEvent = onEvent
        self.sendsVideo = configuration.sendsVideo
        let source = factory.audioSource(with: RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil))
        self.audioTrack = factory.audioTrack(with: source, trackId: "mesh-audio-\(configuration.remoteUserId)")
        self.audioTrack.isEnabled = configuration.sendsAudio
        super.init()
        let rtcConfiguration = RTCConfiguration()
        rtcConfiguration.iceServers = Self.rtcIceServers(configuration.iceServers)
        rtcConfiguration.sdpSemantics = .unifiedPlan
        rtcConfiguration.continualGatheringPolicy = .gatherContinually
        rtcConfiguration.bundlePolicy = .maxBundle
        rtcConfiguration.rtcpMuxPolicy = .require
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: ["DtlsSrtpKeyAgreement": "true"])
        peerConnection = factory.peerConnection(with: rtcConfiguration, constraints: constraints, delegate: self)
        if peerConnection == nil {
            Logger.webrtc.error("[GROUP] mesh peer connection could not be created")
        }
    }

    // MARK: - GroupPeerLinkProviding

    func offer() async {
        await enqueue { [weak self] in await self?.makeOffer(iceRestart: false) }
    }

    func receive(_ signal: GroupCallIncomingSignal) async {
        guard signal.negotiationId >= epoch || signal.kind == .candidate else {
            Logger.webrtc.info("[GROUP] stale signal dropped (gen \(signal.negotiationId) < \(self.epoch))")
            return
        }
        await enqueue { [weak self] in await self?.apply(signal) }
    }

    func setAudioEnabled(_ enabled: Bool) {
        audioTrack.isEnabled = enabled
    }

    func setVideoEnabled(_ enabled: Bool) async {
        guard !receiveOnly else { return }
        sendsVideo = enabled
        guard let pc = peerConnection, let transceiver = pc.transceivers.first(where: { $0.mediaType == .video }) else { return }
        guard enabled, let track = localVideoTrack() else {
            transceiver.sender.track = nil
            return
        }
        transceiver.sender.track = track
        guard transceiver.direction != .sendRecv else { return }
        forceSendRecv(transceiver)
        guard pc.signalingState == .stable, hasRemoteDescription else { return }
        await enqueue { [weak self] in await self?.makeOffer(iceRestart: false) }
    }

    func updateIceServers(_ servers: [IceServer]) {
        guard let pc = peerConnection else { return }
        let configuration = pc.configuration
        configuration.iceServers = Self.rtcIceServers(servers)
        pc.setConfiguration(configuration)
    }

    func audioLevel() async -> Double? {
        guard let pc = peerConnection else { return nil }
        let levels: [Double] = await withCheckedContinuation { continuation in
            pc.statistics { report in
                let values = report.statistics.values.compactMap { stats -> Double? in
                    guard stats.type == "inbound-rtp",
                          ((stats.values["kind"] as? String) ?? (stats.values["mediaType"] as? String)) == "audio" else { return nil }
                    return (stats.values["audioLevel"] as? NSNumber)?.doubleValue
                }
                continuation.resume(returning: values)
            }
        }
        return levels.max()
    }

    func close() {
        restartTask?.cancel()
        restartTask = nil
        tail?.cancel()
        tail = nil
        audioTrack.isEnabled = false
        peerConnection?.close()
        peerConnection = nil
        remoteVideoTrack = nil
        pendingCandidates = []
    }

    // MARK: - Négociation

    private func enqueue(_ work: @escaping @MainActor () async -> Void) async {
        let previous = tail
        let task = Task { @MainActor in
            await previous?.value
            guard !Task.isCancelled else { return }
            await work()
        }
        tail = task
        await task.value
    }

    private func makeOffer(iceRestart: Bool) async {
        guard let pc = peerConnection else { return }
        addOffererTransceiversIfNeeded(on: pc)
        makingOffer = true
        defer { makingOffer = false }
        epoch += 1
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: iceRestart ? ["IceRestart": "true"] : nil,
            optionalConstraints: nil
        )
        do {
            let description = try await Self.describe(pc, offer: true, constraints: constraints)
            try await Self.setLocal(description, on: pc)
            guard peerConnection === pc else { return }
            onEvent(.signal(.description(.offer, sdp: description.sdp, negotiationId: epoch)))
        } catch {
            Logger.webrtc.warning("[GROUP] mesh offer failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func apply(_ signal: GroupCallIncomingSignal) async {
        guard let pc = peerConnection else { return }
        do {
            switch signal.kind {
            case .offer:
                try await applyOffer(signal, on: pc)
            case .answer:
                guard let sdp = signal.sdp, pc.signalingState == .haveLocalOffer else { return }
                try await Self.setRemote(RTCSessionDescription(type: .answer, sdp: sdp), on: pc)
                await remoteDescriptionApplied(on: pc)
            case .candidate:
                guard let line = signal.candidate, line.count <= 4_096 else { return }
                let candidate = RTCIceCandidate(sdp: line, sdpMLineIndex: Int32(signal.sdpMLineIndex ?? 0), sdpMid: signal.sdpMid)
                guard hasRemoteDescription else {
                    pendingCandidates = Array((pendingCandidates + [candidate]).suffix(64))
                    return
                }
                try await pc.add(candidate)
            }
        } catch {
            Logger.webrtc.warning("[GROUP] mesh signal \(signal.kind.rawValue, privacy: .public) rejected: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func applyOffer(_ signal: GroupCallIncomingSignal, on pc: RTCPeerConnection) async throws {
        guard let sdp = signal.sdp, sdp.hasPrefix("v=0"), sdp.count <= 1_000_000 else { return }
        let collision = makingOffer || pc.signalingState != .stable
        if collision && !isPolite {
            Logger.webrtc.info("[GROUP] glare — impolite mesh peer ignores the colliding offer")
            return
        }
        if collision {
            try await Self.setLocal(RTCSessionDescription(type: .rollback, sdp: ""), on: pc)
        }
        epoch = max(epoch, signal.negotiationId)
        try await Self.setRemote(RTCSessionDescription(type: .offer, sdp: sdp), on: pc)
        attachAnswererTracks(on: pc)
        await remoteDescriptionApplied(on: pc)
        let answer = try await Self.describe(pc, offer: false, constraints: RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil))
        try await Self.setLocal(answer, on: pc)
        guard peerConnection === pc else { return }
        onEvent(.signal(.description(.answer, sdp: answer.sdp, negotiationId: epoch)))
    }

    private func remoteDescriptionApplied(on pc: RTCPeerConnection) async {
        hasRemoteDescription = true
        let queued = pendingCandidates
        pendingCandidates = []
        for candidate in queued {
            try? await pc.add(candidate)
        }
    }

    private func addOffererTransceiversIfNeeded(on pc: RTCPeerConnection) {
        guard pc.transceivers.isEmpty else { return }
        let audioInit = RTCRtpTransceiverInit()
        audioInit.direction = .sendRecv
        audioInit.streamIds = ["meeshy-mesh"]
        pc.addTransceiver(of: .audio, init: audioInit)?.sender.track = audioTrack
        let video = sendsVideo ? localVideoTrack() : nil
        let videoInit = RTCRtpTransceiverInit()
        videoInit.direction = video == nil ? .recvOnly : .sendRecv
        videoInit.streamIds = ["meeshy-mesh"]
        pc.addTransceiver(of: .video, init: videoInit)?.sender.track = video
    }

    private func attachAnswererTracks(on pc: RTCPeerConnection) {
        guard !receiveOnly else {
            pc.transceivers.forEach(forceRecvOnly)
            return
        }
        for transceiver in pc.transceivers {
            switch transceiver.mediaType {
            case .audio:
                transceiver.sender.track = audioTrack
                forceSendRecv(transceiver)
            case .video:
                guard sendsVideo, let video = localVideoTrack() else { continue }
                transceiver.sender.track = video
                forceSendRecv(transceiver)
            default:
                continue
            }
        }
    }

    /// L'aperçu de l'appelé : ni micro ni caméra ne partent avant le décroché.
    private func forceRecvOnly(_ transceiver: RTCRtpTransceiver) {
        transceiver.sender.track = nil
        var error: NSError?
        transceiver.setDirection(.recvOnly, error: &error)
        if let error {
            Logger.webrtc.warning("[PREVIEW] setDirection(.recvOnly) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func forceSendRecv(_ transceiver: RTCRtpTransceiver) {
        var error: NSError?
        transceiver.setDirection(.sendRecv, error: &error)
        if let error {
            Logger.webrtc.warning("[GROUP] setDirection(.sendRecv) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Reprise ICE

    private func connectionChanged(_ state: RTCPeerConnectionState, of pc: RTCPeerConnection) {
        guard peerConnection === pc else { return }
        switch state {
        case .connected:
            restartTask?.cancel()
            restartTask = nil
            restartAttempts = 0
            everConnected = true
            onEvent(.state(.connected))
        case .disconnected:
            onEvent(.state(everConnected ? .reconnecting : .connecting))
            scheduleRestart(after: Self.disconnectGrace)
        case .failed:
            scheduleRestart(after: .zero)
        case .new, .connecting:
            onEvent(.state(everConnected ? .reconnecting : .connecting))
        default:
            break
        }
    }

    private func scheduleRestart(after grace: Duration) {
        guard restartTask == nil else { return }
        restartTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: grace)
            guard let self, !Task.isCancelled else { return }
            guard let pc = self.peerConnection,
                  pc.connectionState == .disconnected || pc.connectionState == .failed else {
                self.restartTask = nil
                return
            }
            self.restartAttempts += 1
            guard self.restartAttempts <= Self.maxRestartAttempts else {
                self.onEvent(.failed)
                return
            }
            self.onEvent(.state(.reconnecting))
            try? await Task.sleep(for: Self.restartBackoff(attempt: self.restartAttempts))
            guard !Task.isCancelled else { return }
            self.restartTask = nil
            await self.enqueue { [weak self] in await self?.makeOffer(iceRestart: true) }
        }
    }

    /// 0 s à la première tentative, puis 2, 4, 8, 16 s — la loi de `peer-link.ts`.
    nonisolated static func restartBackoff(attempt: Int) -> Duration {
        guard attempt > 1 else { return .zero }
        return .seconds(min(2 * (1 << (attempt - 2)), 16))
    }

    // MARK: - Adaptateurs WebRTC

    private static func rtcIceServers(_ servers: [IceServer]) -> [RTCIceServer] {
        servers.map { RTCIceServer(urlStrings: $0.urls, username: $0.username, credential: $0.credential) }
    }

    private static func describe(_ pc: RTCPeerConnection, offer: Bool, constraints: RTCMediaConstraints) async throws -> RTCSessionDescription {
        try await withCheckedThrowingContinuation { continuation in
            let handler: @Sendable (RTCSessionDescription?, (any Error)?) -> Void = { sdp, error in
                if let error { continuation.resume(throwing: error); return }
                guard let sdp else { continuation.resume(throwing: WebRTCError.failedToCreateSDP); return }
                continuation.resume(returning: sdp)
            }
            if offer { pc.offer(for: constraints, completionHandler: handler) } else { pc.answer(for: constraints, completionHandler: handler) }
        }
    }

    private static func setLocal(_ description: RTCSessionDescription, on pc: RTCPeerConnection) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            pc.setLocalDescription(description) { error in
                if let error { continuation.resume(throwing: error) } else { continuation.resume() }
            }
        }
    }

    private static func setRemote(_ description: RTCSessionDescription, on pc: RTCPeerConnection) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            pc.setRemoteDescription(description) { error in
                if let error { continuation.resume(throwing: error) } else { continuation.resume() }
            }
        }
    }
}

// MARK: - RTCPeerConnectionDelegate

extension WebRTCGroupPeerLink: RTCPeerConnectionDelegate {
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        deliver(stream.videoTracks.first, from: peerConnection)
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd rtpReceiver: RTCRtpReceiver, streams mediaStreams: [RTCMediaStream]) {
        deliver(rtpReceiver.track, from: peerConnection)
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didStartReceivingOn transceiver: RTCRtpTransceiver) {
        deliver(transceiver.receiver.track, from: peerConnection)
    }

    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        DispatchQueue.main.async { [weak self] in
            self?.connectionChanged(newState, of: peerConnection)
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        let line = candidate.sdp
        let mid = candidate.sdpMid
        let index = Int(candidate.sdpMLineIndex)
        DispatchQueue.main.async { [weak self] in
            guard let self, self.peerConnection === peerConnection else { return }
            self.onEvent(.signal(.candidate(line, sdpMid: mid, sdpMLineIndex: index, negotiationId: self.epoch)))
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    nonisolated private func deliver(_ track: RTCMediaStreamTrack?, from peerConnection: RTCPeerConnection) {
        guard let video = track as? RTCVideoTrack else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, self.peerConnection === peerConnection, (self.remoteVideoTrack as? RTCVideoTrack) !== video else { return }
            self.remoteVideoTrack = video
            self.onEvent(.remoteVideo)
        }
    }
}
