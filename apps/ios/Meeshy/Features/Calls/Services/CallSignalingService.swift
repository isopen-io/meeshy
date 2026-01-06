//
//  CallSignalingService.swift
//  Meeshy
//
//  Socket.IO-based signaling service for WebRTC calls
//  Handles all call-related Socket.IO events matching gateway implementation
//
//  Minimum iOS 16+
//

import Foundation
import Combine

// MARK: - Sendable Wrapper

private struct UncheckedSendableAny: @unchecked Sendable {
    let value: Any
}

// MARK: - Call Signaling Types

/// ICE Server configuration from gateway
struct ICEServerConfig: Codable {
    let urls: String
    let username: String?
    let credential: String?

    enum CodingKeys: String, CodingKey {
        case urls
        case username
        case credential
    }
}

/// Call initiator info
struct CallInitiatorInfo: Codable {
    let userId: String
    let username: String?
    let avatar: String?
}

/// Call participant info from gateway
struct CallParticipantInfo: Codable, Identifiable {
    let id: String
    let callSessionId: String
    let userId: String?
    let anonymousId: String?
    let role: String
    let joinedAt: Date?
    let leftAt: Date?
    let isAudioEnabled: Bool
    let isVideoEnabled: Bool
    let connectionQuality: String?
    let username: String?
    let displayName: String?
    let avatar: String?

    enum CodingKeys: String, CodingKey {
        case id
        case callSessionId
        case userId
        case anonymousId
        case role
        case joinedAt
        case leftAt
        case isAudioEnabled
        case isVideoEnabled
        case connectionQuality
        case username
        case displayName
        case avatar
    }
}

/// WebRTC signal data
struct WebRTCSignal: Codable {
    let type: String // "offer", "answer", "ice-candidate"
    let from: String
    let to: String
    let sdp: String?
    let candidate: String?
    let sdpMLineIndex: Int32?
    let sdpMid: String?

    enum CodingKeys: String, CodingKey {
        case type
        case from
        case to
        case sdp
        case candidate
        case sdpMLineIndex
        case sdpMid
    }
}

/// Call signal event payload
struct CallSignalPayload: Codable {
    let callId: String
    let signal: WebRTCSignal
}

/// Call initiated event from server
struct CallInitiatedEvent: Codable {
    let callId: String
    let conversationId: String
    let mode: String // "p2p" or "sfu"
    let initiator: CallInitiatorInfo
    let participants: [CallParticipantInfo]
}

/// Participant joined event from server
struct ParticipantJoinedEvent: Codable {
    let callId: String
    let participant: CallParticipantInfo
    let mode: String
    let iceServers: [ICEServerConfig]?
}

/// Participant left event from server
struct ParticipantLeftEvent: Codable {
    let callId: String
    let participantId: String
    let userId: String?
    let anonymousId: String?
    let mode: String
}

/// Media toggled event from server
struct MediaToggledEvent: Codable {
    let callId: String
    let participantId: String
    let mediaType: String // "audio" or "video"
    let enabled: Bool
}

/// Call ended event from server
struct CallEndedEvent: Codable {
    let callId: String
    let duration: Int
    let endedBy: String
}

/// User info for accepted/rejected events
struct CallUserInfo: Codable {
    let userId: String
    let username: String
    let avatar: String?
}

/// Call accepted event from server
struct CallAcceptedEvent: Codable {
    let callId: String
    let acceptedBy: CallUserInfo
}

/// Call rejected event from server
struct CallRejectedEvent: Codable {
    let callId: String
    let rejectedBy: CallUserInfo
    let reason: String?
}

/// Call error event from server
struct CallErrorEvent: Codable {
    let code: String
    let message: String
    let details: [String: String]?
}

// MARK: - Call Signaling State

enum CallSignalingState: Equatable {
    case idle
    case initiating
    case ringing
    case joining
    case connected
    case reconnecting
    case ended
    case failed(String)
}

// MARK: - Call Signaling Delegate

@MainActor
protocol CallSignalingDelegate: AnyObject {
    /// Called when a call is initiated (we initiated or received)
    func signalingService(_ service: CallSignalingService, didReceiveCallInitiated event: CallInitiatedEvent)

    /// Called when callee accepts the call (before joining)
    func signalingService(_ service: CallSignalingService, didReceiveCallAccepted event: CallAcceptedEvent)

    /// Called when callee rejects the call
    func signalingService(_ service: CallSignalingService, didReceiveCallRejected event: CallRejectedEvent)

    /// Called when a participant joins the call
    func signalingService(_ service: CallSignalingService, didReceiveParticipantJoined event: ParticipantJoinedEvent)

    /// Called when a participant leaves the call
    func signalingService(_ service: CallSignalingService, didReceiveParticipantLeft event: ParticipantLeftEvent)

    /// Called when receiving a WebRTC signal (offer/answer/ICE candidate)
    func signalingService(_ service: CallSignalingService, didReceiveSignal signal: WebRTCSignal, callId: String)

    /// Called when media state changes
    func signalingService(_ service: CallSignalingService, didReceiveMediaToggled event: MediaToggledEvent)

    /// Called when call ends
    func signalingService(_ service: CallSignalingService, didReceiveCallEnded event: CallEndedEvent)

    /// Called when an error occurs
    func signalingService(_ service: CallSignalingService, didReceiveError error: CallErrorEvent)
}

// MARK: - Call Signaling Service

@MainActor
final class CallSignalingService: ObservableObject {

    // MARK: - Singleton

    static let shared = CallSignalingService()

    // MARK: - Published Properties

    @Published private(set) var state: CallSignalingState = .idle
    @Published private(set) var currentCallId: String?
    @Published private(set) var currentConversationId: String?
    @Published private(set) var participants: [CallParticipantInfo] = []
    @Published private(set) var iceServers: [ICEServerConfig] = []

    // MARK: - Properties

    weak var delegate: CallSignalingDelegate?

    private let webSocketService = WebSocketService.shared
    private var currentUserId: String?
    private let subscriberId = "CallSignalingService"

    // Default ICE servers (from gateway)
    // STUN servers for NAT discovery + TURN servers for relay fallback
    private let defaultICEServers: [ICEServerConfig] = [
        // STUN servers (free, for NAT discovery)
        ICEServerConfig(urls: "stun:stun.l.google.com:19302", username: nil, credential: nil),
        ICEServerConfig(urls: "stun:stun1.l.google.com:19302", username: nil, credential: nil),
        ICEServerConfig(urls: "stun:stun2.l.google.com:19302", username: nil, credential: nil),
        ICEServerConfig(urls: "stun:stun3.l.google.com:19302", username: nil, credential: nil),
        ICEServerConfig(urls: "stun:stun4.l.google.com:19302", username: nil, credential: nil),
        // TURN servers (relay for symmetric NAT / firewall traversal)
        // OpenRelay public TURN servers - for production, use your own coturn or Twilio/Xirsys
        ICEServerConfig(
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject"
        ),
        ICEServerConfig(
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject"
        ),
        ICEServerConfig(
            urls: "turn:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject"
        ),
        ICEServerConfig(
            urls: "turns:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject"
        )
    ]

    // MARK: - Initialization

    private init() {
        setupEventHandlers()
        iceServers = defaultICEServers
        callLogger.info("CallSignalingService initialized")
    }

    // MARK: - Setup

    private func setupEventHandlers() {
        // call:initiated - Call was created
        webSocketService.on(EnvironmentConfig.SocketEvent.callInitiated, subscriberId: subscriberId) { [weak self] data in
            guard let self = self else { return }
            let sendable = UncheckedSendableAny(value: data)
            Task { @MainActor in
                self.handleCallInitiated(sendable.value)
            }
        }

        // call:accepted - Callee accepted the call
        webSocketService.on(EnvironmentConfig.SocketEvent.callAccepted, subscriberId: subscriberId) { [weak self] data in
            guard let self = self else { return }
            let sendable = UncheckedSendableAny(value: data)
            Task { @MainActor in
                self.handleCallAccepted(sendable.value)
            }
        }

        // call:rejected - Callee rejected the call
        webSocketService.on(EnvironmentConfig.SocketEvent.callRejected, subscriberId: subscriberId) { [weak self] data in
            guard let self = self else { return }
            let sendable = UncheckedSendableAny(value: data)
            Task { @MainActor in
                self.handleCallRejected(sendable.value)
            }
        }

        // call:participant-joined - Someone joined
        webSocketService.on(EnvironmentConfig.SocketEvent.callParticipantJoined, subscriberId: subscriberId) { [weak self] data in
            guard let self = self else { return }
            let sendable = UncheckedSendableAny(value: data)
            Task { @MainActor in
                self.handleParticipantJoined(sendable.value)
            }
        }

        // call:participant-left - Someone left
        webSocketService.on(EnvironmentConfig.SocketEvent.callParticipantLeft, subscriberId: subscriberId) { [weak self] data in
            guard let self = self else { return }
            let sendable = UncheckedSendableAny(value: data)
            Task { @MainActor in
                self.handleParticipantLeft(sendable.value)
            }
        }

        // call:signal - WebRTC signaling
        webSocketService.on(EnvironmentConfig.SocketEvent.callSignal, subscriberId: subscriberId) { [weak self] data in
            guard let self = self else { return }
            let sendable = UncheckedSendableAny(value: data)
            Task { @MainActor in
                self.handleSignal(sendable.value)
            }
        }

        // call:media-toggled - Media state changed
        webSocketService.on(EnvironmentConfig.SocketEvent.callMediaToggled, subscriberId: subscriberId) { [weak self] data in
            guard let self = self else { return }
            let sendable = UncheckedSendableAny(value: data)
            Task { @MainActor in
                self.handleMediaToggled(sendable.value)
            }
        }

        // call:ended - Call ended
        webSocketService.on(EnvironmentConfig.SocketEvent.callEnded, subscriberId: subscriberId) { [weak self] data in
            guard let self = self else { return }
            let sendable = UncheckedSendableAny(value: data)
            Task { @MainActor in
                self.handleCallEnded(sendable.value)
            }
        }

        // call:error - Error occurred
        webSocketService.on(EnvironmentConfig.SocketEvent.callError, subscriberId: subscriberId) { [weak self] data in
            guard let self = self else { return }
            let sendable = UncheckedSendableAny(value: data)
            Task { @MainActor in
                self.handleCallError(sendable.value)
            }
        }

        // call:join response (when we join a call)
        webSocketService.on(EnvironmentConfig.SocketEvent.callJoin, subscriberId: subscriberId) { [weak self] data in
            guard let self = self else { return }
            let sendable = UncheckedSendableAny(value: data)
            Task { @MainActor in
                self.handleJoinResponse(sendable.value)
            }
        }

        callLogger.info("CallSignalingService event handlers configured")
    }

    // MARK: - Public API - Initiate Call

    /// Initiate a new call
    /// - Parameters:
    ///   - conversationId: The conversation to start the call in
    ///   - type: "video" or "audio"
    ///   - settings: Optional call settings
    func initiateCall(conversationId: String, type: String, settings: [String: Any]? = nil) {
        guard webSocketService.isReady else {
            callLogger.error("Cannot initiate call: WebSocket not ready")
            state = .failed("WebSocket not connected")
            return
        }

        state = .initiating
        currentConversationId = conversationId

        var payload: [String: Any] = [
            "conversationId": conversationId,
            "type": type
        ]

        if let settings = settings {
            payload["settings"] = settings
        }

        webSocketService.emit(EnvironmentConfig.SocketEvent.callInitiate, data: payload, priority: .high)
        callLogger.info("Initiated call in conversation: \(conversationId), type: \(type)")
    }

    // MARK: - Public API - Join Call

    /// Join an existing call
    /// - Parameters:
    ///   - callId: The call ID to join
    ///   - settings: Optional call settings
    func joinCall(callId: String, settings: [String: Any]? = nil) {
        guard webSocketService.isReady else {
            callLogger.error("Cannot join call: WebSocket not ready")
            state = .failed("WebSocket not connected")
            return
        }

        state = .joining
        currentCallId = callId

        var payload: [String: Any] = [
            "callId": callId
        ]

        if let settings = settings {
            payload["settings"] = settings
        }

        webSocketService.emit(EnvironmentConfig.SocketEvent.callJoin, data: payload, priority: .high)
        callLogger.info("Joining call: \(callId)")
    }

    // MARK: - Public API - Accept Call

    /// Accept an incoming call (before joining)
    /// This notifies the caller that we accepted, then we should call joinCall()
    /// - Parameter callId: The call ID to accept
    func acceptCall(callId: String) {
        guard webSocketService.isReady else {
            callLogger.error("Cannot accept call: WebSocket not ready")
            state = .failed("WebSocket not connected")
            return
        }

        let payload: [String: Any] = [
            "callId": callId
        ]

        webSocketService.emit(EnvironmentConfig.SocketEvent.callAccept, data: payload, priority: .high)
        callLogger.info("Accepted call: \(callId)")
    }

    // MARK: - Public API - Reject Call

    /// Reject an incoming call
    /// - Parameters:
    ///   - callId: The call ID to reject
    ///   - reason: Optional reason ("busy", "declined", "timeout")
    func rejectCall(callId: String, reason: String? = "declined") {
        guard webSocketService.isReady else {
            callLogger.error("Cannot reject call: WebSocket not ready")
            return
        }

        var payload: [String: Any] = [
            "callId": callId
        ]

        if let reason = reason {
            payload["reason"] = reason
        }

        webSocketService.emit(EnvironmentConfig.SocketEvent.callReject, data: payload, priority: .high)
        callLogger.info("Rejected call: \(callId), reason: \(reason ?? "declined")")

        // Reset state if this was our current call
        if currentCallId == callId {
            resetState()
        }
    }

    // MARK: - Public API - Leave Call

    /// Leave the current call
    func leaveCall() {
        guard let callId = currentCallId else {
            callLogger.warn("Cannot leave call: No active call")
            return
        }

        let payload: [String: Any] = [
            "callId": callId
        ]

        webSocketService.emit(EnvironmentConfig.SocketEvent.callLeave, data: payload, priority: .high)
        callLogger.info("Leaving call: \(callId)")

        // Optimistic state update
        resetState()
    }

    // MARK: - Public API - Send Signal

    /// Check if call is active and ready for signaling
    var isCallActive: Bool {
        return currentCallId != nil && (state == .connected || state == .ringing)
    }

    /// Send a WebRTC signal (offer, answer, or ICE candidate)
    /// - Parameters:
    ///   - type: Signal type ("offer", "answer", "ice-candidate")
    ///   - to: Target participant ID
    ///   - sdp: SDP for offer/answer
    ///   - candidate: ICE candidate string
    ///   - sdpMLineIndex: ICE candidate line index
    ///   - sdpMid: ICE candidate media ID
    func sendSignal(
        type: String,
        to: String,
        sdp: String? = nil,
        candidate: String? = nil,
        sdpMLineIndex: Int32? = nil,
        sdpMid: String? = nil
    ) {
        guard let callId = currentCallId else {
            callLogger.error("Cannot send signal: No active call")
            return
        }

        guard let from = currentUserId else {
            callLogger.error("Cannot send signal: No user ID")
            return
        }

        var signal: [String: Any] = [
            "type": type,
            "from": from,
            "to": to
        ]

        if let sdp = sdp {
            signal["sdp"] = sdp
        }

        if let candidate = candidate {
            signal["candidate"] = candidate
        }

        if let sdpMLineIndex = sdpMLineIndex {
            signal["sdpMLineIndex"] = sdpMLineIndex
        }

        if let sdpMid = sdpMid {
            signal["sdpMid"] = sdpMid
        }

        let payload: [String: Any] = [
            "callId": callId,
            "signal": signal
        ]

        webSocketService.emit(EnvironmentConfig.SocketEvent.callSignal, data: payload, priority: .high)
        callLogger.debug("Sent \(type) signal to \(to)")
    }

    /// Send an SDP offer
    func sendOffer(to: String, sdp: String) {
        sendSignal(type: "offer", to: to, sdp: sdp)
    }

    /// Send an SDP answer
    func sendAnswer(to: String, sdp: String) {
        sendSignal(type: "answer", to: to, sdp: sdp)
    }

    /// Send an ICE candidate
    func sendICECandidate(to: String, candidate: String, sdpMLineIndex: Int32, sdpMid: String?) {
        sendSignal(
            type: "ice-candidate",
            to: to,
            candidate: candidate,
            sdpMLineIndex: sdpMLineIndex,
            sdpMid: sdpMid
        )
    }

    // MARK: - Public API - Media Controls

    /// Toggle audio state
    func toggleAudio(enabled: Bool) {
        guard let callId = currentCallId else {
            callLogger.error("Cannot toggle audio: No active call")
            return
        }

        let payload: [String: Any] = [
            "callId": callId,
            "enabled": enabled
        ]

        webSocketService.emit(EnvironmentConfig.SocketEvent.callToggleAudio, data: payload, priority: .normal)
        callLogger.info("Toggled audio: \(enabled)")
    }

    /// Toggle video state
    func toggleVideo(enabled: Bool) {
        guard let callId = currentCallId else {
            callLogger.error("Cannot toggle video: No active call")
            return
        }

        let payload: [String: Any] = [
            "callId": callId,
            "enabled": enabled
        ]

        webSocketService.emit(EnvironmentConfig.SocketEvent.callToggleVideo, data: payload, priority: .normal)
        callLogger.info("Toggled video: \(enabled)")
    }

    // MARK: - Public API - End Call

    /// Force end the call (privileged operation - only initiator)
    func endCall() {
        guard let callId = currentCallId else {
            callLogger.error("Cannot end call: No active call")
            return
        }

        let payload: [String: Any] = [
            "callId": callId
        ]

        webSocketService.emit(EnvironmentConfig.SocketEvent.callEnd, data: payload, priority: .high)
        callLogger.info("Ending call: \(callId)")
    }

    /// Force cleanup any stale calls in a conversation
    func forceLeave(conversationId: String) {
        let payload: [String: Any] = [
            "conversationId": conversationId
        ]

        webSocketService.emit(EnvironmentConfig.SocketEvent.callForceLeave, data: payload, priority: .high)
        callLogger.info("Force leaving calls in conversation: \(conversationId)")

        resetState()
    }

    // MARK: - Public API - User ID

    /// Set the current user ID (required for signaling)
    func setCurrentUserId(_ userId: String) {
        currentUserId = userId
        callLogger.debug("Set current user ID: \(userId)")
    }

    // MARK: - Event Handlers

    private func handleCallInitiated(_ data: Any) {
        guard let dict = data as? [String: Any] else {
            callLogger.error("Invalid call:initiated data")
            return
        }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dict)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let event = try decoder.decode(CallInitiatedEvent.self, from: jsonData)

            currentCallId = event.callId
            currentConversationId = event.conversationId
            participants = event.participants
            state = .ringing

            callLogger.info("Call initiated: \(event.callId) in conversation: \(event.conversationId)")
            delegate?.signalingService(self, didReceiveCallInitiated: event)

        } catch {
            callLogger.error("Failed to decode call:initiated event: \(error)")
        }
    }

    private func handleCallAccepted(_ data: Any) {
        guard let dict = data as? [String: Any] else {
            callLogger.error("Invalid call:accepted data")
            return
        }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dict)
            let event = try JSONDecoder().decode(CallAcceptedEvent.self, from: jsonData)

            callLogger.info("Call accepted by: \(event.acceptedBy.username)")
            delegate?.signalingService(self, didReceiveCallAccepted: event)

        } catch {
            callLogger.error("Failed to decode call:accepted event: \(error)")
        }
    }

    private func handleCallRejected(_ data: Any) {
        guard let dict = data as? [String: Any] else {
            callLogger.error("Invalid call:rejected data")
            return
        }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dict)
            let event = try JSONDecoder().decode(CallRejectedEvent.self, from: jsonData)

            callLogger.info("Call rejected by: \(event.rejectedBy.username), reason: \(event.reason ?? "unknown")")
            delegate?.signalingService(self, didReceiveCallRejected: event)

            // If we initiated the call and it was rejected, reset state
            if currentCallId == event.callId {
                resetState()
            }

        } catch {
            callLogger.error("Failed to decode call:rejected event: \(error)")
        }
    }

    private func handleParticipantJoined(_ data: Any) {
        guard let dict = data as? [String: Any] else {
            callLogger.error("Invalid call:participant-joined data")
            return
        }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dict)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let event = try decoder.decode(ParticipantJoinedEvent.self, from: jsonData)

            // Update ICE servers if provided
            if let servers = event.iceServers, !servers.isEmpty {
                iceServers = servers
                callLogger.info("Updated ICE servers from participant-joined event")
            }

            // Add participant to list
            if !participants.contains(where: { $0.id == event.participant.id }) {
                participants.append(event.participant)
            }

            state = .connected

            callLogger.info("Participant joined: \(event.participant.userId ?? event.participant.anonymousId ?? "unknown")")
            delegate?.signalingService(self, didReceiveParticipantJoined: event)

        } catch {
            callLogger.error("Failed to decode call:participant-joined event: \(error)")
        }
    }

    private func handleParticipantLeft(_ data: Any) {
        guard let dict = data as? [String: Any] else {
            callLogger.error("Invalid call:participant-left data")
            return
        }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dict)
            let event = try JSONDecoder().decode(ParticipantLeftEvent.self, from: jsonData)

            // Remove participant from list
            participants.removeAll { $0.id == event.participantId }

            callLogger.info("Participant left: \(event.userId ?? event.anonymousId ?? event.participantId)")
            delegate?.signalingService(self, didReceiveParticipantLeft: event)

        } catch {
            callLogger.error("Failed to decode call:participant-left event: \(error)")
        }
    }

    private func handleSignal(_ data: Any) {
        guard let dict = data as? [String: Any],
              let callId = dict["callId"] as? String,
              let signalDict = dict["signal"] as? [String: Any] else {
            callLogger.error("Invalid call:signal data")
            return
        }

        do {
            let signalData = try JSONSerialization.data(withJSONObject: signalDict)
            let signal = try JSONDecoder().decode(WebRTCSignal.self, from: signalData)

            // Only process signals meant for us
            if signal.to == currentUserId {
                callLogger.debug("Received \(signal.type) signal from \(signal.from)")
                delegate?.signalingService(self, didReceiveSignal: signal, callId: callId)
            } else {
                callLogger.debug("Ignoring signal not meant for us (to: \(signal.to))")
            }

        } catch {
            callLogger.error("Failed to decode call:signal event: \(error)")
        }
    }

    private func handleMediaToggled(_ data: Any) {
        guard let dict = data as? [String: Any] else {
            callLogger.error("Invalid call:media-toggled data")
            return
        }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dict)
            let event = try JSONDecoder().decode(MediaToggledEvent.self, from: jsonData)

            callLogger.info("Media toggled: \(event.mediaType) = \(event.enabled) for participant: \(event.participantId)")
            delegate?.signalingService(self, didReceiveMediaToggled: event)

        } catch {
            callLogger.error("Failed to decode call:media-toggled event: \(error)")
        }
    }

    private func handleCallEnded(_ data: Any) {
        guard let dict = data as? [String: Any] else {
            callLogger.error("Invalid call:ended data")
            return
        }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dict)
            let event = try JSONDecoder().decode(CallEndedEvent.self, from: jsonData)

            callLogger.info("Call ended: \(event.callId), duration: \(event.duration)s, endedBy: \(event.endedBy)")
            delegate?.signalingService(self, didReceiveCallEnded: event)

            resetState()

        } catch {
            callLogger.error("Failed to decode call:ended event: \(error)")
        }
    }

    private func handleCallError(_ data: Any) {
        guard let dict = data as? [String: Any] else {
            callLogger.error("Invalid call:error data")
            return
        }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dict)
            let event = try JSONDecoder().decode(CallErrorEvent.self, from: jsonData)

            callLogger.error("Call error: \(event.code) - \(event.message)")
            state = .failed(event.message)
            delegate?.signalingService(self, didReceiveError: event)

        } catch {
            callLogger.error("Failed to decode call:error event: \(error)")
        }
    }

    private func handleJoinResponse(_ data: Any) {
        guard let dict = data as? [String: Any] else {
            callLogger.error("Invalid call:join response data")
            return
        }

        // Check for success
        if let success = dict["success"] as? Bool, success {
            // Update ICE servers if provided
            if let serversArray = dict["iceServers"] as? [[String: Any]] {
                do {
                    let serversData = try JSONSerialization.data(withJSONObject: serversArray)
                    let servers = try JSONDecoder().decode([ICEServerConfig].self, from: serversData)
                    if !servers.isEmpty {
                        iceServers = servers
                        callLogger.info("Updated ICE servers from join response")
                    }
                } catch {
                    callLogger.error("Failed to decode ICE servers: \(error)")
                }
            }

            state = .connected
            callLogger.info("Successfully joined call")
        } else {
            state = .failed("Failed to join call")
            callLogger.error("Failed to join call")
        }
    }

    // MARK: - Helpers

    private func resetState() {
        state = .idle
        currentCallId = nil
        currentConversationId = nil
        participants.removeAll()
        iceServers = defaultICEServers
        callLogger.info("Call signaling state reset")
    }

    /// Get the remote participant (for P2P calls)
    var remoteParticipant: CallParticipantInfo? {
        participants.first { participant in
            let participantUserId = participant.userId ?? participant.anonymousId
            return participantUserId != currentUserId
        }
    }

    /// Check if we are in an active call
    var isInCall: Bool {
        currentCallId != nil && (state == .connected || state == .joining || state == .ringing)
    }

    // MARK: - Cleanup

    func cleanup() {
        if currentCallId != nil {
            leaveCall()
        }
        webSocketService.offAll(subscriberId: subscriberId)
        resetState()
        callLogger.info("CallSignalingService cleaned up")
    }

    deinit {
        // Note: deinit is nonisolated, so we can't call cleanup() directly
        // Cleanup should be called explicitly before deallocation
    }
}
