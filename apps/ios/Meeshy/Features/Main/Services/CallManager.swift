import Foundation
import AVFoundation
import CallKit
import Combine
import Network
import UIKit
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

    var isRinging: Bool {
        if case .ringing = self { return true }
        return false
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
    @Published private(set) var activeAudioEffect: AudioEffectConfig?
    @Published private(set) var hasLocalVideoTrack = false
    @Published private(set) var hasRemoteVideoTrack = false
    @Published var pendingIncomingCall: (callId: String, fromUserId: String, fromUsername: String, isVideo: Bool)?

    // MARK: - Internal

    private let webRTCService: WebRTCService
    private var durationTimer: Timer?
    private var heartbeatTimer: Timer?
    private var callStartDate: Date?
    private var reconnectAttempt = 0
    private var participantJoinedCancellable: AnyCancellable?
    private var signalOfferCancellable: AnyCancellable?
    private var pendingRemoteOffer: SessionDescription?
    private var cancellables = Set<AnyCancellable>()

    // Screen capture monitoring
    private var screenCaptureObserver: NSObjectProtocol?
    private var backgroundObserver: NSObjectProtocol?
    private var foregroundObserver: NSObjectProtocol?

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
        config.maximumCallGroups = 2
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

    func startCall(conversationId: String, userId: String, username: String, isVideo: Bool) {
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

        // Emit call:initiate to server FIRST — creates the CallSession in DB
        MessageSocketManager.shared.emitCallInitiate(conversationId: conversationId, isVideo: isVideo)

        Task { [weak self] in
            guard let self else { return }
            await webRTCService.startLocalMedia(isVideo: isVideo)
            if isVideo { self.hasLocalVideoTrack = true }
            Logger.calls.info("Outgoing call initiated: \(callId) to \(username), waiting for participant joined")
        }

        listenForParticipantJoined(callId: callId, toUserId: userId, isVideo: isVideo)
        HapticFeedback.medium()
    }

    // MARK: - VoIP Push Incoming Call

    func reportIncomingVoIPCall(callId: String, callerUserId: String, callerName: String, isVideo: Bool) {
        let uuid = UUID()
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: callerUserId)
        update.localizedCallerName = callerName
        update.hasVideo = isVideo
        update.supportsGrouping = false
        update.supportsHolding = false

        guard callState == .idle else {
            // Busy: report + immediately end the secondary call
            callProvider.reportNewIncomingCall(with: uuid, update: update) { _ in }
            callProvider.reportCall(with: uuid, endedAt: nil, reason: .unanswered)
            pendingIncomingCall = (callId: callId, fromUserId: callerUserId, fromUsername: callerName, isVideo: isVideo)
            showCallWaitingBanner = true
            Logger.calls.info("VoIP push while busy — ended secondary call, showing banner")
            HapticFeedback.medium()
            return
        }

        // Set state BEFORE reporting to CallKit to avoid race
        currentCallId = callId
        remoteUserId = callerUserId
        remoteUsername = callerName
        isVideoEnabled = isVideo
        isMuted = false
        isSpeaker = isVideo
        callState = .ringing(isOutgoing: false)
        activeCallUUID = uuid

        callProvider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            guard let error else { return }
            Logger.calls.error("CallKit VoIP report failed: \(error.localizedDescription)")
            Task { @MainActor [weak self] in
                self?.endCallInternal(reason: .failed("CallKit error"))
            }
        }

        // Auto-join call room + configure WebRTC so SDP offer can be received while ringing
        webRTCService.configure(isVideo: isVideo)
        Task { [weak self] in
            guard let self else { return }
            await self.webRTCService.startLocalMedia(isVideo: isVideo)
            if isVideo { self.hasLocalVideoTrack = true }
            MessageSocketManager.shared.emitCallJoin(callId: callId)
            Logger.calls.info("VoIP push — auto-joined room, awaiting SDP offer: \(callId)")
        }

        Logger.calls.info("VoIP push incoming call reported: \(callId) from \(callerName)")
        HapticFeedback.medium()
    }

    // MARK: - Incoming Call (Socket)

    @Published var showCallWaitingBanner = false

    func handleIncomingCallNotification(callId: String, fromUserId: String, fromUsername: String, isVideo: Bool) {
        guard callState == .idle else {
            Logger.calls.info("Incoming call while busy — showing call waiting banner")
            pendingIncomingCall = (callId: callId, fromUserId: fromUserId, fromUsername: fromUsername, isVideo: isVideo)
            showCallWaitingBanner = true
            HapticFeedback.medium()
            return
        }

        currentCallId = callId
        remoteUserId = fromUserId
        remoteUsername = fromUsername
        isVideoEnabled = isVideo
        isMuted = false
        isSpeaker = isVideo
        callState = .ringing(isOutgoing: false)

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

        // Auto-join call room + configure WebRTC so SDP offer can be received while ringing
        webRTCService.configure(isVideo: isVideo)
        Task { [weak self] in
            guard let self else { return }
            await self.webRTCService.startLocalMedia(isVideo: isVideo)
            if isVideo { self.hasLocalVideoTrack = true }
            MessageSocketManager.shared.emitCallJoin(callId: callId)
            Logger.calls.info("Incoming call — auto-joined room, awaiting SDP offer: \(callId)")
        }

        Logger.calls.info("Incoming call notification from \(fromUsername): \(callId)")
        HapticFeedback.medium()
    }

    // MARK: - Signal Offer (real SDP from caller after auto-join)

    func handleSignalOffer(callId: String, sdp: SessionDescription) {
        guard currentCallId == callId else {
            Logger.calls.warning("Signal offer for unknown call: \(callId)")
            return
        }
        guard let userId = remoteUserId else { return }

        switch callState {
        case .ringing:
            // User hasn't accepted yet — buffer the offer
            pendingRemoteOffer = sdp
            Logger.calls.info("SDP offer buffered for call: \(callId), waiting for user to accept")

        case .connecting:
            // User already accepted but SDP arrived late — create answer immediately
            Task { [weak self] in
                guard let self else { return }
                guard let answer = await self.webRTCService.createAnswer(from: sdp) else {
                    self.endCallInternal(reason: .failed("Failed to create SDP answer"))
                    return
                }
                self.emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
                Logger.calls.info("SDP answer created from late offer for call: \(callId)")
            }

        default:
            Logger.calls.warning("Signal offer received in unexpected state: \(String(describing: self.callState))")
        }
    }

    func handleIncomingOffer(callId: String, fromUserId: String, fromUsername: String, isVideo: Bool, sdp: SessionDescription) {
        handleIncomingCallNotification(callId: callId, fromUserId: fromUserId, fromUsername: fromUsername, isVideo: isVideo)
    }

    // MARK: - Answer Call

    func answerCall() {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard let callId = currentCallId, let userId = remoteUserId else { return }

        callState = .connecting

        if let uuid = activeCallUUID {
            let answerAction = CXAnswerCallAction(call: uuid)
            let transaction = CXTransaction(action: answerAction)
            callController.request(transaction) { error in
                if let error { Logger.calls.error("CallKit answer failed: \(error.localizedDescription)") }
            }
        }

        if let remoteOffer = pendingRemoteOffer {
            // SDP offer already received while ringing — create answer immediately
            Task { [weak self] in
                guard let self else { return }
                guard let answer = await self.webRTCService.createAnswer(from: remoteOffer) else {
                    self.endCallInternal(reason: .failed("Failed to create SDP answer"))
                    return
                }
                self.emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
                self.pendingRemoteOffer = nil
                Logger.calls.info("Call answered with buffered SDP offer: \(callId)")
            }
        } else {
            // SDP offer not yet received — wait for it via handleSignalOffer with 30s timeout
            Logger.calls.info("Call answered but SDP offer not yet received, waiting: \(callId)")
            signalOfferCancellable?.cancel()
            signalOfferCancellable = nil
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(30))
                guard let self, case .connecting = self.callState, self.currentCallId == callId else { return }
                Logger.calls.error("SDP offer timeout after 30s for call: \(callId)")
                self.endCallInternal(reason: .failed(String(localized: "call.error.timeout")))
            }
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
    var localVideoTrack: Any? { webRTCService.localVideoTrack }
    var remoteVideoTrack: Any? { webRTCService.remoteVideoTrack }

    // MARK: - Audio Effects

    func setAudioEffect(_ effect: AudioEffectConfig?) {
        webRTCService.setAudioEffect(effect)
        activeAudioEffect = effect
        HapticFeedback.light()
    }

    func updateAudioEffectParams(_ config: AudioEffectConfig) {
        webRTCService.updateAudioEffectParams(config)
        activeAudioEffect = config
    }

    func clearAudioEffect() {
        setAudioEffect(nil)
    }

    // MARK: - Call Waiting (§11.15)

    func rejectPendingCall() {
        guard let pending = pendingIncomingCall else { return }
        MessageSocketManager.shared.emitCallEnd(callId: pending.callId)
        pendingIncomingCall = nil
        showCallWaitingBanner = false
        Logger.calls.info("Rejected pending call: \(pending.callId)")
    }

    func endCurrentAndAnswerPending() {
        guard let pending = pendingIncomingCall else { return }
        showCallWaitingBanner = false

        endCall()

        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(0.5))
            guard let self else { return }
            self.handleIncomingCallNotification(
                callId: pending.callId,
                fromUserId: pending.fromUserId,
                fromUsername: pending.fromUsername,
                isVideo: pending.isVideo
            )
            self.pendingIncomingCall = nil
        }
    }

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
        playNotificationHaptic(.warning)
        Logger.calls.info("Call ended by remote: \(callId)")
    }

    // MARK: - Private: State Transitions

    private func transitionToConnected() {
        callState = .connected
        playHaptic(.heavy)
        startScreenCaptureMonitoring()
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
        startBackgroundMonitoring()

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
                let fromId = AuthManager.shared.currentUser?.id ?? ""
                let remoteId = self.remoteUserId ?? ""
                MessageSocketManager.shared.emitCallSignal(
                    callId: callId,
                    type: "heartbeat",
                    payload: ["from": fromId, "to": remoteId]
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

    // MARK: - Haptic Helpers

    private func playHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    private func playNotificationHaptic(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        UINotificationFeedbackGenerator().notificationOccurred(type)
    }

    // MARK: - Screen Capture Monitoring

    private func startScreenCaptureMonitoring() {
        screenCaptureObserver = NotificationCenter.default.addObserver(
            forName: UIScreen.capturedDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let isCapturing = UIScreen.main.isCaptured
                Logger.calls.info("Screen capture state changed: \(isCapturing)")
                if let callId = self.currentCallId, let remoteId = self.remoteUserId {
                    let fromId = AuthManager.shared.currentUser?.id ?? ""
                    MessageSocketManager.shared.emitCallSignal(
                        callId: callId,
                        type: "screen-capture-detected",
                        payload: ["isCapturing": isCapturing ? "true" : "false", "from": fromId, "to": remoteId]
                    )
                }
            }
        }
    }

    private func stopScreenCaptureMonitoring() {
        if let observer = screenCaptureObserver {
            NotificationCenter.default.removeObserver(observer)
            screenCaptureObserver = nil
        }
    }

    // MARK: - Background/Foreground Monitoring (H1)

    private func startBackgroundMonitoring() {
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let callId = self.currentCallId, let remoteId = self.remoteUserId else { return }
                let fromId = AuthManager.shared.currentUser?.id ?? ""
                MessageSocketManager.shared.emitCallSignal(
                    callId: callId,
                    type: "backgrounded",
                    payload: ["from": fromId, "to": remoteId]
                )
                Logger.calls.info("Call backgrounded — notified server for extended heartbeat timeout")
            }
        }

        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let callId = self.currentCallId, let remoteId = self.remoteUserId else { return }
                let fromId = AuthManager.shared.currentUser?.id ?? ""
                MessageSocketManager.shared.emitCallSignal(
                    callId: callId,
                    type: "foregrounded",
                    payload: ["from": fromId, "to": remoteId]
                )
                Logger.calls.info("Call foregrounded — resumed normal heartbeat timeout")
            }
        }
    }

    private func stopBackgroundMonitoring() {
        if let observer = backgroundObserver {
            NotificationCenter.default.removeObserver(observer)
            backgroundObserver = nil
        }
        if let observer = foregroundObserver {
            NotificationCenter.default.removeObserver(observer)
            foregroundObserver = nil
        }
    }

    // MARK: - Metered Connection Check (M4)

    func isOnMeteredConnection() -> Bool {
        let path = networkMonitor.currentPath
        return path.isExpensive
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
        stopScreenCaptureMonitoring()
        stopBackgroundMonitoring()
        if transcriptionService.isTranscribing {
            transcriptionService.stopTranscribing()
        }
        participantJoinedCancellable?.cancel()
        participantJoinedCancellable = nil
        signalOfferCancellable?.cancel()
        signalOfferCancellable = nil
        pendingRemoteOffer = nil
        thermalMonitor.stopMonitoring()
        activeAudioEffect = nil
        hasLocalVideoTrack = false
        hasRemoteVideoTrack = false
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
                self?.handleIncomingCallNotification(
                    callId: event.callId,
                    fromUserId: event.initiator.userId,
                    fromUsername: event.initiator.username,
                    isVideo: isVideo
                )
            }
            .store(in: &cancellables)

        socket.callSignalOfferReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let sdpString = event.signal.sdp else { return }
                let sdp = SessionDescription(type: .offer, sdp: sdpString)
                self?.handleSignalOffer(callId: event.callId, sdp: sdp)
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

    private func emitCallOffer(callId: String, toUserId: String, isVideo: Bool, sdp: SessionDescription) {
        let fromUserId = AuthManager.shared.currentUser?.id ?? ""
        MessageSocketManager.shared.emitCallSignal(
            callId: callId,
            type: "offer",
            payload: ["sdp": sdp.sdp, "to": toUserId, "from": fromUserId]
        )
    }

    private func emitCallAnswer(callId: String, toUserId: String, sdp: SessionDescription) {
        let fromUserId = AuthManager.shared.currentUser?.id ?? ""
        MessageSocketManager.shared.emitCallSignal(
            callId: callId,
            type: "answer",
            payload: ["sdp": sdp.sdp, "to": toUserId, "from": fromUserId]
        )
    }

    private func emitCallReject(callId: String, toUserId: String) {
        MessageSocketManager.shared.emitCallLeave(callId: callId)
    }

    private func emitCallEnd(callId: String, toUserId: String) {
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
            if state == .critical {
                self.webRTCService.videoFilterPipeline.reset()
                self.activeAudioEffect = nil
                self.webRTCService.setAudioEffect(nil)
                Logger.calls.warning("Thermal critical — disabled all filters (video + audio)")
                if self.isVideoEnabled {
                    self.isVideoEnabled = false
                    self.webRTCService.enableVideo(false)
                    Logger.calls.warning("Thermal critical — disabled video")
                }
            } else if state == .serious {
                self.webRTCService.videoFilterPipeline.config.backgroundBlurEnabled = false
                self.webRTCService.videoFilterPipeline.config.skinSmoothingEnabled = false
                Logger.calls.warning("Thermal serious — disabled advanced filters")
            }
        }
    }
}

// MARK: - WebRTCServiceDelegate

extension CallManager: WebRTCServiceDelegate {
    nonisolated func webRTCService(_ service: WebRTCService, didGenerateCandidate candidate: IceCandidate) {
        Task { @MainActor [weak self] in
            guard let self, let callId = self.currentCallId, let userId = self.remoteUserId else { return }
            let fromUserId = AuthManager.shared.currentUser?.id ?? ""
            var payload: [String: String] = [
                "candidate": candidate.candidate,
                "sdpMLineIndex": String(candidate.sdpMLineIndex),
                "to": userId,
                "from": fromUserId
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

    nonisolated func webRTCService(_ service: WebRTCService, didReceiveTranscriptionData data: Data) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard let message = try? JSONDecoder().decode(DataChannelTranscriptionMessage.self, from: data) else { return }
            let segment = TranscriptionSegment(
                id: UUID(),
                text: message.text,
                speakerId: message.speakerId,
                startTime: message.startTime,
                endTime: message.startTime + 1.0,
                isFinal: message.isFinal,
                confidence: 1.0,
                language: message.language,
                translatedText: message.translatedText,
                translatedLanguage: message.translatedLanguage
            )
            self.transcriptionService.receiveRemoteSegment(segment)
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didReceiveRemoteVideoTrack track: Any) {
        Task { @MainActor [weak self] in
            self?.hasRemoteVideoTrack = true
            Logger.calls.info("Remote video track received in CallManager")
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didChangeQualityLevel level: VideoQualityLevel, from previous: VideoQualityLevel) {
        Task { @MainActor [weak self] in
            guard self != nil else { return }
            guard UIAccessibility.isReduceMotionEnabled == false else { return }
            switch level {
            case .poor, .critical:
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            case .excellent, .good:
                if previous <= .fair {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                }
            case .fair:
                break
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
        playHaptic(.light)
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
