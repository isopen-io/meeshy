import Foundation
import SocketIO
import Combine
import os

// MARK: - Connection State

public enum ConnectionState: Equatable, Sendable {
    case connected
    case connecting
    case reconnecting(attempt: Int)
    case disconnected
}

// MARK: - Protocol

public protocol MessageSocketProviding: Sendable {
    func emitCallJoinWithAck(callId: String) async -> Bool
    var callScreenCaptureAlert: PassthroughSubject<CallScreenCaptureAlertData, Never> { get }
    /// Fired when the gateway force-removes the current user from the call.
    /// The client must tear down the call immediately (no user confirmation needed).
    var callForcedLeave: PassthroughSubject<CallForcedLeaveData, Never> { get }
    var callTranslatedSegmentReceived: PassthroughSubject<CallTranslatedSegmentData, Never> { get }
    /// Signal de présence transcription : un pair a activé/fermé son panneau
    /// (`call:transcription-active`, estampillé côté gateway) — pilote
    /// l'indicateur d'invitation sur l'icône captions.
    var callTranscriptionActiveReceived: PassthroughSubject<CallTranscriptionActiveData, Never> { get }
    var messageReceived: PassthroughSubject<APIMessage, Never> { get }
    var messageEdited: PassthroughSubject<APIMessage, Never> { get }
    var messageDeleted: PassthroughSubject<MessageDeletedEvent, Never> { get }
    /// `message:expired` — jumeau SERVEUR de `messageDeleted` pour un message
    /// autodestructible échu. Dans le protocole pour la même raison que
    /// `messageHiddenForMe` : le consommateur (`ConversationSocketHandler`) ne
    /// détient qu'un `MessageSocketProviding`.
    var messageExpired: PassthroughSubject<MessageExpiredEvent, Never> { get }
    /// `message:cited-post-withdrawn` (#7969) — voir `MessageSocketManager+CitedPost.swift`.
    var messageCitedPostWithdrawn: PassthroughSubject<MessageCitedPostWithdrawnEvent, Never> { get }
    /// `message:countdown-started` — l'échéance SERVIE d'un éphémère, résolue
    /// pour CE lecteur. Dans le protocole pour la même raison que ses voisins :
    /// le consommateur (`ConversationSocketHandler`) ne détient qu'un
    /// `MessageSocketProviding`.
    var messageCountdownStarted: PassthroughSubject<MessageCountdownStartedEvent, Never> { get }
    /// `message:hidden-for-me` — le canal de visibilité PERSONNELLE. Dans le
    /// protocole parce que le consommateur (`ConversationSocketHandler`) ne
    /// détient qu'un `MessageSocketProviding`.
    var messageHiddenForMe: PassthroughSubject<MessageHiddenForMeEvent, Never> { get }
    /// `message:restored-for-me` — le canal jumeau, en sens inverse. Dans le
    /// protocole pour la même raison que son jumeau : le consommateur
    /// (`ConversationSocketHandler`) ne détient qu'un `MessageSocketProviding`.
    var messageRestoredForMe: PassthroughSubject<MessageRestoredForMeEvent, Never> { get }
    var messagePinned: PassthroughSubject<MessagePinnedEvent, Never> { get }
    var messageUnpinned: PassthroughSubject<MessageUnpinnedEvent, Never> { get }
    /// `message:starred` — l'étoile PERSONNELLE, room `user:<id>` (#7939).
    var messageStarred: PassthroughSubject<MessageStarredEvent, Never> { get }
    var reactionAdded: PassthroughSubject<ReactionUpdateEvent, Never> { get }
    var reactionRemoved: PassthroughSubject<ReactionUpdateEvent, Never> { get }
    var attachmentReactionAdded: PassthroughSubject<AttachmentReactionUpdateEvent, Never> { get }
    var attachmentReactionRemoved: PassthroughSubject<AttachmentReactionUpdateEvent, Never> { get }
    var typingStarted: PassthroughSubject<TypingEvent, Never> { get }
    var typingStopped: PassthroughSubject<TypingEvent, Never> { get }
    var unreadUpdated: PassthroughSubject<UnreadUpdateEvent, Never> { get }
    var userStatusChanged: PassthroughSubject<UserStatusEvent, Never> { get }
    /// Bulk snapshot émis par le gateway après l'auth socket. Le client doit ingérer
    /// chaque entrée comme un `user:status` individuel pour seed son store de présence
    /// sans attendre une transition d'état spontanée.
    var presenceSnapshotReceived: PassthroughSubject<PresenceSnapshotEvent, Never> { get }
    var readStatusUpdated: PassthroughSubject<ReadStatusUpdateEvent, Never> { get }
    /// `message:pending-delivered` — voir `PendingMessagesDeliveredEvent`.
    var pendingMessagesDelivered: PassthroughSubject<PendingMessagesDeliveredEvent, Never> { get }
    var attachmentStatusUpdated: PassthroughSubject<AttachmentStatusUpdatedEvent, Never> { get }
    /// `message:attachment-updated` — delta émis par le gateway après un
    /// enrichissement async (transcription Whisper, traduction audio NLLB+TTS).
    /// Le subscriber remplace l'attachment dans son store atomiquement.
    var attachmentUpdated: PassthroughSubject<AttachmentUpdatedEvent, Never> { get }
    var conversationJoined: PassthroughSubject<ConversationParticipationEvent, Never> { get }
    var conversationJoinError: PassthroughSubject<ConversationJoinErrorEvent, Never> { get }
    var conversationLeft: PassthroughSubject<ConversationParticipationEvent, Never> { get }
    var participantRoleUpdated: PassthroughSubject<ParticipantRoleUpdatedEvent, Never> { get }
    var participantRightsUpdated: PassthroughSubject<ParticipantRightsUpdatedEvent, Never> { get }
    var conversationUpdated: PassthroughSubject<ConversationUpdatedEvent, Never> { get }
    /// `user:updated` — profil public d'un CONTACT. Dans le protocole parce que
    /// `ConversationSyncEngine` ne détient qu'un `MessageSocketProviding`.
    var userUpdated: PassthroughSubject<UserUpdatedEvent, Never> { get }
    /// `conversation:participant-joined` — l'adhésion d'un tiers, distincte de
    /// `conversationJoined` (ack de room, cf. `ParticipantJoinedEvent`).
    var participantJoined: PassthroughSubject<ParticipantJoinedEvent, Never> { get }
    var participantSelfLeft: PassthroughSubject<ParticipantLeftEvent, Never> { get }
    var participantBanned: PassthroughSubject<ParticipantBannedEvent, Never> { get }
    var participantUnbanned: PassthroughSubject<ParticipantUnbannedEvent, Never> { get }
    var conversationClosed: PassthroughSubject<ConversationClosedEvent, Never> { get }
    /// `conversation:deleted` — the conversation is gone server-side. Exposed on
    /// the protocol (not just the concrete manager) so the disk-cache writer can
    /// subscribe: routed only to the in-memory `ConversationStore`, a deletion
    /// received while offline came back from the dead on the next cold start.
    var conversationDeleted: PassthroughSubject<ConversationDeletedSocketEvent, Never> { get }
    /// `conversation:restored` — la conversation revient dans MA liste, sur mes
    /// AUTRES appareils (#4389). Exposé au protocole pour la même raison que sa
    /// jumelle descendante : une restauration reçue par un seul abonné laisserait
    /// les autres consommateurs — le cache disque comme le moteur de synchro —
    /// sur un état que le serveur a déjà quitté.
    var conversationRestored: PassthroughSubject<ConversationRestoredSocketEvent, Never> { get }
    var userPreferencesUpdated: PassthroughSubject<UserPreferencesUpdatedEvent, Never> { get }
    /// Conversation-scope variant of `user:preferences-updated` (versioned).
    /// Routed separately from `userPreferencesUpdated` (category scope) so the
    /// `ConversationStore` bridge can apply it with version semantics.
    var userPreferencesConversationUpdated: PassthroughSubject<UserPreferencesConversationUpdatedSocketEvent, Never> { get }
    var conversationStatsReceived: PassthroughSubject<ConversationStatsEvent, Never> { get }
    var messageConsumed: PassthroughSubject<MessageConsumedEvent, Never> { get }
    var viewOncePurged: PassthroughSubject<ViewOncePurgedEvent, Never> { get }
    var liveLocationStarted: PassthroughSubject<LiveLocationStartedEvent, Never> { get }
    var liveLocationUpdated: PassthroughSubject<LiveLocationUpdatedEvent, Never> { get }
    var liveLocationStopped: PassthroughSubject<LiveLocationStoppedEvent, Never> { get }
    var translationReceived: PassthroughSubject<TranslationEvent, Never> { get }
    var transcriptionReady: PassthroughSubject<TranscriptionReadyEvent, Never> { get }
    var audioTranslationReady: PassthroughSubject<AudioTranslationEvent, Never> { get }
    var audioTranslationProgressive: PassthroughSubject<AudioTranslationEvent, Never> { get }
    var audioTranslationCompleted: PassthroughSubject<AudioTranslationEvent, Never> { get }
    var translationFailed: PassthroughSubject<TranslationFailedEvent, Never> { get }
    var audioTranslationFailed: PassthroughSubject<AudioTranslationFailedEvent, Never> { get }
    var transcriptionFailed: PassthroughSubject<TranscriptionFailedEvent, Never> { get }
    var didReconnect: PassthroughSubject<Void, Never> { get }
    /// Fires after each heartbeat round-trip with the measured RTT in milliseconds.
    /// Subscribers can use this to display connection quality indicators.
    var connectionRTT: PassthroughSubject<Double, Never> { get }
    var notificationReceived: PassthroughSubject<SocketNotificationEvent, Never> { get }
    /// Fired when the gateway emits SERVER_EVENTS.CONVERSATION_NEW (a fresh
    /// conversation was created — the user is now a participant). Replaces
    /// the previous overload of `notification:new` with type-string
    /// discrimination. Carries the canonical conversation id so the list
    /// view-model can fetch the enriched payload via getById and prepend
    /// the row in real time. The legacy `notification:new` event is still
    /// emitted in parallel by the gateway for ~3 months to support older
    /// clients during rollout.
    var conversationNew: PassthroughSubject<ConversationNewEvent, Never> { get }
    var notificationRead: PassthroughSubject<NotificationReadEvent, Never> { get }
    var notificationDeleted: PassthroughSubject<NotificationDeletedEvent, Never> { get }
    var notificationCounts: PassthroughSubject<NotificationCountsEvent, Never> { get }
    var callOfferReceived: PassthroughSubject<CallOfferData, Never> { get }
    var callSignalOfferReceived: PassthroughSubject<CallAnswerData, Never> { get }
    var callAnswerReceived: PassthroughSubject<CallAnswerData, Never> { get }
    var callICECandidateReceived: PassthroughSubject<CallICECandidateData, Never> { get }
    var callEnded: PassthroughSubject<CallEndData, Never> { get }
    /// Audit P1-25 — dedicated `call:missed` event publisher (in addition to
    /// `callEnded` which is emitted in parallel for backwards-compat).
    var callMissed: PassthroughSubject<CallMissedData, Never> { get }
    /// Audit P1-27 — `call:already-answered` publisher used by the user's
    /// other devices to dismiss their ringing UI when one device answers.
    var callAlreadyAnswered: PassthroughSubject<CallAlreadyAnsweredData, Never> { get }
    var callParticipantJoined: PassthroughSubject<CallParticipantData, Never> { get }
    var callParticipantLeft: PassthroughSubject<CallParticipantData, Never> { get }
    var callMediaToggled: PassthroughSubject<CallMediaToggleData, Never> { get }
    var callError: PassthroughSubject<CallErrorData, Never> { get }
    var callIceServersRefreshed: PassthroughSubject<CallIceServersRefreshedData, Never> { get }
    var callQualityAlert: PassthroughSubject<CallQualityAlertData, Never> { get }
    var reactionSynced: PassthroughSubject<ReactionSyncEvent, Never> { get }
    var mentionCreated: PassthroughSubject<MentionCreatedEvent, Never> { get }
    var isConnected: Bool { get }
    var connectionState: ConnectionState { get }
    var activeConversationId: String? { get set }
    func connect()
    func connectAnonymous(sessionToken: String)
    func disconnect()
    func joinConversation(_ conversationId: String)
    func leaveConversation(_ conversationId: String)
    func emitTypingStart(conversationId: String)
    func emitTypingStop(conversationId: String)
    func requestTranslation(messageId: String, targetLanguage: String)
    func emitLiveLocationStart(payload: LiveLocationStartPayload)
    func emitLiveLocationUpdate(payload: LiveLocationUpdatePayload)
    func emitLiveLocationStop(conversationId: String)
    /// `sticker` (#4823) fait partie de l'exigence, comme `location` sur
    /// `sendViaSocketFallback` : une valeur par défaut sur l'implémentation
    /// concrète ne satisfait pas une exigence de protocole. Le shim sans
    /// `sticker` vit dans l'extension « Protocol Default-Arg Convenience ».
    func sendWithAttachments(conversationId: String, content: String?, attachmentIds: [String], replyToId: String?, storyReplyToId: String?, originalLanguage: String?, isEncrypted: Bool, clientMessageId: String?, sticker: MessageSticker?)
    /// `location` fait partie de l'exigence : une valeur par défaut sur
    /// l'implémentation concrète ne satisfait PAS une exigence de protocole en
    /// Swift. Le shim de compatibilité source (sans `location`) vit dans
    /// l'extension « Protocol Default-Arg Convenience » ci-dessous.
    func sendViaSocketFallback(conversationId: String, content: String?, attachmentIds: [String], replyToId: String?, storyReplyToId: String?, originalLanguage: String?, isEncrypted: Bool, clientMessageId: String, location: SharedPlace?, sticker: MessageSticker?) async -> MessageSocketManager.SendMessageAck?
    func emitCallInitiate(conversationId: String, isVideo: Bool) async throws -> MessageSocketManager.CallInitiateAck
    func emitCallJoin(callId: String)
    func emitCallLeave(callId: String)
    func emitAppForeground(_ foreground: Bool)
    func addAttachmentReaction(attachmentId: String, messageId: String, emoji: String)
    func removeAttachmentReaction(attachmentId: String, messageId: String, emoji: String)
    func emitCallSignal(callId: String, type: String, payload: [String: Any])
    func emitCallSignalWithAck(callId: String, type: String, payload: [String: Any]) async -> Bool
    func emitCallToggleAudio(callId: String, enabled: Bool)
    func emitCallToggleVideo(callId: String, enabled: Bool)
    func emitCallEnd(callId: String)
    func emitCallEndWithAck(callId: String) async -> Bool
    func emitCallHeartbeat(callId: String)
    func emitCallQualityReport(callId: String, level: String, rtt: Double, packetLoss: Double, bytesSent: Int, bytesReceived: Int)
    func emitCallReconnecting(callId: String, participantId: String, attempt: Int)
    func emitCallReconnected(callId: String, participantId: String)
    func emitRequestIceServers(callId: String)
    func emitCallBackgrounded(callId: String, participantId: String)
    func emitCallForegrounded(callId: String, participantId: String)
    func emitCallScreenCaptureDetected(callId: String, participantId: String, isCapturing: Bool)
    func emitCallAnalytics(callId: String, payload: [String: Any])
    func emitCallTranscriptionSegment(callId: String, segment: CallTranscriptionSegmentPayload)
    func emitCallTranscriptionActive(callId: String, active: Bool)
}

// MARK: - Protocol Default-Arg Convenience

/// Default-arg shims for source-compatibility with pre-Phase-4 call sites
/// that do not yet pass `clientMessageId`. Protocol requirements cannot have
/// default parameter values directly, so the convenience overload lives in
/// an extension. Phase 4 call sites SHOULD pass an explicit `clientMessageId`
/// so the optimistic row, the ACK echo, and the `message:new` broadcast can
/// be reconciled by the same end-to-end identifier.
public extension MessageSocketProviding {
    /// Default no-op so existing conformers (test mocks) need not implement the
    /// quality-report emit added for call data/quality persistence.
    func emitCallQualityReport(
        callId: String, level: String, rtt: Double, packetLoss: Double,
        bytesSent: Int, bytesReceived: Int
    ) {}

    /// Shim that adds BWE passthrough; mocks can keep the old signature.
    func emitCallQualityReport(
        callId: String, level: String, rtt: Double, packetLoss: Double,
        bytesSent: Int, bytesReceived: Int, availableOutgoingBitrateBps: Int
    ) {
        emitCallQualityReport(callId: callId, level: level, rtt: rtt, packetLoss: packetLoss,
                              bytesSent: bytesSent, bytesReceived: bytesReceived)
    }

    /// Shim that adds audio jitter passthrough; mocks can keep the old signatures.
    func emitCallQualityReport(
        callId: String, level: String, rtt: Double, packetLoss: Double,
        bytesSent: Int, bytesReceived: Int, availableOutgoingBitrateBps: Int, jitterMs: Double
    ) {
        emitCallQualityReport(callId: callId, level: level, rtt: rtt, packetLoss: packetLoss,
                              bytesSent: bytesSent, bytesReceived: bytesReceived,
                              availableOutgoingBitrateBps: availableOutgoingBitrateBps)
    }

    func emitCallReconnecting(callId: String, participantId: String, attempt: Int) {}
    func emitCallReconnected(callId: String, participantId: String) {}
    func emitCallJoinWithAck(callId: String) async -> Bool { false }
    func emitRequestIceServers(callId: String) {}
    func emitCallBackgrounded(callId: String, participantId: String) {}
    func emitCallForegrounded(callId: String, participantId: String) {}
    func emitCallScreenCaptureDetected(callId: String, participantId: String, isCapturing: Bool) {}
    func emitCallAnalytics(callId: String, payload: [String: Any]) {}
    func emitCallTranscriptionSegment(callId: String, segment: CallTranscriptionSegmentPayload) {}
    func emitCallTranscriptionActive(callId: String, active: Bool) {}

    func sendWithAttachments(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String? = nil,
        originalLanguage: String? = nil,
        isEncrypted: Bool = false
    ) {
        sendWithAttachments(
            conversationId: conversationId,
            content: content,
            attachmentIds: attachmentIds,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            originalLanguage: originalLanguage,
            isEncrypted: isEncrypted,
            clientMessageId: nil,
            sticker: nil
        )
    }

    /// Shim de compatibilité source pour les appelants antérieurs au sticker
    /// (#4823) : même signature qu'avant l'ajout de `sticker` à l'exigence de
    /// protocole, délègue avec `sticker: nil`.
    func sendWithAttachments(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String?,
        originalLanguage: String?,
        isEncrypted: Bool,
        clientMessageId: String?
    ) {
        sendWithAttachments(
            conversationId: conversationId,
            content: content,
            attachmentIds: attachmentIds,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            originalLanguage: originalLanguage,
            isEncrypted: isEncrypted,
            clientMessageId: clientMessageId,
            sticker: nil
        )
    }

    /// Shim de compatibilité source pour les appelants antérieurs au lieu
    /// partagé : même signature qu'avant l'ajout de `location` à l'exigence
    /// de protocole, délègue avec `location: nil`.
    func sendViaSocketFallback(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String?,
        originalLanguage: String?,
        isEncrypted: Bool,
        clientMessageId: String
    ) async -> MessageSocketManager.SendMessageAck? {
        await sendViaSocketFallback(
            conversationId: conversationId,
            content: content,
            attachmentIds: attachmentIds,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            originalLanguage: originalLanguage,
            isEncrypted: isEncrypted,
            clientMessageId: clientMessageId,
            location: nil
        )
    }

    /// Shim de compatibilité source pour les appelants antérieurs au sticker
    /// (#4823) : même signature qu'avant l'ajout de `sticker` à l'exigence de
    /// protocole, délègue avec `sticker: nil`.
    func sendViaSocketFallback(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String?,
        originalLanguage: String?,
        isEncrypted: Bool,
        clientMessageId: String,
        location: SharedPlace?
    ) async -> MessageSocketManager.SendMessageAck? {
        await sendViaSocketFallback(
            conversationId: conversationId,
            content: content,
            attachmentIds: attachmentIds,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            originalLanguage: originalLanguage,
            isEncrypted: isEncrypted,
            clientMessageId: clientMessageId,
            location: location,
            sticker: nil
        )
    }
}
