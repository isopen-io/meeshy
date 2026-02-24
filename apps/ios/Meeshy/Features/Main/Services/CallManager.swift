import Foundation
import AVFoundation
import CallKit
import Combine
import MeeshySDK
import os

// MARK: - Call State

enum CallState: Equatable {
    case idle
    case ringing(isOutgoing: Bool)
    case connecting
    case connected
    case ended(reason: CallEndReason)

    var isActive: Bool {
        switch self {
        case .idle, .ended: return false
        default: return true
        }
    }
}

enum CallEndReason: Equatable {
    case local
    case remote
    case rejected
    case missed
    case failed(String)
}

// MARK: - Call Signaling Events (Socket.IO)

struct CallOfferEvent: Decodable {
    let callId: String
    let fromUserId: String
    let fromUsername: String
    let isVideo: Bool
    let sdp: [String: String]
}

struct CallAnswerEvent: Decodable {
    let callId: String
    let fromUserId: String
    let sdp: [String: String]
}

struct CallICECandidateEvent: Decodable {
    let callId: String
    let fromUserId: String
    let candidate: [String: Any]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        callId = try container.decode(String.self, forKey: .callId)
        fromUserId = try container.decode(String.self, forKey: .fromUserId)
        // candidate is a flexible dict, decode as raw
        candidate = [:]
    }

    enum CodingKeys: String, CodingKey {
        case callId, fromUserId, candidate
    }
}

struct CallRejectEvent: Decodable {
    let callId: String
    let fromUserId: String
    let reason: String?
}

struct CallEndEvent: Decodable {
    let callId: String
    let fromUserId: String
}

// MARK: - Call Manager

@MainActor
final class CallManager: ObservableObject {
    static let shared = CallManager()

    // MARK: - Published State

    @Published private(set) var callState: CallState = .idle
    @Published private(set) var remoteUserId: String?
    @Published private(set) var remoteUsername: String?
    @Published var isVideoEnabled: Bool = false
    @Published var isMuted: Bool = false
    @Published var isSpeaker: Bool = false
    @Published private(set) var callDuration: TimeInterval = 0
    @Published private(set) var currentCallId: String?

    // MARK: - Internal

    private let webRTCService = WebRTCService()
    private var durationTimer: Timer?
    private var callStartDate: Date?
    private var cancellables = Set<AnyCancellable>()

    // CallKit
    private let callProvider: CXProvider
    private let callController = CXCallController()
    private var activeCallUUID: UUID?

    private init() {
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

        setupSocketListeners()
        Logger.calls.info("CallManager initialized")
    }

    // Must retain strong reference to proxy
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
        isSpeaker = isVideo // Default speaker on for video calls
        callState = .ringing(isOutgoing: true)

        webRTCService.configure(isVideo: isVideo)
        webRTCService.configureAudioSession(speaker: isSpeaker)

        // Report to CallKit
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

        // Create and send offer via Socket.IO
        Task { [weak self] in
            guard let self else { return }
            guard let offer = await webRTCService.createOffer() else {
                endCallInternal(reason: .failed("Impossible de creer l'offre"))
                return
            }
            emitCallOffer(callId: callId, toUserId: userId, isVideo: isVideo, sdp: offer)
            Logger.calls.info("Outgoing call started: \(callId) to \(username)")
        }

        HapticFeedback.medium()
    }

    // MARK: - Incoming Call

    func handleIncomingOffer(callId: String, fromUserId: String, fromUsername: String, isVideo: Bool, sdp: RTCSessionDescription) {
        guard callState == .idle else {
            Logger.calls.warning("Rejecting incoming call: already busy")
            emitCallReject(callId: callId, toUserId: fromUserId, reason: "busy")
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

        // Report incoming call to CallKit
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

        // Store remote SDP for when user answers
        Task { [weak self] in
            await self?.webRTCService.setRemoteDescription(sdp)
        }

        Logger.calls.info("Incoming call from \(fromUsername): \(callId)")
        HapticFeedback.medium()
    }

    // MARK: - Answer Call

    func answerCall() {
        guard case .ringing(isOutgoing: false) = callState else { return }

        callState = .connecting

        // Answer via CallKit
        if let uuid = activeCallUUID {
            let answerAction = CXAnswerCallAction(call: uuid)
            let transaction = CXTransaction(action: answerAction)
            callController.request(transaction) { error in
                if let error { Logger.calls.error("CallKit answer failed: \(error.localizedDescription)") }
            }
        }

        webRTCService.configureAudioSession(speaker: isSpeaker)

        Task { [weak self] in
            guard let self, let callId = currentCallId, let userId = remoteUserId else { return }
            guard let remoteOffer = webRTCService.remoteDescription else {
                endCallInternal(reason: .failed("Pas d'offre distante"))
                return
            }
            guard let answer = await webRTCService.createAnswer(from: remoteOffer) else {
                endCallInternal(reason: .failed("Impossible de creer la reponse"))
                return
            }
            emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
            transitionToConnected()
            Logger.calls.info("Call answered: \(callId)")
        }

        HapticFeedback.success()
    }

    // MARK: - Reject Call

    func rejectCall() {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard let callId = currentCallId, let userId = remoteUserId else { return }

        emitCallReject(callId: callId, toUserId: userId, reason: "declined")

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
        webRTCService.configureAudioSession(speaker: isSpeaker)
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

    // MARK: - Remote Events

    func handleRemoteAnswer(callId: String, sdp: RTCSessionDescription) {
        guard currentCallId == callId else { return }
        Task { [weak self] in
            guard let self else { return }
            await webRTCService.setRemoteDescription(sdp)
            transitionToConnected()
            Logger.calls.info("Remote answer received for: \(callId)")
        }
    }

    func handleRemoteICECandidate(callId: String, candidate: RTCIceCandidate) {
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
        durationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let start = self.callStartDate else { return }
                self.callDuration = Date().timeIntervalSince(start)
            }
        }

        if let uuid = activeCallUUID {
            callProvider.reportOutgoingCall(with: uuid, connectedAt: Date())
        }
    }

    private func endCallInternal(reason: CallEndReason) {
        durationTimer?.invalidate()
        durationTimer = nil
        callStartDate = nil
        webRTCService.close()
        callState = .ended(reason: reason)
        activeCallUUID = nil

        // Reset after a brief delay so the UI shows the end screen
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(2))
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
        // Listen for incoming call events from MessageSocketManager
        // The socket events use the pattern: call:offer, call:answer, call:ice-candidate, call:reject, call:end
        let socket = MessageSocketManager.shared

        NotificationCenter.default.publisher(for: .callOfferReceived)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                guard let data = notification.userInfo,
                      let callId = data["callId"] as? String,
                      let fromUserId = data["fromUserId"] as? String,
                      let fromUsername = data["fromUsername"] as? String,
                      let isVideo = data["isVideo"] as? Bool,
                      let sdpDict = data["sdp"] as? [String: Any],
                      let sdp = RTCSessionDescription.from(dictionary: sdpDict) else { return }
                self?.handleIncomingOffer(callId: callId, fromUserId: fromUserId, fromUsername: fromUsername, isVideo: isVideo, sdp: sdp)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .callAnswerReceived)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                guard let data = notification.userInfo,
                      let callId = data["callId"] as? String,
                      let sdpDict = data["sdp"] as? [String: Any],
                      let sdp = RTCSessionDescription.from(dictionary: sdpDict) else { return }
                self?.handleRemoteAnswer(callId: callId, sdp: sdp)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .callICECandidateReceived)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                guard let data = notification.userInfo,
                      let callId = data["callId"] as? String,
                      let candidateDict = data["candidate"] as? [String: Any],
                      let candidate = RTCIceCandidate.from(dictionary: candidateDict) else { return }
                self?.handleRemoteICECandidate(callId: callId, candidate: candidate)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .callRejectReceived)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                guard let data = notification.userInfo,
                      let callId = data["callId"] as? String else { return }
                self?.handleRemoteReject(callId: callId)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .callEndReceived)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                guard let data = notification.userInfo,
                      let callId = data["callId"] as? String else { return }
                self?.handleRemoteEnd(callId: callId)
            }
            .store(in: &cancellables)

        // Register socket event handlers on MessageSocketManager
        // These are forwarded via NotificationCenter to stay decoupled
        _ = socket
    }

    // MARK: - Socket Emit Helpers

    private nonisolated func emitCallOffer(callId: String, toUserId: String, isVideo: Bool, sdp: RTCSessionDescription) {
        let payload: [String: Any] = [
            "callId": callId,
            "toUserId": toUserId,
            "isVideo": isVideo,
            "sdp": sdp.toDictionary()
        ]
        NotificationCenter.default.post(name: .callEmitOffer, object: nil, userInfo: payload)
    }

    private nonisolated func emitCallAnswer(callId: String, toUserId: String, sdp: RTCSessionDescription) {
        let payload: [String: Any] = [
            "callId": callId,
            "toUserId": toUserId,
            "sdp": sdp.toDictionary()
        ]
        NotificationCenter.default.post(name: .callEmitAnswer, object: nil, userInfo: payload)
    }

    private nonisolated func emitCallReject(callId: String, toUserId: String, reason: String) {
        let payload: [String: Any] = [
            "callId": callId,
            "toUserId": toUserId,
            "reason": reason
        ]
        NotificationCenter.default.post(name: .callEmitReject, object: nil, userInfo: payload)
    }

    private nonisolated func emitCallEnd(callId: String, toUserId: String) {
        let payload: [String: Any] = [
            "callId": callId,
            "toUserId": toUserId
        ]
        NotificationCenter.default.post(name: .callEmitEnd, object: nil, userInfo: payload)
    }

    // MARK: - Duration Formatting

    var formattedDuration: String {
        let minutes = Int(callDuration) / 60
        let seconds = Int(callDuration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

// MARK: - CallKit Delegate Proxy

private class CallKitDelegateProxy: NSObject, CXProviderDelegate {
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
        Task { @MainActor [weak self] in
            guard let manager = self?.manager else { return }
            if manager.isMuted != action.isMuted {
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

// MARK: - Notification Names for Call Signaling

extension Notification.Name {
    // Incoming from socket
    static let callOfferReceived = Notification.Name("callOfferReceived")
    static let callAnswerReceived = Notification.Name("callAnswerReceived")
    static let callICECandidateReceived = Notification.Name("callICECandidateReceived")
    static let callRejectReceived = Notification.Name("callRejectReceived")
    static let callEndReceived = Notification.Name("callEndReceived")

    // Outgoing to socket
    static let callEmitOffer = Notification.Name("callEmitOffer")
    static let callEmitAnswer = Notification.Name("callEmitAnswer")
    static let callEmitReject = Notification.Name("callEmitReject")
    static let callEmitEnd = Notification.Name("callEmitEnd")
}

// MARK: - Logger Extension

private extension Logger {
    static let calls = Logger(subsystem: "com.meeshy.app", category: "calls")
}
