import Combine
import Foundation
import MeeshySDK
import XCTest

final class MockMessageSocket: MessageSocketProviding, @unchecked Sendable {

    // MARK: - State

    var isConnected: Bool = false
    var connectionState: ConnectionState = .disconnected
    var activeConversationId: String?

    // MARK: - Publishers

    let messageReceived = PassthroughSubject<APIMessage, Never>()
    let messageEdited = PassthroughSubject<APIMessage, Never>()
    let messageDeleted = PassthroughSubject<MessageDeletedEvent, Never>()
    let reactionAdded = PassthroughSubject<ReactionUpdateEvent, Never>()
    let reactionRemoved = PassthroughSubject<ReactionUpdateEvent, Never>()
    let typingStarted = PassthroughSubject<TypingEvent, Never>()
    let typingStopped = PassthroughSubject<TypingEvent, Never>()
    let unreadUpdated = PassthroughSubject<UnreadUpdateEvent, Never>()
    let userStatusChanged = PassthroughSubject<UserStatusEvent, Never>()
    let readStatusUpdated = PassthroughSubject<ReadStatusUpdateEvent, Never>()
    let participantRoleUpdated = PassthroughSubject<ParticipantRoleUpdatedEvent, Never>()
    let messageConsumed = PassthroughSubject<MessageConsumedEvent, Never>()
    let locationShared = PassthroughSubject<LocationSharedEvent, Never>()
    let liveLocationStarted = PassthroughSubject<LiveLocationStartedEvent, Never>()
    let liveLocationUpdated = PassthroughSubject<LiveLocationUpdatedEvent, Never>()
    let liveLocationStopped = PassthroughSubject<LiveLocationStoppedEvent, Never>()
    let translationReceived = PassthroughSubject<TranslationEvent, Never>()
    let transcriptionReady = PassthroughSubject<TranscriptionReadyEvent, Never>()
    let audioTranslationReady = PassthroughSubject<AudioTranslationEvent, Never>()
    let audioTranslationProgressive = PassthroughSubject<AudioTranslationEvent, Never>()
    let audioTranslationCompleted = PassthroughSubject<AudioTranslationEvent, Never>()
    let didReconnect = PassthroughSubject<Void, Never>()
    let notificationReceived = PassthroughSubject<SocketNotificationEvent, Never>()

    // MARK: - Call Tracking

    var connectCallCount = 0
    var connectAnonymousTokens: [String] = []
    var disconnectCallCount = 0
    var joinConversationIds: [String] = []
    var leaveConversationIds: [String] = []
    var typingStartConversationIds: [String] = []
    var typingStopConversationIds: [String] = []
    var translationRequests: [(messageId: String, targetLanguage: String)] = []
    var locationSharePayloads: [LocationSharePayload] = []
    var liveLocationStartPayloads: [LiveLocationStartPayload] = []
    var liveLocationUpdatePayloads: [LiveLocationUpdatePayload] = []
    var liveLocationStopConversationIds: [String] = []

    // MARK: - Protocol Methods

    func connect() {
        connectCallCount += 1
        isConnected = true
        connectionState = .connected
    }

    func connectAnonymous(sessionToken: String) {
        connectAnonymousTokens.append(sessionToken)
        connectCallCount += 1
        isConnected = true
        connectionState = .connected
    }

    func disconnect() {
        disconnectCallCount += 1
        isConnected = false
        connectionState = .disconnected
    }

    func joinConversation(_ conversationId: String) {
        joinConversationIds.append(conversationId)
    }

    func leaveConversation(_ conversationId: String) {
        leaveConversationIds.append(conversationId)
    }

    func emitTypingStart(conversationId: String) {
        typingStartConversationIds.append(conversationId)
    }

    func emitTypingStop(conversationId: String) {
        typingStopConversationIds.append(conversationId)
    }

    func requestTranslation(messageId: String, targetLanguage: String) {
        translationRequests.append((messageId, targetLanguage))
    }

    func emitLocationShare(payload: LocationSharePayload) {
        locationSharePayloads.append(payload)
    }

    func emitLiveLocationStart(payload: LiveLocationStartPayload) {
        liveLocationStartPayloads.append(payload)
    }

    func emitLiveLocationUpdate(payload: LiveLocationUpdatePayload) {
        liveLocationUpdatePayloads.append(payload)
    }

    func emitLiveLocationStop(conversationId: String) {
        liveLocationStopConversationIds.append(conversationId)
    }

    // MARK: - Simulation Helpers

    func simulateMessage(_ message: APIMessage) {
        messageReceived.send(message)
    }

    func simulateMessageEdited(_ message: APIMessage) {
        messageEdited.send(message)
    }

    func simulateMessageDeleted(_ event: MessageDeletedEvent) {
        messageDeleted.send(event)
    }

    func simulateReconnect() {
        isConnected = true
        connectionState = .connected
        didReconnect.send(())
    }

    func simulateDisconnect() {
        isConnected = false
        connectionState = .disconnected
    }

    // MARK: - Reset

    func reset() {
        isConnected = false
        connectionState = .disconnected
        activeConversationId = nil
        connectCallCount = 0
        connectAnonymousTokens.removeAll()
        disconnectCallCount = 0
        joinConversationIds.removeAll()
        leaveConversationIds.removeAll()
        typingStartConversationIds.removeAll()
        typingStopConversationIds.removeAll()
        translationRequests.removeAll()
        locationSharePayloads.removeAll()
        liveLocationStartPayloads.removeAll()
        liveLocationUpdatePayloads.removeAll()
        liveLocationStopConversationIds.removeAll()
    }
}
