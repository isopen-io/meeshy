import Combine
@testable import MeeshySDK

final class MockMessageSocket: MessageSocketProviding, @unchecked Sendable {
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
    let conversationJoined = PassthroughSubject<ConversationParticipationEvent, Never>()
    let conversationLeft = PassthroughSubject<ConversationParticipationEvent, Never>()
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
    let notificationRead = PassthroughSubject<NotificationReadEvent, Never>()
    let notificationDeleted = PassthroughSubject<NotificationDeletedEvent, Never>()
    let notificationCounts = PassthroughSubject<NotificationCountsEvent, Never>()
    let conversationOnlineStats = PassthroughSubject<ConversationOnlineStatsEvent, Never>()
    let callOfferReceived = PassthroughSubject<CallOfferData, Never>()
    let callSignalOfferReceived = PassthroughSubject<CallAnswerData, Never>()
    let callAnswerReceived = PassthroughSubject<CallAnswerData, Never>()
    let callICECandidateReceived = PassthroughSubject<CallICECandidateData, Never>()
    let callEnded = PassthroughSubject<CallEndData, Never>()
    let callParticipantJoined = PassthroughSubject<CallParticipantData, Never>()
    let callParticipantLeft = PassthroughSubject<CallParticipantData, Never>()
    let callMediaToggled = PassthroughSubject<CallMediaToggleData, Never>()
    let callError = PassthroughSubject<CallErrorData, Never>()
    let reactionSynced = PassthroughSubject<ReactionSyncEvent, Never>()
    let systemMessageReceived = PassthroughSubject<SystemMessageEvent, Never>()
    let attachmentStatusUpdated = PassthroughSubject<AttachmentStatusEvent, Never>()
    let mentionCreated = PassthroughSubject<MentionCreatedEvent, Never>()

    var isConnected: Bool = false
    var connectionState: ConnectionState = .disconnected
    var activeConversationId: String?

    private(set) var connectCallCount = 0
    private(set) var disconnectCallCount = 0
    private(set) var joinedConversations: [String] = []
    private(set) var leftConversations: [String] = []

    func connect() { connectCallCount += 1 }
    func connectAnonymous(sessionToken: String) { connectCallCount += 1 }
    func disconnect() { disconnectCallCount += 1 }
    func joinConversation(_ conversationId: String) { joinedConversations.append(conversationId) }
    func leaveConversation(_ conversationId: String) { leftConversations.append(conversationId) }
    func emitTypingStart(conversationId: String) {}
    func emitTypingStop(conversationId: String) {}
    func requestTranslation(messageId: String, targetLanguage: String) {}
    func emitLocationShare(payload: LocationSharePayload) {}
    func emitLiveLocationStart(payload: LiveLocationStartPayload) {}
    func emitLiveLocationUpdate(payload: LiveLocationUpdatePayload) {}
    func emitLiveLocationStop(conversationId: String) {}
    func sendWithAttachments(conversationId: String, content: String?, attachmentIds: [String], replyToId: String?, originalLanguage: String?, isEncrypted: Bool) {}
    func emitCallInitiate(conversationId: String, isVideo: Bool) {}
    func emitCallJoin(callId: String) {}
    func emitCallLeave(callId: String) {}
    func emitCallSignal(callId: String, type: String, payload: [String: String]) {}
    func emitCallToggleAudio(callId: String, enabled: Bool) {}
    func emitCallToggleVideo(callId: String, enabled: Bool) {}
    func emitCallEnd(callId: String) {}
    func emitCallHeartbeat(callId: String) {}
}
