import Foundation
import AVFoundation
import CallKit
import Combine
import Network
import MeeshySDK
import os

// MARK: - Call State

enum CallState: Equatable {
    case idle
    case ringing(isOutgoing: Bool)
    case connecting
    case connected
    case reconnecting(attempt: Int)
    case ended(reason: CallEndReason)

    var isActive: Bool {
        switch self {
        case .idle, .ended: return false
        default: return true
        }
    }
}

// MARK: - Call Manager

@MainActor
final class CallManager: ObservableObject {
    static let shared = CallManager()

    // MARK: - Published State

    @Published private(set) var callState: CallState = .idle
    @Published private(set) var transcriptionService = CallTranscriptionService()
    @Published private(set) var remoteUserId: String?
    @Published private(set) var remoteUsername: String?
    @Published var isVideoEnabled: Bool = false
    @Published var isMuted: Bool = false
    @Published var isSpeaker: Bool = false
    @Published private(set) var callDuration: TimeInterval = 0
    @Published private(set) var currentCallId: String?
    @Published private(set) var connectionQuality: PeerConnectionState = .new
    @Published var displayMode: CallDisplayMode = .fullScreen

    // MARK: - Internal

    private let webRTCService: WebRTCService
    private var durationTimer: Timer?
    private var heartbeatTimer: Timer?
    private var callStartDate: Date?
    private var reconnectAttempt = 0
    private var participantJoinedCancellable: AnyCancellable?
    private var pendingRemoteOffer: SessionDescription?
    private var cancellables = Set<AnyCancellable>()

    // Network monitoring
    private let networkMonitor = NWPathMonitor()
    private let networkQueue = DispatchQueue(label: "me.meeshy.callmanager.network")
    private var lastNetworkPath: NWPath.Status = .satisfied
    private let thermalMonitor = ThermalStateMonitor()

    // CallKit
    private let callProvider: CXProvider
    private let callController = CXCallController()
    private var activeCallUUID: UUID?

    private init(webRTCService: WebRTCService? = nil) {
        self.webRTCService = webRTCService ?? WebRTCService()

        let config = CXProviderConfiguration()
        config.supportsVideo = true
        config.maximumCallsPerCallGroup = 1
        config.maximumCallGroups = 1
        config.supportedHandleTypes = [.generic]
        config.iconTemplateImageData = nil
        callProvider = CXProvider(configuration: config)

        let delegateProxy = CallKitDelegateProxy()
        delegateProxy.manager = self
        callProvider.setDelegate(delegateProxy, queue: nil)
        self.callKitDelegate = delegateProxy

        self.webRTCService.delegate = self

        setupSocketListeners()
        startNetworkMonitoring()
        Logger.calls.info("CallManager initialized")
    }

    private var callKitDelegate: CallKitDelegateProxy?

    // MARK: - Outgoing Call

    func startCall(userId: String, username: String, isVideo: Bool) {
        guard callState == .idle else {
            Logger.calls.warning("Cannot start call: already in state \(String(describing: self.callState))")
            return
        }

        let callId = UUID().uuidString
        currentCallId = callId
        remoteUserId = userId
        remoteUsername = username
        isVideoEnabled = isVideo
        isMuted = false
        isSpeaker = isVideo
        callState = .ringing(isOutgoing: true)

        webRTCService.configure(isVideo: isVideo)

        let uuid = UUID()
        activeCallUUID = uuid
        let handle = CXHandle(type: .generic, value: userId)
        let startAction = CXStartCallAction(call: uuid, handle: handle)
        startAction.isVideo = isVideo
        startAction.contactIdentifier = username
        let transaction = CXTransaction(action: startAction)
        callController.request(transaction) { [weak self] error in
            if let error {
                Logger.calls.error("CallKit start call failed: \(error.localizedDescription)")
                Task { @MainActor in self?.endCallInternal(reason: .failed("CallKit error")) }
            }
        }

        Task { [weak self] in
            guard let self else { return }
            await webRTCService.startLocalMedia(isVideo: isVideo)
            Logger.calls.info("Outgoing call initiated: \(callId) to \(username), waiting for participant joined")
        }

        listenForParticipantJoined(callId: callId, toUserId: userId, isVideo: isVideo)
        HapticFeedback.medium()
    }

    // MARK: - Incoming Call

    func handleIncomingOffer(callId: String, fromUserId: String, fromUsername: String, isVideo: Bool, sdp: SessionDescription) {
        guard callState == .idle else {
            Logger.calls.warning("Rejecting incoming call: already busy")
            emitCallReject(callId: callId, toUserId: fromUserId)
            return
        }

        currentCallId = callId
        remoteUserId = fromUserId
        remoteUsername = fromUsername
        isVideoEnabled = isVideo
        isMuted = false
        isSpeaker = isVideo
        callState = .ringing(isOutgoing: false)

        webRTCService.configure(isVideo: isVideo)

        let uuid = UUID()
        activeCallUUID = uuid
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: fromUserId)
        update.localizedCallerName = fromUsername
        update.hasVideo = isVideo
        update.supportsGrouping = false
        update.supportsHolding = false

        callProvider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error {
                Logger.calls.error("CallKit report incoming failed: \(error.localizedDescription)")
                Task { @MainActor in self?.endCallInternal(reason: .failed("CallKit error")) }
            }
        }

        pendingRemoteOffer = sdp

        Task { [weak self] in
            guard let self else { return }
            await webRTCService.setRemoteDescription(sdp)
            await webRTCService.startLocalMedia(isVideo: isVideo)
        }

        Logger.calls.info("Incoming call from \(fromUsername): \(callId)")
        HapticFeedback.medium()
    }

    // MARK: - Answer Call

    func answerCall() {
        guard case .ringing(isOutgoing: false) = callState else { return }

        callState = .connecting

        if let uuid = activeCallUUID {
            let answerAction = CXAnswerCallAction(call: uuid)
            let transaction = CXTransaction(action: answerAction)
            callController.request(transaction) { error in
                if let error { Logger.calls.error("CallKit answer failed: \(error.localizedDescription)") }
            }
        }

        Task { [weak self] in
            guard let self, let callId = currentCallId, let userId = remoteUserId else { return }
            guard let remoteOffer = pendingRemoteOffer else {
                Logger.calls.error("No remote offer available for answer")
                endCallInternal(reason: .failed("No remote offer received"))
                return
            }
            guard let answer = await webRTCService.createAnswer(from: remoteOffer) else {
                endCallInternal(reason: .failed("Failed to create SDP answer"))
                return
            }
            emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
            pendingRemoteOffer = nil
            Logger.calls.info("Call answered: \(callId)")
        }

        HapticFeedback.success()
    }

    // MARK: - Reject Call

    func rejectCall() {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard let callId = currentCallId, let userId = remoteUserId else { return }

        emitCallReject(callId: callId, toUserId: userId)

        if let uuid = activeCallUUID {
            let endAction = CXEndCallAction(call: uuid)
            callController.request(CXTransaction(action: endAction)) { error in
                if let error { Logger.calls.error("CallKit reject failed: \(error.localizedDescription)") }
            }
        }

        endCallInternal(reason: .rejected)
        HapticFeedback.error()
        Logger.calls.info("Call rejected: \(callId)")
    }

    // MARK: - End Call

    func endCall() {
        guard callState.isActive else { return }
        guard let callId = currentCallId, let userId = remoteUserId else { return }

        emitCallEnd(callId: callId, toUserId: userId)

        if let uuid = activeCallUUID {
            let endAction = CXEndCallAction(call: uuid)
            callController.request(CXTransaction(action: endAction)) { error in
                if let error { Logger.calls.error("CallKit end failed: \(error.localizedDescription)") }
            }
        }

        endCallInternal(reason: .local)
        Logger.calls.info("Call ended by local: \(callId)")
    }

    // MARK: - Media Controls

    func toggleMute() {
        isMuted.toggle()
        webRTCService.muteAudio(isMuted)

        if let uuid = activeCallUUID {
            let muteAction = CXSetMutedCallAction(call: uuid, muted: isMuted)
            callController.request(CXTransaction(action: muteAction)) { error in
                if let error { Logger.calls.error("CallKit mute failed: \(error.localizedDescription)") }
            }
        }

        HapticFeedback.light()
    }

    func toggleSpeaker() {
        isSpeaker.toggle()
        HapticFeedback.light()
    }

    func toggleVideo() {
        isVideoEnabled.toggle()
        webRTCService.enableVideo(isVideoEnabled)
        HapticFeedback.light()
    }

    func switchCamera() {
        webRTCService.switchCamera()
        HapticFeedback.light()
    }

    func toggleTranscription() {
        if transcriptionService.isTranscribing {
            transcriptionService.stopTranscribing()
        } else {
            let localLang = "fr"
            let remoteLang = "fr"
            let localUserId = AuthManager.shared.currentUser?.id ?? ""
            let remoteUserId = remoteUserId ?? ""
            transcriptionService.startTranscribing(
                localLanguage: localLang,
                remoteLanguage: remoteLang,
                localUserId: localUserId,
                remoteUserId: remoteUserId
            )
        }
    }

    var videoFilters: VideoFilterPipeline { webRTCService.videoFilters }

    // MARK: - Remote Events

    func handleRemoteAnswer(callId: String, sdp: SessionDescription) {
        guard currentCallId == callId else { return }
        Task { [weak self] in
            guard let self else { return }
            await webRTCService.setRemoteDescription(sdp)
            transitionToConnected()
            Logger.calls.info("Remote answer received for: \(callId)")
        }
    }

    func handleRemoteICECandidate(callId: String, candidate: IceCandidate) {
        guard currentCallId == callId else { return }
        webRTCService.addICECandidate(candidate)
    }

    func handleRemoteReject(callId: String) {
        guard currentCallId == callId else { return }
        if let uuid = activeCallUUID {
            callProvider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        }
        endCallInternal(reason: .rejected)
        HapticFeedback.error()
        Logger.calls.info("Call rejected by remote: \(callId)")
    }

    func handleRemoteEnd(callId: String) {
        guard currentCallId == callId else { return }
        if let uuid = activeCallUUID {
            callProvider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        }
        endCallInternal(reason: .remote)
        Logger.calls.info("Call ended by remote: \(callId)")
    }

    // MARK: - Private: State Transitions

    private func transitionToConnected() {
        callState = .connected
        callStartDate = Date()
        callDuration = 0
        reconnectAttempt = 0
        durationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let start = self.callStartDate else { return }
                self.callDuration = Date().timeIntervalSince(start)
            }
        }

        startHeartbeat()
        webRTCService.startQualityMonitor()
        startThermalMonitoring()

        if let uuid = activeCallUUID {
            callProvider.reportOutgoingCall(with: uuid, connectedAt: Date())
        }
    }

    private func startThermalMonitoring() {
        thermalMonitor.delegate = self
        thermalMonitor.startMonitoring()
    }

    private func startHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = Timer.scheduledTimer(
            withTimeInterval: QualityThresholds.heartbeatIntervalSeconds,
            repeats: true
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let callId = self.currentCallId else { return }
                MessageSocketManager.shared.emitCallSignal(
                    callId: callId,
                    type: "heartbeat",
                    payload: [:]
                )
                Logger.calls.debug("Heartbeat sent for call: \(callId)")
            }
        }
        Logger.calls.info("Heartbeat timer started (\(QualityThresholds.heartbeatIntervalSeconds)s interval)")
    }

    private func stopHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
    }

    // MARK: - Network Monitoring

    private func startNetworkMonitoring() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasUnsatisfied = self.lastNetworkPath != .satisfied
                let isNowSatisfied = path.status == .satisfied
                self.lastNetworkPath = path.status

                let isInActiveCall: Bool
                switch self.callState {
                case .connected, .reconnecting: isInActiveCall = true
                default: isInActiveCall = false
                }
                guard isInActiveCall else { return }

                if path.status != .satisfied {
                    Logger.calls.warning("Network lost during call — starting reconnection")
                    self.attemptReconnection()
                } else if wasUnsatisfied && isNowSatisfied {
                    Logger.calls.info("Network recovered during call — performing ICE restart")
                    self.attemptReconnection()
                }
            }
        }
        networkMonitor.start(queue: networkQueue)
    }

    private func endCallInternal(reason: CallEndReason) {
        durationTimer?.invalidate()
        durationTimer = nil
        stopHeartbeat()
        if transcriptionService.isTranscribing {
            transcriptionService.stopTranscribing()
        }
        participantJoinedCancellable?.cancel()
        participantJoinedCancellable = nil
        pendingRemoteOffer = nil
        thermalMonitor.stopMonitoring()
        callStartDate = nil
        reconnectAttempt = 0
        webRTCService.close()
        callState = .ended(reason: reason)
        connectionQuality = .new
        activeCallUUID = nil

        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(3))
            guard let self else { return }
            if case .ended = self.callState {
                self.callState = .idle
                self.currentCallId = nil
                self.remoteUserId = nil
                self.remoteUsername = nil
                self.callDuration = 0
                self.isVideoEnabled = false
                self.isMuted = false
                self.isSpeaker = false
            }
        }
    }

    // MARK: - Socket.IO Signaling

    private func setupSocketListeners() {
        let socket = MessageSocketManager.shared

        socket.callOfferReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                let isVideo = event.mode == "video" || event.mode == nil
                let sdp = SessionDescription(type: .offer, sdp: "")
                self?.handleIncomingOffer(
                    callId: event.callId,
                    fromUserId: event.initiator.userId,
                    fromUsername: event.initiator.username,
                    isVideo: isVideo,
                    sdp: sdp
                )
            }
            .store(in: &cancellables)

        socket.callAnswerReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let sdpString = event.signal.sdp else { return }
                let sdp = SessionDescription(type: .answer, sdp: sdpString)
                self?.handleRemoteAnswer(callId: event.callId, sdp: sdp)
            }
            .store(in: &cancellables)

        socket.callICECandidateReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let candidateString = event.signal.candidate else { return }
                let candidate = IceCandidate(
                    sdpMid: event.signal.sdpMid,
                    sdpMLineIndex: Int32(event.signal.sdpMLineIndex ?? 0),
                    candidate: candidateString
                )
                self?.handleRemoteICECandidate(callId: event.callId, candidate: candidate)
            }
            .store(in: &cancellables)

        socket.callEnded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleRemoteEnd(callId: event.callId)
            }
            .store(in: &cancellables)
    }

    // MARK: - Participant Joined (Outgoing Call)

    private func listenForParticipantJoined(callId: String, toUserId: String, isVideo: Bool) {
        participantJoinedCancellable?.cancel()
        participantJoinedCancellable = MessageSocketManager.shared.callParticipantJoined
            .receive(on: DispatchQueue.main)
            .filter { $0.callId == callId }
            .first()
            .sink { [weak self] _ in
                guard let self else { return }
                Logger.calls.info("Participant joined call \(callId), creating offer")
                self.callState = .connecting
                Task { [weak self] in
                    guard let self else { return }
                    guard let offer = await self.webRTCService.createOffer() else {
                        self.endCallInternal(reason: .failed("Failed to create offer"))
                        return
                    }
                    self.emitCallOffer(callId: callId, toUserId: toUserId, isVideo: isVideo, sdp: offer)
                    Logger.calls.info("SDP offer sent for call: \(callId)")
                }
            }
    }

    // MARK: - Socket Emit Helpers

    private nonisolated func emitCallOffer(callId: String, toUserId: String, isVideo: Bool, sdp: SessionDescription) {
        MessageSocketManager.shared.emitCallSignal(
            callId: callId,
            type: "offer",
            payload: ["sdp": sdp.sdp, "to": toUserId]
        )
    }

    private nonisolated func emitCallAnswer(callId: String, toUserId: String, sdp: SessionDescription) {
        MessageSocketManager.shared.emitCallSignal(
            callId: callId,
            type: "answer",
            payload: ["sdp": sdp.sdp, "to": toUserId]
        )
    }

    private nonisolated func emitCallReject(callId: String, toUserId: String) {
        MessageSocketManager.shared.emitCallLeave(callId: callId)
    }

    private nonisolated func emitCallEnd(callId: String, toUserId: String) {
        MessageSocketManager.shared.emitCallEnd(callId: callId)
    }

    // MARK: - Duration Formatting

    var formattedDuration: String {
        let minutes = Int(callDuration) / 60
        let seconds = Int(callDuration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

// MARK: - ThermalStateMonitorDelegate

extension CallManager: ThermalStateMonitorDelegate {
    nonisolated func thermalStateDidChange(to state: ProcessInfo.ThermalState) {
        Task { @MainActor [weak self] in
            guard let self, self.callState == .connected else { return }
            if state == .critical && self.isVideoEnabled {
                Logger.calls.warning("Thermal critical — disabling video to preserve battery")
                self.isVideoEnabled = false
                self.webRTCService.toggleVideo(enabled: false)
            } else if state == .serious {
                Logger.calls.warning("Thermal serious — reducing quality")
            }
        }
    }
}

// MARK: - WebRTCServiceDelegate

extension CallManager: WebRTCServiceDelegate {
    nonisolated func webRTCService(_ service: WebRTCService, didGenerateCandidate candidate: IceCandidate) {
        Task { @MainActor [weak self] in
            guard let self, let callId = self.currentCallId, let userId = self.remoteUserId else { return }
            var payload: [String: String] = [
                "candidate": candidate.candidate,
                "sdpMLineIndex": String(candidate.sdpMLineIndex),
                "to": userId
            ]
            if let sdpMid = candidate.sdpMid {
                payload["sdpMid"] = sdpMid
            }
            MessageSocketManager.shared.emitCallSignal(
                callId: callId,
                type: "ice-candidate",
                payload: payload
            )
            Logger.calls.debug("Sent ICE candidate for call: \(callId)")
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didChangeConnectionState state: PeerConnectionState) {
        Task { @MainActor [weak self] in
            self?.connectionQuality = state
        }
    }

    nonisolated func webRTCServiceDidConnect(_ service: WebRTCService) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            switch self.callState {
            case .connecting:
                self.transitionToConnected()
            case .reconnecting:
                Logger.calls.info("Reconnection successful")
                self.transitionToConnected()
            default:
                break
            }
        }
    }

    nonisolated func webRTCServiceDidDisconnect(_ service: WebRTCService) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            switch self.callState {
            case .connected, .reconnecting:
                self.attemptReconnection()
            default:
                Logger.calls.info("WebRTC disconnected in state: \(String(describing: self.callState))")
            }
        }
    }

    @MainActor
    private func attemptReconnection() {
        reconnectAttempt += 1
        guard reconnectAttempt <= QualityThresholds.maxReconnectAttempts else {
            Logger.calls.error("Max reconnect attempts (\(QualityThresholds.maxReconnectAttempts)) reached — ending call")
            if let uuid = activeCallUUID {
                callProvider.reportCall(with: uuid, endedAt: Date(), reason: .failed)
            }
            endCallInternal(reason: .connectionLost)
            return
        }

        callState = .reconnecting(attempt: reconnectAttempt)
        Logger.calls.warning("Attempting ICE restart (\(self.reconnectAttempt)/\(QualityThresholds.maxReconnectAttempts))")

        Task { [weak self] in
            guard let self, let callId = self.currentCallId, let userId = self.remoteUserId else { return }
            guard let offer = await self.webRTCService.performICERestart() else {
                Logger.calls.error("ICE restart failed to produce offer")
                self.attemptReconnection()
                return
            }
            self.emitCallOffer(callId: callId, toUserId: userId, isVideo: self.isVideoEnabled, sdp: offer)
            Logger.calls.info("ICE restart offer sent for call: \(callId)")
        }
    }
}

// MARK: - CallKit Delegate Proxy

private class CallKitDelegateProxy: NSObject, CXProviderDelegate, @unchecked Sendable {
    weak var manager: CallManager?

    func providerDidReset(_ provider: CXProvider) {
        Logger.calls.info("CallKit provider did reset")
        Task { @MainActor [weak self] in
            self?.manager?.endCall()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        Task { @MainActor [weak self] in
            self?.manager?.answerCall()
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        Task { @MainActor [weak self] in
            self?.manager?.endCall()
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        let isMuted = action.isMuted
        Task { @MainActor [weak self] in
            guard let manager = self?.manager else { return }
            if manager.isMuted != isMuted {
                manager.toggleMute()
            }
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        Logger.calls.info("CallKit audio session activated")
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        Logger.calls.info("CallKit audio session deactivated")
    }
}

// MARK: - Logger Extension

private extension Logger {
    static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
