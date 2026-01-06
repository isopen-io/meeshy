//
//  MockWebSocketService.swift
//  MeeshyTests
//
//  Mock WebSocket Service for unit testing
//  Simulates real-time event handling
//

import Foundation
@testable import Meeshy

final class MockWebSocketService {
    // MARK: - Configuration

    var isConnected = false
    var shouldFailConnection = false
    var connectionDelay: TimeInterval = 0.0

    // MARK: - Event Tracking

    var emittedEvents: [(event: String, data: Any?)] = []
    var registeredEvents: [String: [(Any?) -> Void]] = [:]
    var connectCallCount = 0
    var disconnectCallCount = 0

    // MARK: - Connection Methods

    func connect() async {
        connectCallCount += 1

        if connectionDelay > 0 {
            try? await Task.sleep(nanoseconds: UInt64(connectionDelay * 1_000_000_000))
        }

        if !shouldFailConnection {
            isConnected = true
        }
    }

    func disconnect() {
        disconnectCallCount += 1
        isConnected = false
        registeredEvents.removeAll()
    }

    // MARK: - Event Methods

    func on(_ event: String, handler: @escaping (Any?) -> Void) {
        if registeredEvents[event] == nil {
            registeredEvents[event] = []
        }
        registeredEvents[event]?.append(handler)
    }

    func off(_ event: String) {
        registeredEvents.removeValue(forKey: event)
    }

    func emit(_ event: String, data: Any? = nil) {
        emittedEvents.append((event, data))
    }

    // MARK: - Specific Event Methods

    func sendTypingIndicator(conversationId: String, isTyping: Bool) {
        let data: [String: Any] = [
            "conversationId": conversationId,
            "isTyping": isTyping
        ]
        emit("user:typing", data: data)
    }

    func sendReadReceipt(messageId: String) {
        let data: [String: Any] = [
            "messageId": messageId
        ]
        emit("message:read", data: data)
    }

    // MARK: - Test Helper Methods

    func simulateMessageReceived(_ message: Message) {
        let messageData: [String: Any] = [
            "_id": message.id,
            "conversationId": message.conversationId,
            "senderId": message.senderId,
            "content": message.content,
            "type": "text",
            "createdAt": ISO8601DateFormatter().string(from: message.createdAt)
        ]

        triggerEvent("message:received", data: messageData)
    }

    func simulateMessageRead(messageId: String, userId: String) {
        let readData: [String: Any] = [
            "messageId": messageId,
            "userId": userId,
            "readAt": ISO8601DateFormatter().string(from: Date())
        ]

        triggerEvent("message:read", data: readData)
    }

    func simulateUserTyping(conversationId: String, userId: String, isTyping: Bool) {
        let typingData: [String: Any] = [
            "conversationId": conversationId,
            "userId": userId,
            "isTyping": isTyping
        ]

        triggerEvent("user:typing", data: typingData)
    }

    func simulateMessageDeleted(messageId: String) {
        let deleteData: [String: Any] = [
            "messageId": messageId
        ]

        triggerEvent("message:deleted", data: deleteData)
    }

    func simulateIncomingCall(call: Call) {
        let callData: [String: Any] = [
            "callId": call.id,
            "callerId": call.callerId,
            "type": call.type == .video ? "video" : "audio"
        ]

        triggerEvent("call:incoming", data: callData)
    }

    private func triggerEvent(_ event: String, data: Any?) {
        registeredEvents[event]?.forEach { handler in
            handler(data)
        }
    }

    // MARK: - Reset

    func reset() {
        isConnected = false
        shouldFailConnection = false
        connectionDelay = 0.0
        emittedEvents.removeAll()
        registeredEvents.removeAll()
        connectCallCount = 0
        disconnectCallCount = 0
    }
}
