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
    let messagePinned = PassthroughSubject<MessagePinnedEvent, Never>()
    let messageUnpinned = PassthroughSubject<MessageUnpinnedEvent, Never>()
    let reactionAdded = PassthroughSubject<ReactionUpdateEvent, Never>()
    let reactionRemoved = PassthroughSubject<ReactionUpdateEvent, Never>()
    let attachmentReactionAdded = PassthroughSubject<AttachmentReactionUpdateEvent, Never>()
    let attachmentReactionRemoved = PassthroughSubject<AttachmentReactionUpdateEvent, Never>()
    let typingStarted = PassthroughSubject<TypingEvent, Never>()
    let typingStopped = PassthroughSubject<TypingEvent, Never>()
    let unreadUpdated = PassthroughSubject<UnreadUpdateEvent, Never>()
    let userStatusChanged = PassthroughSubject<UserStatusEvent, Never>()
    let presenceSnapshotReceived = PassthroughSubject<PresenceSnapshotEvent, Never>()
    let readStatusUpdated = PassthroughSubject<ReadStatusUpdateEvent, Never>()
    let conversationJoined = PassthroughSubject<ConversationParticipationEvent, Never>()
    let conversationJoinError = PassthroughSubject<ConversationJoinErrorEvent, Never>()
    let conversationLeft = PassthroughSubject<ConversationParticipationEvent, Never>()
    let participantRoleUpdated = PassthroughSubject<ParticipantRoleUpdatedEvent, Never>()
    let messageConsumed = PassthroughSubject<MessageConsumedEvent, Never>()
    let locationShared = PassthroughSubject<LocationSharedEvent, Never>()
    let liveLocationStarted = PassthroughSubject<LiveLocationStartedEvent, Never>()
    let liveLocationUpdated = PassthroughSubject<LiveLocationUpdatedEvent, Never>()
    let liveLocationStopped = PassthroughSubject<LiveLocationStoppedEvent, Never>()
    let translationReceived = PassthroughSubject<TranslationEvent, Never>()
    let translationFailed = PassthroughSubject<TranslationFailedEvent, Never>()
    let transcriptionReady = PassthroughSubject<TranscriptionReadyEvent, Never>()
    let transcriptionFailed = PassthroughSubject<TranscriptionFailedEvent, Never>()
    let audioTranslationReady = PassthroughSubject<AudioTranslationEvent, Never>()
    let audioTranslationProgressive = PassthroughSubject<AudioTranslationEvent, Never>()
    let audioTranslationCompleted = PassthroughSubject<AudioTranslationEvent, Never>()
    let audioTranslationFailed = PassthroughSubject<AudioTranslationFailedEvent, Never>()
    let didReconnect = PassthroughSubject<Void, Never>()
    let connectionRTT = PassthroughSubject<Double, Never>()
    let notificationReceived = PassthroughSubject<SocketNotificationEvent, Never>()
    let conversationNew = PassthroughSubject<ConversationNewEvent, Never>()
    let notificationRead = PassthroughSubject<NotificationReadEvent, Never>()
    let notificationDeleted = PassthroughSubject<NotificationDeletedEvent, Never>()
    let notificationCounts = PassthroughSubject<NotificationCountsEvent, Never>()
    let conversationOnlineStats = PassthroughSubject<ConversationOnlineStatsEvent, Never>()
    let callOfferReceived = PassthroughSubject<CallOfferData, Never>()
    let callAnswerReceived = PassthroughSubject<CallAnswerData, Never>()
    let callICECandidateReceived = PassthroughSubject<CallICECandidateData, Never>()
    let callEnded = PassthroughSubject<CallEndData, Never>()
    let callMissed = PassthroughSubject<CallMissedData, Never>()
    let callAlreadyAnswered = PassthroughSubject<CallAlreadyAnsweredData, Never>()
    let callParticipantJoined = PassthroughSubject<CallParticipantData, Never>()
    let callParticipantLeft = PassthroughSubject<CallParticipantData, Never>()
    let callMediaToggled = PassthroughSubject<CallMediaToggleData, Never>()
    let callError = PassthroughSubject<CallErrorData, Never>()
    let reactionSynced = PassthroughSubject<ReactionSyncEvent, Never>()
    let systemMessageReceived = PassthroughSubject<SystemMessageEvent, Never>()
    let attachmentStatusUpdated = PassthroughSubject<AttachmentStatusUpdatedEvent, Never>()
    let attachmentUpdated = PassthroughSubject<AttachmentUpdatedEvent, Never>()
    let mentionCreated = PassthroughSubject<MentionCreatedEvent, Never>()
    let userPreferencesUpdated = PassthroughSubject<UserPreferencesUpdatedEvent, Never>()
    let userPreferencesConversationUpdated = PassthroughSubject<UserPreferencesConversationUpdatedSocketEvent, Never>()
    let conversationUpdated = PassthroughSubject<ConversationUpdatedEvent, Never>()
    let participantSelfLeft = PassthroughSubject<ParticipantLeftEvent, Never>()
    let participantBanned = PassthroughSubject<ParticipantBannedEvent, Never>()
    let participantUnbanned = PassthroughSubject<ParticipantUnbannedEvent, Never>()
    let conversationClosed = PassthroughSubject<ConversationClosedEvent, Never>()
    let conversationStatsReceived = PassthroughSubject<ConversationStatsEvent, Never>()
    let callSignalOfferReceived = PassthroughSubject<CallAnswerData, Never>()
    let callQualityAlert = PassthroughSubject<CallQualityAlertData, Never>()
    let callIceServersRefreshed = PassthroughSubject<CallIceServersRefreshedData, Never>()
    let callScreenCaptureAlert = PassthroughSubject<CallScreenCaptureAlertData, Never>()
    let callForcedLeave = PassthroughSubject<CallForcedLeaveData, Never>()

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
    var sendWithAttachmentsCallCount = 0
    var sendViaSocketFallbackCallCount = 0
    var sendViaSocketFallbackResult: MessageSocketManager.SendMessageAck?
    var lastSendViaSocketFallbackClientMessageId: String?
    var lastSendViaSocketFallbackAttachmentIds: [String]?
    var lastSendViaSocketFallbackIsEncrypted: Bool?
    var callInitiateCallCount = 0
    var callInitiateResult: Result<MessageSocketManager.CallInitiateAck, Error> = .success(
        MessageSocketManager.CallInitiateAck(callId: "mock-call-id", mode: "audio", iceServers: [])
    )
    var callJoinCallCount = 0
    var callLeaveCallCount = 0
    var callSignalCallCount = 0
    var callToggleAudioCallCount = 0
    var callToggleVideoCallCount = 0
    var callEndCallCount = 0
    var callHeartbeatCallCount = 0
    var callBackgroundedCallCount = 0
    var callForegroundedCallCount = 0
    var callScreenCaptureDetectedCallCount = 0
    var callAnalyticsCallCount = 0
    var lastCallAnalyticsPayload: [String: Any]?

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

    func sendWithAttachments(conversationId: String, content: String?, attachmentIds: [String], replyToId: String?, storyReplyToId: String?, originalLanguage: String?, isEncrypted: Bool, clientMessageId: String?) {
        sendWithAttachmentsCallCount += 1
    }

    func sendViaSocketFallback(conversationId: String, content: String?, attachmentIds: [String], replyToId: String?, storyReplyToId: String?, originalLanguage: String?, isEncrypted: Bool, clientMessageId: String) async -> MessageSocketManager.SendMessageAck? {
        sendViaSocketFallbackCallCount += 1
        lastSendViaSocketFallbackClientMessageId = clientMessageId
        lastSendViaSocketFallbackAttachmentIds = attachmentIds
        lastSendViaSocketFallbackIsEncrypted = isEncrypted
        return sendViaSocketFallbackResult
    }

    func emitCallInitiate(conversationId: String, isVideo: Bool) async throws -> MessageSocketManager.CallInitiateAck {
        callInitiateCallCount += 1
        return try callInitiateResult.get()
    }

    func emitCallJoin(callId: String) {
        callJoinCallCount += 1
    }

    func emitCallLeave(callId: String) {
        callLeaveCallCount += 1
    }

    private(set) var lastAppForeground: Bool?
    func emitAppForeground(_ foreground: Bool) {
        lastAppForeground = foreground
    }

    private(set) var addAttachmentReactionCallCount = 0
    private(set) var lastAddedAttachmentReaction: (attachmentId: String, messageId: String, emoji: String)?
    func addAttachmentReaction(attachmentId: String, messageId: String, emoji: String) {
        addAttachmentReactionCallCount += 1
        lastAddedAttachmentReaction = (attachmentId, messageId, emoji)
    }
    private(set) var removeAttachmentReactionCallCount = 0
    private(set) var lastRemovedAttachmentReaction: (attachmentId: String, messageId: String, emoji: String)?
    func removeAttachmentReaction(attachmentId: String, messageId: String, emoji: String) {
        removeAttachmentReactionCallCount += 1
        lastRemovedAttachmentReaction = (attachmentId, messageId, emoji)
    }

    func emitCallSignal(callId: String, type: String, payload: [String: Any]) {
        callSignalCallCount += 1
    }

    var callSignalWithAckResult: Bool = true
    func emitCallSignalWithAck(callId: String, type: String, payload: [String: Any]) async -> Bool {
        callSignalCallCount += 1
        return callSignalWithAckResult
    }

    func emitCallToggleAudio(callId: String, enabled: Bool) {
        callToggleAudioCallCount += 1
    }

    func emitCallToggleVideo(callId: String, enabled: Bool) {
        callToggleVideoCallCount += 1
    }

    func emitCallEnd(callId: String) {
        callEndCallCount += 1
    }

    var callEndWithAckResult: Bool = true
    func emitCallEndWithAck(callId: String) async -> Bool {
        callEndCallCount += 1
        return callEndWithAckResult
    }

    func emitCallHeartbeat(callId: String) {
        callHeartbeatCallCount += 1
    }

    func emitCallBackgrounded(callId: String, participantId: String) {
        callBackgroundedCallCount += 1
    }

    func emitCallForegrounded(callId: String, participantId: String) {
        callForegroundedCallCount += 1
    }

    func emitCallScreenCaptureDetected(callId: String, participantId: String, isCapturing: Bool) {
        callScreenCaptureDetectedCallCount += 1
    }

    func emitCallAnalytics(callId: String, payload: [String: Any]) {
        callAnalyticsCallCount += 1
        lastCallAnalyticsPayload = payload
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
        sendWithAttachmentsCallCount = 0
        sendViaSocketFallbackCallCount = 0
        sendViaSocketFallbackResult = nil
        lastSendViaSocketFallbackClientMessageId = nil
        lastSendViaSocketFallbackAttachmentIds = nil
        lastSendViaSocketFallbackIsEncrypted = nil
        callInitiateCallCount = 0
        callJoinCallCount = 0
        callLeaveCallCount = 0
        callSignalCallCount = 0
        callToggleAudioCallCount = 0
        callToggleVideoCallCount = 0
        callEndCallCount = 0
        callHeartbeatCallCount = 0
        callBackgroundedCallCount = 0
        callForegroundedCallCount = 0
        callScreenCaptureDetectedCallCount = 0
        callAnalyticsCallCount = 0
        lastCallAnalyticsPayload = nil
    }
}
