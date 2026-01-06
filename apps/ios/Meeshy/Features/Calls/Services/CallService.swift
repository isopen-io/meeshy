//
//  CallService.swift
//  Meeshy
//
//  Main call service coordinating CallKit, WebRTC, and Socket.IO signaling
//  Aligned with gateway CallEventsHandler implementation
//
//  Minimum iOS 16+
//

import Foundation
import AVFoundation
import Combine
import UIKit

// MARK: - Call Notifications
// Note: didReceiveCall and initiateCall are defined in NotificationManager.swift

extension Notification.Name {
    static let callDidConnect = Notification.Name("callDidConnect")
    static let callDidEnd = Notification.Name("callDidEnd")
}

// MARK: - Call Service

@MainActor
final class CallService: ObservableObject {
    static let shared = CallService()

    // MARK: - Published Properties

    @Published var activeCall: Call?
    @Published var incomingCall: Call?
    @Published var callState: Call.CallStatus = .ended
    @Published var callInfo: ActiveCallInfo = ActiveCallInfo()
    @Published var callDuration: TimeInterval = 0

    // Video track state - triggers UI updates when tracks change
    @Published var hasLocalVideo: Bool = false
    @Published var hasRemoteVideo: Bool = false

    // MARK: - Private Properties

    private var callTimer: Timer?
    private var cancellables = Set<AnyCancellable>()
    private var ringingTimeoutTask: Task<Void, Never>?

    private let signalingService = CallSignalingService.shared
    private let webRTCManager = WebRTCManager.shared
    private let callKitManager = CallKitManager.shared

    private var isInitiator = false

    // MARK: - Initialization

    private init() {
        setupCallKitHandlers()
        setupSignalingDelegate()
        setupWebRTCDelegate()
        setupNotifications()
    }

    // MARK: - Setup

    private func setupCallKitHandlers() {
        callKitManager.onAnswerCall = { [weak self] uuid in
            Task { @MainActor in
                await self?.handleAnswerCall(uuid: uuid)
            }
        }

        callKitManager.onEndCall = { [weak self] uuid in
            Task { @MainActor in
                await self?.handleEndCall(uuid: uuid)
            }
        }

        callKitManager.onSetMuted = { [weak self] uuid, isMuted in
            Task { @MainActor in
                guard let self = self else { return }
                self.callInfo.isMuted = isMuted
                self.webRTCManager.isMuted = isMuted

                // Only send to signaling service when call is connected
                // This prevents errors when toggling mute before the call is established
                if self.callState == .connected {
                    self.signalingService.toggleAudio(enabled: !isMuted)
                } else {
                    callLogger.debug("Mute state updated locally (call not yet connected)")
                }
            }
        }

        callKitManager.onSetHeld = { [weak self] uuid, isOnHold in
            Task { @MainActor in
                callLogger.info("Call held: \(isOnHold)")
            }
        }
    }

    private func setupSignalingDelegate() {
        signalingService.delegate = self
    }

    private func setupWebRTCDelegate() {
        webRTCManager.delegate = self
    }

    private func setupNotifications() {
        let receiveCallCancellable = NotificationCenter.default.publisher(for: .didReceiveCall)
            .sink { [weak self] notification in
                Task { @MainActor in
                    await self?.handleIncomingCallNotification(notification.userInfo)
                }
            }
        cancellables.insert(receiveCallCancellable)

        let initiateCallCancellable = NotificationCenter.default.publisher(for: .initiateCall)
            .sink { [weak self] notification in
                Task { @MainActor in
                    if let conversationId = notification.userInfo?["conversationId"] as? String {
                        let type = notification.userInfo?["type"] as? String ?? "audio"
                        let recipientName = notification.userInfo?["recipientName"] as? String
                        let recipientAvatar = notification.userInfo?["recipientAvatar"] as? String
                        await self?.initiateCall(
                            conversationId: conversationId,
                            type: type == "video" ? .video : .audio,
                            recipientName: recipientName,
                            recipientAvatar: recipientAvatar
                        )
                    }
                }
            }
        cancellables.insert(initiateCallCancellable)
    }

    // MARK: - Set User ID

    /// Set the current user ID for signaling
    func setCurrentUserId(_ userId: String) {
        signalingService.setCurrentUserId(userId)
    }

    // MARK: - Initiate Call

    /// Initiate a new call
    /// - Parameters:
    ///   - conversationId: The conversation to start the call in
    ///   - type: Call type (audio or video)
    ///   - recipientName: The name to display in call UI (optional - will use conversationId if not provided)
    ///   - recipientAvatar: The avatar URL to display in call UI (optional)
    func initiateCall(conversationId: String, type: Call.CallType, recipientName: String? = nil, recipientAvatar: String? = nil) async {
        let callUUID = UUID()

        // Configure WebRTC with ICE servers
        webRTCManager.configure(with: signalingService.iceServers)

        // Create call object (will be updated when we receive call:initiated)
        var call = Call(
            id: callUUID.uuidString, // Temporary ID, will be replaced by server's callId
            conversationId: conversationId,
            initiatorId: "current-user", // Will be set properly by server
            participants: [],
            type: type,
            status: .initiated,
            startedAt: nil,
            endedAt: nil,
            createdAt: Date(),
            callUUID: callUUID
        )

        // Set display info for UI
        call.displayName = recipientName
        call.displayAvatar = recipientAvatar

        activeCall = call
        callState = .initiated
        isInitiator = true

        // Clean up any existing peer connection from previous calls
        // This ensures we don't get "Peer connection already exists" errors
        webRTCManager.disconnect()

        // Enable video by default for video calls
        if type == .video {
            callInfo.isVideoEnabled = true
            webRTCManager.isVideoEnabled = true
            hasLocalVideo = true
        }

        // Setup WebRTC peer connection early to enable camera preview
        // This ensures the local video track is available before the remote party answers
        webRTCManager.setupPeerConnection()

        // Report to CallKit
        callKitManager.startCall(
            uuid: callUUID,
            handle: conversationId,
            hasVideo: type == .video
        )

        // Initiate call via signaling service
        signalingService.initiateCall(
            conversationId: conversationId,
            type: type == .video ? "video" : "audio"
        )

        // Start ringing timeout
        startRingingTimeout()

        callLogger.info("Initiated call in conversation: \(conversationId), type: \(type)")
    }

    private func startRingingTimeout() {
        // Cancel any existing timeout
        cancelRingingTimeout()

        ringingTimeoutTask = Task { [weak self] in
            do {
                // Wait 30 seconds for ringing timeout
                try await Task.sleep(nanoseconds: 30_000_000_000)

                guard let self = self else { return }
                guard !Task.isCancelled else { return }

                if self.callState == .ringing || self.callState == .initiated {
                    callLogger.warn("Call ringing timeout")
                    await self.endCall()
                }
            } catch {
                // Task was cancelled, which is expected
            }
        }
    }

    private func cancelRingingTimeout() {
        ringingTimeoutTask?.cancel()
        ringingTimeoutTask = nil
    }

    // MARK: - Handle Incoming Call

    func handleIncomingCallNotification(_ data: [AnyHashable: Any]?) async {
        guard let data = data,
              let callId = data["callId"] as? String,
              let conversationId = data["conversationId"] as? String,
              let initiatorInfo = data["initiator"] as? [String: Any],
              let callType = data["type"] as? String else {
            callLogger.error("Invalid incoming call data")
            return
        }

        let type: Call.CallType = callType == "video" ? .video : .audio
        let callUUID = UUID()

        // Extract initiator info
        let initiatorId = initiatorInfo["userId"] as? String ?? ""
        let initiatorName = initiatorInfo["username"] as? String ?? "Unknown"
        let initiatorAvatar = initiatorInfo["avatar"] as? String

        var call = Call(
            id: callId,
            conversationId: conversationId,
            initiatorId: initiatorId,
            participants: [
                Call.CallParticipant(
                    id: initiatorId,
                    userId: initiatorId,
                    name: initiatorName,
                    avatarUrl: initiatorAvatar,
                    joinedAt: Date(),
                    leftAt: nil,
                    isMuted: false,
                    isVideoEnabled: type == .video
                )
            ],
            type: type,
            status: .ringing,
            startedAt: nil,
            endedAt: nil,
            createdAt: Date(),
            callUUID: callUUID
        )

        // Set display info - show the caller's info to the recipient
        call.displayName = initiatorName
        call.displayAvatar = initiatorAvatar

        incomingCall = call
        callState = .ringing
        isInitiator = false

        // Configure WebRTC with ICE servers
        webRTCManager.configure(with: signalingService.iceServers)

        // Report to CallKit
        callKitManager.reportIncomingCall(
            uuid: callUUID,
            handle: initiatorName,
            hasVideo: type == .video
        ) { error in
            if let error = error {
                callLogger.error("Failed to report incoming call: \(error)")
            }
        }

        callLogger.info("Received incoming call: \(callId) from \(initiatorName)")
    }

    // MARK: - Answer Call

    func answerCall() async {
        guard let call = incomingCall ?? activeCall,
              let callId = signalingService.currentCallId ?? activeCall?.id else {
            callLogger.error("No call to answer")
            return
        }

        // Cancel the ringing timeout since call is being answered
        cancelRingingTimeout()

        callState = .connected
        activeCall = call
        incomingCall = nil

        // Answer via CallKit
        if let callUUID = call.callUUID {
            callKitManager.answerCall(uuid: callUUID)
        }

        // Join the call via signaling
        signalingService.joinCall(callId: callId)

        // Setup WebRTC peer connection
        webRTCManager.setupPeerConnection()

        // Start call duration timer
        startCallTimer()

        // Configure video if needed - sync all states for video calls
        if call.type == .video {
            callInfo.isVideoEnabled = true
            webRTCManager.isVideoEnabled = true
            hasLocalVideo = true
        }

        callLogger.info("Answered call: \(callId)")
    }

    private func handleAnswerCall(uuid: UUID) async {
        await answerCall()
    }

    // MARK: - Decline Call

    func declineCall() async {
        guard let call = incomingCall ?? activeCall else {
            callLogger.error("No call to decline")
            return
        }

        cancelRingingTimeout()
        callState = .declined
        incomingCall = nil
        activeCall = nil

        // Decline via CallKit
        if let callUUID = call.callUUID {
            callKitManager.declineCall(uuid: callUUID)
        }

        // Leave the call via signaling if we were in it
        if signalingService.currentCallId != nil {
            signalingService.leaveCall()
        }

        callLogger.info("Declined call: \(call.id)")
    }

    // MARK: - End Call

    func endCall() async {
        guard let call = activeCall ?? incomingCall else {
            callLogger.error("No call to end")
            return
        }

        cancelRingingTimeout()
        stopCallTimer()
        callState = .ended

        // End via CallKit
        if let callUUID = call.callUUID {
            callKitManager.endCall(uuid: callUUID) { [weak self] in
                Task { @MainActor in
                    self?.cleanup()
                }
            }
        } else {
            cleanup()
        }

        // End/leave the call via signaling
        if isInitiator {
            signalingService.endCall()
        } else {
            signalingService.leaveCall()
        }

        // Disconnect WebRTC
        webRTCManager.disconnect()

        // Save to call history
        await saveCallToHistory(call)

        callLogger.info("Ended call: \(call.id)")
    }

    private func handleEndCall(uuid: UUID) async {
        await endCall()
    }

    private func cleanup() {
        activeCall = nil
        incomingCall = nil
        callInfo = ActiveCallInfo()
        callDuration = 0
        isInitiator = false
        hasLocalVideo = false
        hasRemoteVideo = false
    }

    private func saveCallToHistory(_ call: Call) async {
        do {
            let callRecord = CallRecord(
                id: UUID().uuidString,
                call: call,
                isFavorite: false,
                quality: determineCallQuality(duration: callDuration)
            )

            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601

            let callData = try encoder.encode(callRecord)

            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/calls/history") else {
                callLogger.error("Invalid call history URL")
                return
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = AuthenticationManager.shared.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            request.httpBody = callData

            let (_, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                callLogger.info("Call history saved successfully")
            } else {
                callLogger.warn("Failed to save call history to backend")
            }
        } catch {
            callLogger.error("Error saving call to history: \(error)")
        }
    }

    private func determineCallQuality(duration: TimeInterval) -> CallRecord.CallQuality {
        if duration > 300 { // 5+ minutes
            return .excellent
        } else if duration > 60 { // 1+ minutes
            return .good
        } else if duration > 10 { // 10+ seconds
            return .fair
        } else {
            return .poor
        }
    }

    // MARK: - Call Controls

    func toggleMute() {
        callInfo.isMuted.toggle()
        webRTCManager.isMuted = callInfo.isMuted

        // Only send to signaling service when call is connected
        // This prevents errors when toggling mute before the call is established
        if callState == .connected {
            signalingService.toggleAudio(enabled: !callInfo.isMuted)
        } else {
            callLogger.debug("Mute state updated locally (call not yet connected)")
        }

        if let call = activeCall, let callUUID = call.callUUID {
            callKitManager.setMuted(uuid: callUUID, isMuted: callInfo.isMuted)
        }

        // Haptic feedback
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()

        callLogger.info("Toggled mute: \(callInfo.isMuted)")
    }

    func toggleSpeaker() {
        callInfo.isSpeakerOn.toggle()

        let audioSession = AVAudioSession.sharedInstance()
        do {
            if callInfo.isSpeakerOn {
                try audioSession.overrideOutputAudioPort(.speaker)
            } else {
                try audioSession.overrideOutputAudioPort(.none)
            }
        } catch {
            callLogger.error("Failed to toggle speaker: \(error)")
        }

        // Haptic feedback
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()

        callLogger.info("Toggled speaker: \(callInfo.isSpeakerOn)")
    }

    func toggleVideo() {
        guard let call = activeCall, call.type == .video else { return }

        callInfo.isVideoEnabled.toggle()
        webRTCManager.isVideoEnabled = callInfo.isVideoEnabled

        // Only send to signaling service when call is connected
        // This prevents errors when toggling video before the call is established
        if callState == .connected {
            signalingService.toggleVideo(enabled: callInfo.isVideoEnabled)
        } else {
            callLogger.debug("Video state updated locally (call not yet connected)")
        }

        // Update local video state
        hasLocalVideo = callInfo.isVideoEnabled

        // Update CallKit
        if let callUUID = call.callUUID {
            callKitManager.updateCall(uuid: callUUID, hasVideo: callInfo.isVideoEnabled)
        }

        // Haptic feedback
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()

        callLogger.info("Toggled video: \(callInfo.isVideoEnabled)")
    }

    func switchCamera() {
        callInfo.isLocalVideoMirrored.toggle()
        webRTCManager.switchCamera()

        callLogger.info("Switched camera")
    }

    // MARK: - Video Track Access

    /// Get the local video track for rendering
    func getLocalVideoTrack() -> RTCVideoTrack? {
        return webRTCManager.getLocalVideoTrack()
    }

    /// Get the remote video track for rendering
    func getRemoteVideoTrack() -> RTCVideoTrack? {
        return webRTCManager.getRemoteVideoTrack()
    }

    /// Check if using front camera (for mirroring local preview)
    var isFrontCamera: Bool {
        return callInfo.isLocalVideoMirrored
    }

    // MARK: - Call Timer

    private func startCallTimer() {
        callDuration = 0
        callTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            Task { @MainActor in
                self.callDuration += 1
            }
        }
    }

    private func stopCallTimer() {
        callTimer?.invalidate()
        callTimer = nil
    }

    func formattedCallDuration() -> String {
        // Show status text based on call state
        switch callState {
        case .initiated:
            return NSLocalizedString("Calling...", comment: "Call initiated, waiting for response")
        case .ringing:
            return NSLocalizedString("Ringing...", comment: "Call is ringing on recipient's device")
        case .connected:
            let minutes = Int(callDuration) / 60
            let seconds = Int(callDuration) % 60
            return String(format: "%02d:%02d", minutes, seconds)
        case .ended:
            return NSLocalizedString("Call ended", comment: "Call has ended")
        case .declined:
            return NSLocalizedString("Declined", comment: "Call was declined")
        case .failed:
            return NSLocalizedString("Failed", comment: "Call failed")
        case .missed:
            return NSLocalizedString("Missed", comment: "Call was missed")
        case .busy:
            return NSLocalizedString("Busy", comment: "Recipient is busy")
        case .unreachable:
            return NSLocalizedString("Unreachable", comment: "Recipient is unreachable")
        }
    }

    /// Returns the call status text for display
    var callStatusText: String {
        formattedCallDuration()
    }

    /// Returns true if the call is in a connecting state (not yet connected)
    var isConnecting: Bool {
        callState == .initiated || callState == .ringing
    }
}

// MARK: - CallSignalingDelegate

extension CallService: CallSignalingDelegate {

    func signalingService(_ service: CallSignalingService, didReceiveCallInitiated event: CallInitiatedEvent) {
        // Update active call with server's callId
        if isInitiator {
            // Preserve display info from the initial call
            let savedDisplayName = activeCall?.displayName
            let savedDisplayAvatar = activeCall?.displayAvatar
            let savedType = activeCall?.type ?? .audio
            let savedCallUUID = activeCall?.callUUID

            var updatedCall = Call(
                id: event.callId,
                conversationId: event.conversationId,
                initiatorId: event.initiator.userId,
                participants: event.participants.map { participant in
                    Call.CallParticipant(
                        id: participant.id,
                        userId: participant.userId ?? participant.anonymousId ?? "",
                        name: participant.displayName ?? participant.username ?? "Unknown",
                        avatarUrl: participant.avatar,
                        joinedAt: participant.joinedAt,
                        leftAt: participant.leftAt,
                        isMuted: !participant.isAudioEnabled,
                        isVideoEnabled: participant.isVideoEnabled
                    )
                },
                type: savedType,
                status: .ringing,
                startedAt: nil,
                endedAt: nil,
                createdAt: Date(),
                callUUID: savedCallUUID
            )

            // Restore display info (set by initiateCall)
            updatedCall.displayName = savedDisplayName
            updatedCall.displayAvatar = savedDisplayAvatar

            activeCall = updatedCall
            callState = .ringing

            // Setup WebRTC and create offer as initiator
            webRTCManager.setupPeerConnection()

            callLogger.info("Call initiated successfully: \(event.callId)")
        } else {
            // We received a call - handle as incoming
            Task {
                await handleIncomingCallNotification([
                    "callId": event.callId,
                    "conversationId": event.conversationId,
                    "type": "audio", // Default, will be updated
                    "initiator": [
                        "userId": event.initiator.userId,
                        "username": event.initiator.username ?? "",
                        "avatar": event.initiator.avatar ?? ""
                    ]
                ])
            }
        }
    }

    func signalingService(_ service: CallSignalingService, didReceiveParticipantJoined event: ParticipantJoinedEvent) {
        callLogger.info("Participant joined: \(event.participant.userId ?? event.participant.anonymousId ?? "unknown")")

        // Update participants list
        if var call = activeCall {
            let newParticipant = Call.CallParticipant(
                id: event.participant.id,
                userId: event.participant.userId ?? event.participant.anonymousId ?? "",
                name: event.participant.displayName ?? event.participant.username ?? "Unknown",
                avatarUrl: event.participant.avatar,
                joinedAt: event.participant.joinedAt,
                leftAt: nil,
                isMuted: !event.participant.isAudioEnabled,
                isVideoEnabled: event.participant.isVideoEnabled
            )

            if !call.participants.contains(where: { $0.id == newParticipant.id }) {
                call.participants.append(newParticipant)
                activeCall = call
            }
        }

        // Update ICE servers if provided
        if let servers = event.iceServers, !servers.isEmpty {
            webRTCManager.configure(with: servers)
        }

        // Set remote participant ID for signaling
        if let remoteId = event.participant.userId ?? event.participant.anonymousId {
            webRTCManager.setRemoteParticipantId(remoteId)

            // If we are the initiator, create and send offer
            if isInitiator {
                webRTCManager.createOffer { [weak self] result in
                    switch result {
                    case .success(let sdp):
                        self?.signalingService.sendOffer(to: remoteId, sdp: sdp.sdp)
                    case .failure(let error):
                        callLogger.error("Failed to create offer: \(error)")
                    }
                }
            }
        }

        callState = .connected
        startCallTimer()
    }

    func signalingService(_ service: CallSignalingService, didReceiveParticipantLeft event: ParticipantLeftEvent) {
        callLogger.info("Participant left: \(event.userId ?? event.anonymousId ?? event.participantId)")

        // Remove participant from list
        if var call = activeCall {
            call.participants.removeAll { $0.id == event.participantId }
            activeCall = call

            // If no more participants, end the call
            if call.participants.isEmpty {
                Task {
                    await endCall()
                }
            }
        }
    }

    func signalingService(_ service: CallSignalingService, didReceiveSignal signal: WebRTCSignal, callId: String) {
        switch signal.type {
        case "offer":
            // Received an offer - set remote description and create answer
            guard let sdp = signal.sdp else {
                callLogger.error("Received offer without SDP")
                return
            }

            let remoteSDP = RTCSessionDescription(type: .offer, sdp: sdp)
            webRTCManager.setRemoteDescription(remoteSDP) { [weak self] error in
                if let error = error {
                    callLogger.error("Failed to set remote description: \(error)")
                    return
                }

                // Create and send answer
                self?.webRTCManager.createAnswer { result in
                    switch result {
                    case .success(let answerSDP):
                        self?.signalingService.sendAnswer(to: signal.from, sdp: answerSDP.sdp)
                    case .failure(let error):
                        callLogger.error("Failed to create answer: \(error)")
                    }
                }
            }

        case "answer":
            // Received an answer - set remote description
            guard let sdp = signal.sdp else {
                callLogger.error("Received answer without SDP")
                return
            }

            let remoteSDP = RTCSessionDescription(type: .answer, sdp: sdp)
            webRTCManager.setRemoteDescription(remoteSDP) { error in
                if let error = error {
                    callLogger.error("Failed to set remote description: \(error)")
                }
            }

        case "ice-candidate":
            // Received an ICE candidate - add it
            guard let candidate = signal.candidate,
                  let sdpMLineIndex = signal.sdpMLineIndex else {
                callLogger.error("Received ICE candidate without required fields")
                return
            }

            let iceCandidate = RTCIceCandidate(
                sdp: candidate,
                sdpMLineIndex: sdpMLineIndex,
                sdpMid: signal.sdpMid
            )
            webRTCManager.addIceCandidate(iceCandidate)

        default:
            callLogger.warn("Unknown signal type: \(signal.type)")
        }
    }

    func signalingService(_ service: CallSignalingService, didReceiveMediaToggled event: MediaToggledEvent) {
        callLogger.info("Media toggled: \(event.mediaType) = \(event.enabled) for \(event.participantId)")

        // Update participant state in call
        if var call = activeCall {
            if let index = call.participants.firstIndex(where: { $0.id == event.participantId || $0.userId == event.participantId }) {
                switch event.mediaType {
                case "audio":
                    call.participants[index].isMuted = !event.enabled
                case "video":
                    call.participants[index].isVideoEnabled = event.enabled
                default:
                    break
                }
                activeCall = call
            }
        }
    }

    func signalingService(_ service: CallSignalingService, didReceiveCallEnded event: CallEndedEvent) {
        callLogger.info("Call ended: \(event.callId), duration: \(event.duration)s")

        // Update call state
        if var call = activeCall {
            call.status = .ended
            call.endedAt = Date()
            call.totalDuration = TimeInterval(event.duration)
            activeCall = call
        }

        // End the call locally
        Task {
            await endCall()
        }
    }

    func signalingService(_ service: CallSignalingService, didReceiveError error: CallErrorEvent) {
        callLogger.error("Call error: \(error.code) - \(error.message)")

        callState = .failed

        // End the call on error
        Task {
            await endCall()
        }
    }

    func signalingService(_ service: CallSignalingService, didReceiveCallAccepted event: CallAcceptedEvent) {
        callLogger.info("Call accepted by: \(event.acceptedBy.username)")

        // Cancel ringing timeout since call was accepted
        cancelRingingTimeout()

        // Update call state - callee accepted, waiting for them to join
        callState = .connected

        // If we're the initiator, prepare for the incoming connection
        if isInitiator {
            // The callee will join and we'll receive participant-joined event
            // WebRTC negotiation will happen then
            callLogger.info("Waiting for callee to join call...")
        }
    }

    func signalingService(_ service: CallSignalingService, didReceiveCallRejected event: CallRejectedEvent) {
        let reasonText = event.reason ?? "declined"
        callLogger.info("Call rejected by: \(event.rejectedBy.username), reason: \(reasonText)")

        // Cancel ringing timeout
        cancelRingingTimeout()

        // Update call state
        callState = .declined

        // End the call and cleanup
        Task {
            await endCall()
        }
    }
}

// MARK: - WebRTCManagerDelegate

extension CallService: WebRTCManagerDelegate {

    func webRTCManager(_ manager: WebRTCManager, didGenerateLocalCandidate candidate: RTCIceCandidate) {
        // Send ICE candidate to remote peer via signaling
        if let remoteId = signalingService.remoteParticipant?.userId ?? signalingService.remoteParticipant?.anonymousId {
            signalingService.sendICECandidate(
                to: remoteId,
                candidate: candidate.sdp,
                sdpMLineIndex: candidate.sdpMLineIndex,
                sdpMid: candidate.sdpMid
            )
        }
    }

    func webRTCManager(_ manager: WebRTCManager, didChangeConnectionState state: RTCIceConnectionState) {
        callLogger.info("WebRTC connection state: \(state.description)")

        switch state {
        case .connected, .completed:
            callState = .connected
            callInfo.connectionQuality = .excellent
        case .disconnected:
            callInfo.connectionQuality = .poor
        case .failed:
            callState = .failed
            Task {
                await endCall()
            }
        case .closed:
            callState = .ended
        default:
            break
        }
    }

    func webRTCManager(_ manager: WebRTCManager, didReceiveRemoteVideoTrack track: RTCVideoTrack) {
        callLogger.info("Received remote video track")
        hasRemoteVideo = true
    }

    func webRTCManager(_ manager: WebRTCManager, didReceiveRemoteAudioTrack track: RTCAudioTrack) {
        callLogger.info("Received remote audio track")
    }

    func webRTCManager(_ manager: WebRTCManager, didUpdateStats stats: WebRTCStats) {
        // Update call quality based on stats
        switch stats.connectionQuality {
        case .excellent:
            callInfo.connectionQuality = .excellent
        case .good:
            callInfo.connectionQuality = .good
        case .fair:
            callInfo.connectionQuality = .fair
        case .poor:
            callInfo.connectionQuality = .poor
        }
    }

    func webRTCManager(_ manager: WebRTCManager, didEncounterError error: Error) {
        callLogger.error("WebRTC error: \(error)")
    }
}

// MARK: - Active Call Info

struct ActiveCallInfo {
    var isMuted: Bool = false
    var isSpeakerOn: Bool = false
    var isVideoEnabled: Bool = false
    var isLocalVideoMirrored: Bool = true
    var isMinimized: Bool = false
    var connectionQuality: CallQuality = .excellent

    enum CallQuality {
        case excellent
        case good
        case fair
        case poor

        var displayName: String {
            switch self {
            case .excellent: return "Excellent"
            case .good: return "Good"
            case .fair: return "Fair"
            case .poor: return "Poor"
            }
        }

        var iconName: String {
            switch self {
            case .excellent: return "wifi"
            case .good: return "wifi"
            case .fair: return "wifi.exclamationmark"
            case .poor: return "wifi.slash"
            }
        }

        var color: String {
            switch self {
            case .excellent: return "green"
            case .good: return "green"
            case .fair: return "orange"
            case .poor: return "red"
            }
        }
    }
}
