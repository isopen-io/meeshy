//
//  SignalingManager.swift
//  Meeshy
//
//  WebSocket-based signaling for WebRTC call setup
//  Handles offer/answer exchange and ICE candidate signaling
//

import Foundation
// import WebRTC

// MARK: - Signaling Message Types

enum SignalingMessageType: String, Codable {
    case offer = "call:offer"
    case answer = "call:answer"
    case iceCandidate = "call:ice-candidate"
    case callInitiated = "call:initiated"
    case callRinging = "call:ringing"
    case callAccepted = "call:accepted"
    case callRejected = "call:rejected"
    case callEnded = "call:ended"
    case callHangup = "call:hangup"
    case participantJoined = "call:participant-joined"
    case participantLeft = "call:participant-left"
    case muteToggled = "call:mute-toggled"
    case videoToggled = "call:video-toggled"
}

// MARK: - Signaling Messages

struct SignalingMessage: Codable {
    let type: SignalingMessageType
    let callId: String
    let senderId: String
    let receiverId: String?
    let data: SignalingData?
    let timestamp: Date

    enum CodingKeys: String, CodingKey {
        case type
        case callId
        case senderId
        case receiverId
        case data
        case timestamp
    }
}

struct SignalingData: Codable {
    // For offer/answer
    let sdp: String?
    let type: String? // "offer" or "answer"

    // For ICE candidate
    let candidate: String?
    let sdpMLineIndex: Int32?
    let sdpMid: String?

    // For call state
    let isMuted: Bool?
    let isVideoEnabled: Bool?
    let participantId: String?

    enum CodingKeys: String, CodingKey {
        case sdp
        case type
        case candidate
        case sdpMLineIndex
        case sdpMid
        case isMuted
        case isVideoEnabled
        case participantId
    }
}

// MARK: - Signaling Delegate

@MainActor
protocol SignalingManagerDelegate: AnyObject {
    func signalingManager(_ manager: SignalingManager, didReceiveOffer sdp: RTCSessionDescription, from senderId: String, callId: String)
    func signalingManager(_ manager: SignalingManager, didReceiveAnswer sdp: RTCSessionDescription, from senderId: String, callId: String)
    func signalingManager(_ manager: SignalingManager, didReceiveIceCandidate candidate: RTCIceCandidate, from senderId: String, callId: String)
    func signalingManager(_ manager: SignalingManager, callWasAccepted callId: String, by userId: String)
    func signalingManager(_ manager: SignalingManager, callWasRejected callId: String, by userId: String)
    func signalingManager(_ manager: SignalingManager, callWasEnded callId: String, by userId: String)
    func signalingManager(_ manager: SignalingManager, participantJoined userId: String, in callId: String)
    func signalingManager(_ manager: SignalingManager, participantLeft userId: String, in callId: String)
    func signalingManager(_ manager: SignalingManager, didEncounterError error: Error)
}

// MARK: - Signaling Manager

@MainActor
final class SignalingManager: ObservableObject {

    // MARK: - Singleton

    static let shared = SignalingManager()

    // MARK: - Properties

    weak var delegate: SignalingManagerDelegate?

    private let webSocketService = WebSocketService.shared
    private var currentCallId: String?
    private var currentUserId: String?

    // Track pending operations
    private var pendingOffers: [String: RTCSessionDescription] = [:]
    private var pendingAnswers: [String: RTCSessionDescription] = [:]

    // MARK: - Initialization

    private init() {
        setupSignalingHandlers()
    }

    // MARK: - Setup

    private func setupSignalingHandlers() {
        // Offer
        webSocketService.on(SignalingMessageType.offer.rawValue) { [weak self] data in
            guard let self = self else { return }
            
            if let message = self.parseSignalingMessage(from: data) {
                Task { @MainActor in
                    self.handleOfferMessage(message)
                }
            }
        }

        // Answer
        webSocketService.on(SignalingMessageType.answer.rawValue) { [weak self] data in
            guard let self = self else { return }
            
            if let message = self.parseSignalingMessage(from: data) {
                Task { @MainActor in
                    self.handleAnswerMessage(message)
                }
            }
        }

        // ICE Candidate
        webSocketService.on(SignalingMessageType.iceCandidate.rawValue) { [weak self] data in
            guard let self = self else { return }
            
            if let message = self.parseSignalingMessage(from: data) {
                Task { @MainActor in
                    self.handleIceCandidateMessage(message)
                }
            }
        }

        // Call accepted
        webSocketService.on(SignalingMessageType.callAccepted.rawValue) { [weak self] data in
            guard let self = self else { return }
            
            if let message = self.parseSignalingMessage(from: data) {
                Task { @MainActor in
                    self.handleCallAcceptedMessage(message)
                }
            }
        }

        // Call rejected
        webSocketService.on(SignalingMessageType.callRejected.rawValue) { [weak self] data in
            guard let self = self else { return }
            
            if let message = self.parseSignalingMessage(from: data) {
                Task { @MainActor in
                    self.handleCallRejectedMessage(message)
                }
            }
        }

        // Call ended
        webSocketService.on(SignalingMessageType.callEnded.rawValue) { [weak self] data in
            guard let self = self else { return }
            
            if let message = self.parseSignalingMessage(from: data) {
                Task { @MainActor in
                    self.handleCallEndedMessage(message)
                }
            }
        }

        // Participant joined
        webSocketService.on(SignalingMessageType.participantJoined.rawValue) { [weak self] data in
            guard let self = self else { return }
            
            if let message = self.parseSignalingMessage(from: data) {
                Task { @MainActor in
                    self.handleParticipantJoinedMessage(message)
                }
            }
        }

        // Participant left
        webSocketService.on(SignalingMessageType.participantLeft.rawValue) { [weak self] data in
            guard let self = self else { return }
            
            if let message = self.parseSignalingMessage(from: data) {
                Task { @MainActor in
                    self.handleParticipantLeftMessage(message)
                }
            }
        }

        callLogger.info("SignalingManager handlers configured")
    }
    
    // Helper to parse message in non-isolated context
    nonisolated private func parseSignalingMessage(from data: Any) -> SignalingMessage? {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: data),
              let message = try? JSONDecoder().decode(SignalingMessage.self, from: jsonData) else {
            return nil
        }
        return message
    }

    // MARK: - Call Initiation

    func initiateCall(callId: String, to receiverId: String, withVideo: Bool) {
        currentCallId = callId

        let message = SignalingMessage(
            type: .callInitiated,
            callId: callId,
            senderId: getCurrentUserId(),
            receiverId: receiverId,
            data: SignalingData(
                sdp: nil,
                type: nil,
                candidate: nil,
                sdpMLineIndex: nil,
                sdpMid: nil,
                isMuted: false,
                isVideoEnabled: withVideo,
                participantId: nil
            ),
            timestamp: Date()
        )

        sendSignalingMessage(message)
        callLogger.info("Call initiated: \(callId) to user: \(receiverId)")
    }

    // MARK: - Offer/Answer

    func sendOffer(_ offer: RTCSessionDescription, to receiverId: String, callId: String) {
        let message = SignalingMessage(
            type: .offer,
            callId: callId,
            senderId: getCurrentUserId(),
            receiverId: receiverId,
            data: SignalingData(
                sdp: offer.sdp,
                type: RTCSessionDescription.string(for: offer.type),
                candidate: nil,
                sdpMLineIndex: nil,
                sdpMid: nil,
                isMuted: nil,
                isVideoEnabled: nil,
                participantId: nil
            ),
            timestamp: Date()
        )

        sendSignalingMessage(message)
        callLogger.info("Sent offer for call: \(callId)")
    }

    func sendAnswer(_ answer: RTCSessionDescription, to receiverId: String, callId: String) {
        let message = SignalingMessage(
            type: .answer,
            callId: callId,
            senderId: getCurrentUserId(),
            receiverId: receiverId,
            data: SignalingData(
                sdp: answer.sdp,
                type: RTCSessionDescription.string(for: answer.type),
                candidate: nil,
                sdpMLineIndex: nil,
                sdpMid: nil,
                isMuted: nil,
                isVideoEnabled: nil,
                participantId: nil
            ),
            timestamp: Date()
        )

        sendSignalingMessage(message)
        callLogger.info("Sent answer for call: \(callId)")
    }

    // MARK: - ICE Candidates

    func sendIceCandidate(_ candidate: RTCIceCandidate, to receiverId: String, callId: String) {
        let message = SignalingMessage(
            type: .iceCandidate,
            callId: callId,
            senderId: getCurrentUserId(),
            receiverId: receiverId,
            data: SignalingData(
                sdp: nil,
                type: nil,
                candidate: candidate.sdp,
                sdpMLineIndex: candidate.sdpMLineIndex,
                sdpMid: candidate.sdpMid,
                isMuted: nil,
                isVideoEnabled: nil,
                participantId: nil
            ),
            timestamp: Date()
        )

        sendSignalingMessage(message)
        callLogger.debug("Sent ICE candidate for call: \(callId)")
    }

    // MARK: - Call Control

    func acceptCall(callId: String, from senderId: String) {
        let message = SignalingMessage(
            type: .callAccepted,
            callId: callId,
            senderId: getCurrentUserId(),
            receiverId: senderId,
            data: nil,
            timestamp: Date()
        )

        sendSignalingMessage(message)
        currentCallId = callId
        callLogger.info("Accepted call: \(callId)")
    }

    func rejectCall(callId: String, from senderId: String) {
        let message = SignalingMessage(
            type: .callRejected,
            callId: callId,
            senderId: getCurrentUserId(),
            receiverId: senderId,
            data: nil,
            timestamp: Date()
        )

        sendSignalingMessage(message)
        callLogger.info("Rejected call: \(callId)")
    }

    func endCall(callId: String, to receiverId: String?) {
        let message = SignalingMessage(
            type: .callEnded,
            callId: callId,
            senderId: getCurrentUserId(),
            receiverId: receiverId,
            data: nil,
            timestamp: Date()
        )

        sendSignalingMessage(message)
        currentCallId = nil
        callLogger.info("Ended call: \(callId)")
    }

    func sendMuteState(isMuted: Bool, callId: String) {
        let message = SignalingMessage(
            type: .muteToggled,
            callId: callId,
            senderId: getCurrentUserId(),
            receiverId: nil,
            data: SignalingData(
                sdp: nil,
                type: nil,
                candidate: nil,
                sdpMLineIndex: nil,
                sdpMid: nil,
                isMuted: isMuted,
                isVideoEnabled: nil,
                participantId: nil
            ),
            timestamp: Date()
        )

        sendSignalingMessage(message)
        callLogger.debug("Sent mute state: \(isMuted) for call: \(callId)")
    }

    func sendVideoState(isEnabled: Bool, callId: String) {
        let message = SignalingMessage(
            type: .videoToggled,
            callId: callId,
            senderId: getCurrentUserId(),
            receiverId: nil,
            data: SignalingData(
                sdp: nil,
                type: nil,
                candidate: nil,
                sdpMLineIndex: nil,
                sdpMid: nil,
                isMuted: nil,
                isVideoEnabled: isEnabled,
                participantId: nil
            ),
            timestamp: Date()
        )

        sendSignalingMessage(message)
        callLogger.debug("Sent video state: \(isEnabled) for call: \(callId)")
    }

    // MARK: - Message Handlers

    private func handleOfferMessage(_ message: SignalingMessage) {
        guard let signalingData = message.data,
              let sdpString = signalingData.sdp else {
            callLogger.error("Invalid offer message")
            return
        }

        let sdp = RTCSessionDescription(type: .offer, sdp: sdpString)

        callLogger.info("Received offer from: \(message.senderId) for call: \(message.callId)")
        delegate?.signalingManager(self, didReceiveOffer: sdp, from: message.senderId, callId: message.callId)
    }

    private func handleAnswerMessage(_ message: SignalingMessage) {
        guard let signalingData = message.data,
              let sdpString = signalingData.sdp else {
            callLogger.error("Invalid answer message")
            return
        }

        let sdp = RTCSessionDescription(type: .answer, sdp: sdpString)

        callLogger.info("Received answer from: \(message.senderId) for call: \(message.callId)")
        delegate?.signalingManager(self, didReceiveAnswer: sdp, from: message.senderId, callId: message.callId)
    }

    private func handleIceCandidateMessage(_ message: SignalingMessage) {
        guard let signalingData = message.data,
              let candidateString = signalingData.candidate,
              let sdpMLineIndex = signalingData.sdpMLineIndex,
              let sdpMid = signalingData.sdpMid else {
            callLogger.error("Invalid ICE candidate message")
            return
        }

        let candidate = RTCIceCandidate(
            sdp: candidateString,
            sdpMLineIndex: sdpMLineIndex,
            sdpMid: sdpMid
        )

        callLogger.debug("Received ICE candidate from: \(message.senderId) for call: \(message.callId)")
        delegate?.signalingManager(self, didReceiveIceCandidate: candidate, from: message.senderId, callId: message.callId)
    }

    private func handleCallAcceptedMessage(_ message: SignalingMessage) {
        callLogger.info("Call accepted: \(message.callId) by: \(message.senderId)")
        delegate?.signalingManager(self, callWasAccepted: message.callId, by: message.senderId)
    }

    private func handleCallRejectedMessage(_ message: SignalingMessage) {
        callLogger.info("Call rejected: \(message.callId) by: \(message.senderId)")
        delegate?.signalingManager(self, callWasRejected: message.callId, by: message.senderId)
    }

    private func handleCallEndedMessage(_ message: SignalingMessage) {
        callLogger.info("Call ended: \(message.callId) by: \(message.senderId)")
        delegate?.signalingManager(self, callWasEnded: message.callId, by: message.senderId)

        if currentCallId == message.callId {
            currentCallId = nil
        }
    }

    private func handleParticipantJoinedMessage(_ message: SignalingMessage) {
        guard let signalingData = message.data,
              let participantId = signalingData.participantId else {
            callLogger.error("Invalid participant joined message")
            return
        }

        callLogger.info("Participant joined: \(participantId) in call: \(message.callId)")
        delegate?.signalingManager(self, participantJoined: participantId, in: message.callId)
    }

    private func handleParticipantLeftMessage(_ message: SignalingMessage) {
        guard let signalingData = message.data,
              let participantId = signalingData.participantId else {
            callLogger.error("Invalid participant left message")
            return
        }

        callLogger.info("Participant left: \(participantId) in call: \(message.callId)")
        delegate?.signalingManager(self, participantLeft: participantId, in: message.callId)
    }

    // MARK: - Send Message

    private func sendSignalingMessage(_ message: SignalingMessage) {
        guard let messageData = try? JSONEncoder().encode(message),
              let messageDict = try? JSONSerialization.jsonObject(with: messageData) as? [String: Any] else {
            callLogger.error("Failed to encode signaling message")
            return
        }

        webSocketService.emit(message.type.rawValue, data: messageDict)
    }

    // MARK: - Helpers

    private func getCurrentUserId() -> String {
        // Get from AuthService or KeychainService
        if let userId = currentUserId {
            return userId
        }

        // TODO: Get actual user ID from auth service
        let userId = "current-user-id"
        currentUserId = userId
        return userId
    }

    func setCurrentUserId(_ userId: String) {
        currentUserId = userId
    }

    // MARK: - Cleanup

    func cleanup() {
        currentCallId = nil
        pendingOffers.removeAll()
        pendingAnswers.removeAll()
        callLogger.info("SignalingManager cleaned up")
    }
}

// MARK: - RTCSessionDescription Extension
// Note: Commented out until WebRTC is properly imported
/*
extension RTCSessionDescription {
    static func string(for type: RTCSdpType) -> String {
        switch type {
        case .offer: return "offer"
        case .prAnswer: return "pranswer"
        case .answer: return "answer"
        case .rollback: return "rollback"
        @unknown default: return "unknown"
        }
    }
}
*/
