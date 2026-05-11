import Foundation
import SocketIO
import Combine
import os

// MARK: - Message Socket Event Data

public struct MessageDeletedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String

    public init(messageId: String, conversationId: String) {
        self.messageId = messageId
        self.conversationId = conversationId
    }
}

public struct ReactionAggregationEvent: Decodable, Sendable {
    public let emoji: String
    public let count: Int
    public let participantIds: [String]?
    public let hasCurrentUser: Bool?
}

public struct ReactionUpdateEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String?
    public let participantId: String?
    public let emoji: String
    public let action: String?
    public let aggregation: ReactionAggregationEvent?
    public let timestamp: String?

    public var count: Int { aggregation?.count ?? 0 }
}

public struct TypingEvent: Decodable, Sendable {
    public let userId: String
    public let username: String
    public let conversationId: String

    public init(userId: String, username: String, conversationId: String) {
        self.userId = userId; self.username = username; self.conversationId = conversationId
    }
}

public struct UnreadUpdateEvent: Decodable, Sendable {
    public let conversationId: String
    public let unreadCount: Int

    public init(conversationId: String, unreadCount: Int) {
        self.conversationId = conversationId; self.unreadCount = unreadCount
    }
}

public struct UserPreferencesUpdatedEvent: Decodable, Sendable {
    public let userId: String
    public let category: String
    public let conversationId: String?
    public let isPinned: Bool?
    public let isMuted: Bool?
    public let isArchived: Bool?
    public let mentionsOnly: Bool?
    public let categoryId: String?
    public let reaction: String?
    public let customName: String?
    public let tags: [String]?

    public init(
        userId: String,
        category: String,
        conversationId: String? = nil,
        isPinned: Bool? = nil,
        isMuted: Bool? = nil,
        isArchived: Bool? = nil,
        mentionsOnly: Bool? = nil,
        categoryId: String? = nil,
        reaction: String? = nil,
        customName: String? = nil,
        tags: [String]? = nil
    ) {
        self.userId = userId; self.category = category; self.conversationId = conversationId
        self.isPinned = isPinned; self.isMuted = isMuted; self.isArchived = isArchived
        self.mentionsOnly = mentionsOnly
        self.categoryId = categoryId; self.reaction = reaction
        self.customName = customName; self.tags = tags
    }
}

public struct ConversationStatsEvent: Decodable, Sendable {
    public let conversationId: String
    public let stats: ConversationStats

    public struct ConversationStats: Decodable, Sendable {
        public let participantCount: Int?
        public let onlineUsers: [OnlineUser]?
        public let messagesPerLanguage: [String: Int]?
        public let participantsPerLanguage: [String: Int]?
    }

    public struct OnlineUser: Decodable, Sendable {
        public let id: String
        public let username: String?
        public let firstName: String?
        public let lastName: String?
    }
}

public struct UserStatusEvent: Decodable, Sendable {
    public let userId: String
    public let username: String
    public let isOnline: Bool
    public let lastActiveAt: Date?

    public init(userId: String, username: String, isOnline: Bool, lastActiveAt: Date? = nil) {
        self.userId = userId; self.username = username
        self.isOnline = isOnline; self.lastActiveAt = lastActiveAt
    }
}

// MARK: - Translation Event Data

public struct TranslationData: Codable, Sendable, CacheIdentifiable {
    public let id: String
    public let messageId: String
    public let sourceLanguage: String
    public let targetLanguage: String
    public let translatedContent: String
    public let translationModel: String
    public let confidenceScore: Double?
}

public struct TranslationEvent: Codable, Sendable {
    public let messageId: String
    public let translations: [TranslationData]
}

// MARK: - Transcription Event Data

public struct TranscriptionSegment: Codable, Sendable {
    public let text: String
    public let startTime: Double?
    public let endTime: Double?
    public let speakerId: String?
    public let voiceSimilarityScore: Double?

    private enum CodingKeys: String, CodingKey {
        case text, startMs, endMs, startTime, endTime, speakerId, voiceSimilarityScore
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try c.decode(String.self, forKey: .text)
        speakerId = try c.decodeIfPresent(String.self, forKey: .speakerId)
        voiceSimilarityScore = try c.decodeIfPresent(Double.self, forKey: .voiceSimilarityScore)
        if let ms = try c.decodeIfPresent(Double.self, forKey: .startMs) {
            startTime = ms / 1000.0
        } else {
            startTime = try c.decodeIfPresent(Double.self, forKey: .startTime)
        }
        if let ms = try c.decodeIfPresent(Double.self, forKey: .endMs) {
            endTime = ms / 1000.0
        } else {
            endTime = try c.decodeIfPresent(Double.self, forKey: .endTime)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(text, forKey: .text)
        try c.encodeIfPresent(startTime, forKey: .startTime)
        try c.encodeIfPresent(endTime, forKey: .endTime)
        try c.encodeIfPresent(speakerId, forKey: .speakerId)
        try c.encodeIfPresent(voiceSimilarityScore, forKey: .voiceSimilarityScore)
    }
}

public struct TranscriptionData: Codable, Sendable {
    public let id: String?
    public let text: String
    public let language: String
    public let confidence: Double?
    public let durationMs: Int?
    public let segments: [TranscriptionSegment]?
    public let speakerCount: Int?
}

public struct TranscriptionReadyEvent: Codable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let transcription: TranscriptionData
    public let processingTimeMs: Int?
}

// MARK: - Audio Translation Event Data

public struct TranslatedAudioInfo: Codable, Sendable {
    public let id: String
    public let targetLanguage: String
    public let url: String
    public let transcription: String
    public let durationMs: Int
    public let format: String
    public let cloned: Bool
    public let quality: Double
    public let voiceModelId: String?
    public let ttsModel: String
    public let segments: [TranscriptionSegment]?
}

public struct AudioTranslationEvent: Codable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let language: String
    public let translatedAudio: TranslatedAudioInfo
    public let processingTimeMs: Int?
}

public struct ReadStatusSummary: Decodable, Sendable {
    public let totalMembers: Int
    public let deliveredCount: Int
    public let readCount: Int
}

public struct ReadStatusUpdateEvent: Decodable, Sendable {
    public let conversationId: String
    public let participantId: String
    public let userId: String?
    public let type: String
    public let updatedAt: Date
    public let summary: ReadStatusSummary
}

// MARK: - Attachment Status Updated Event Data

public struct AttachmentStatusUpdatedEvent: Decodable, Sendable {
    public let attachmentId: String
    public let messageId: String
    public let conversationId: String
    public let userId: String
    public let action: String
    public let updatedAt: Date?
}

// MARK: - Participant Role Updated Event Data

public struct ParticipantRoleUpdatedParticipantInfo: Decodable, Sendable {
    public let id: String
    public let role: String
    public let displayName: String
    public let userId: String?
}

public struct ConversationParticipationEvent: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
}

/// Server-rejected `conversation:join` carrying the offending conversationId
/// so the client can route the failure to the right ViewModel and purge any
/// stale cache entries. `reason` is a stable machine-readable code:
/// `not_a_member`, `banned`, `no_longer_member`, `invalid_payload`,
/// `server_error`. `message` is a localized, human-readable description.
public struct ConversationJoinErrorEvent: Decodable, Sendable {
    public let conversationId: String
    public let reason: String?
    public let message: String?
}

public struct ParticipantRoleUpdatedEvent: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
    public let newRole: String
    public let updatedBy: String
    public let participant: ParticipantRoleUpdatedParticipantInfo
}

public struct SocketEventUser: Decodable, Sendable {
    public let id: String
}

public struct ConversationUpdatedEvent: Decodable, Sendable {
    public let conversationId: String
    public let title: String?
    public let description: String?
    public let avatar: String?
    public let banner: String?
    public let defaultWriteRole: String?
    public let isAnnouncementChannel: Bool?
    public let slowModeSeconds: Int?
    public let autoTranslateEnabled: Bool?
    /// New as of the conversation-list bump-to-top work: the gateway emits
    /// this on every message broadcast (handlers/MessageHandler.ts) so the
    /// client can re-sort the conversation list in real time without a
    /// delta sync round-trip. Optional for retro-compatibility with
    /// pre-existing CONVERSATION_UPDATED payloads (rename, avatar change,
    /// etc.) that don't advance lastMessageAt.
    public let lastMessageAt: Date?
    /// Optional because the gateway's message-driven CONVERSATION_UPDATED
    /// payload (handlers/MessageHandler.ts on every new message) only
    /// carries `{ conversationId, lastMessageAt, lastMessageId,
    /// lastMessagePreview, senderId, updatedAt }` — no `updatedBy`. Decoding
    /// it as required would silently fail with `keyNotFound` on every
    /// inbound message, which is the entire signal that drives bumpToTop.
    /// Metadata-driven updates (rename, avatar change, etc.) keep emitting
    /// `updatedBy` and continue to populate this field.
    public let updatedBy: SocketEventUser?
    public let updatedAt: String

    private enum CodingKeys: String, CodingKey {
        case conversationId, title, description, avatar, banner
        case defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled
        case lastMessageAt, updatedBy, updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        conversationId = try container.decode(String.self, forKey: .conversationId)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        avatar = try container.decodeIfPresent(String.self, forKey: .avatar)
        banner = try container.decodeIfPresent(String.self, forKey: .banner)
        defaultWriteRole = try container.decodeIfPresent(String.self, forKey: .defaultWriteRole)
        isAnnouncementChannel = try container.decodeIfPresent(Bool.self, forKey: .isAnnouncementChannel)
        slowModeSeconds = try container.decodeIfPresent(Int.self, forKey: .slowModeSeconds)
        autoTranslateEnabled = try container.decodeIfPresent(Bool.self, forKey: .autoTranslateEnabled)
        lastMessageAt = try container.decodeIfPresent(Date.self, forKey: .lastMessageAt)
        updatedBy = try container.decodeIfPresent(SocketEventUser.self, forKey: .updatedBy)
        updatedAt = try container.decode(String.self, forKey: .updatedAt)
    }
}

public struct ParticipantLeftEvent: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
    public let displayName: String
    public let leftAt: String
}

public struct ParticipantBannedEvent: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
    public let bannedBy: SocketEventUser
    public let bannedAt: String
}

public struct ParticipantUnbannedEvent: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
}

public struct ConversationClosedEvent: Decodable, Sendable {
    public let conversationId: String
    public let closedBy: String
    public let closedAt: String
}

public struct MessageConsumedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let userId: String
    public let viewOnceCount: Int
    public let maxViewOnceCount: Int
    public let isFullyConsumed: Bool
}

// MARK: - Call Signaling Event Data

public struct SocketIceServer: Decodable, Sendable {
    public let urls: IceServerURLs
    public let username: String?
    public let credential: String?

    public enum IceServerURLs: Decodable, Sendable {
        case single(String)
        case multiple([String])

        public init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let str = try? container.decode(String.self) {
                self = .single(str)
            } else {
                self = .multiple(try container.decode([String].self))
            }
        }

        public var asArray: [String] {
            switch self {
            case .single(let url): return [url]
            case .multiple(let urls): return urls
            }
        }
    }
}

public struct CallOfferData: Decodable, Sendable {
    public let callId: String
    public let conversationId: String
    /// Architecture mode (`"p2p"` or `"sfu"`). NOT the media type — see `type`.
    public let mode: String?
    /// Media type (`"audio"` or `"video"`). Drives CallKit `hasVideo`.
    /// Optional for backwards compatibility with older gateway builds that
    /// did not include this field; absence is treated as audio call.
    public let type: String?
    public let initiator: CallInitiatorInfo
    public let iceServers: [SocketIceServer]?
    /// Audit P1-26 — initial participant list emitted by the gateway in
    /// `call:initiated`. Optional for backwards compat with older builds.
    /// Lets the iOS UI show all participants during the ringing phase
    /// rather than waiting for `call:participant-joined` events.
    public let participants: [CallParticipantInfo]?

    public struct CallInitiatorInfo: Decodable, Sendable {
        public let userId: String
        public let username: String
        public let displayName: String?
        public let avatar: String?
    }

    public struct CallParticipantInfo: Decodable, Sendable {
        public let id: String
        public let userId: String?
        public let role: String?
        public let isAudioEnabled: Bool?
        public let isVideoEnabled: Bool?
        public let username: String?
        public let displayName: String?
        public let avatar: String?
    }
}

public struct CallAnswerData: Decodable, Sendable {
    public let callId: String
    public let signal: CallSignalPayload
}

public struct CallSignalPayload: Decodable, Sendable {
    public let type: String
    public let sdp: String?
    public let candidate: String?
    public let sdpMLineIndex: Int?
    public let sdpMid: String?
    public let from: String?
    public let to: String?
}

public struct CallICECandidateData: Decodable, Sendable {
    public let callId: String
    public let signal: CallSignalPayload
}

public struct CallEndData: Decodable, Sendable {
    public let callId: String
    public let duration: Int?
    public let endedBy: String?
    /// Audit P1-24 — gateway emits `reason: CallEndReason` (`"missed"`,
    /// `"rejected"`, `"completed"`, `"connectionLost"`, `"failed"`,
    /// `"declined"`, `"answeredElsewhere"`). Without surfacing it on iOS,
    /// every remote-end was indistinguishable and CallKit reported every
    /// case as `.remoteEnded` — wrong for missed/declined/answeredElsewhere
    /// (Recents UX) and for analytics.
    public let reason: String?
}

/// Audit P1-25 — `call:missed` event payload. Gateway emits this on
/// ringing-timeout to the callee's user-room sockets (in addition to
/// `call:ended`). The dedicated event lets the iOS UI raise a missed-call
/// banner without inferring it from `endedBy != self`.
public struct CallMissedData: Decodable, Sendable {
    public let callId: String
    public let conversationId: String
    public let callerId: String
    public let callerName: String?
}

public struct CallParticipantData: Decodable, Sendable {
    public let callId: String
    public let participantId: String?
    public let userId: String?
    public let mode: String?
    public let iceServers: [SocketIceServer]?
}

public struct CallMediaToggleData: Decodable, Sendable {
    public let callId: String
    public let participantId: String?
    public let mediaType: String
    public let enabled: Bool
}

public struct CallErrorData: Decodable, Sendable {
    public let code: String?
    public let message: String?
}

// MARK: - Reaction Sync Event Data

public struct ReactionSyncEvent: Decodable, Sendable {
    public let messageId: String
    public let reactions: [ReactionAggregationEvent]
    public let totalCount: Int?
    public let userReactions: [String]?
}

// MARK: - System Message Event Data

public struct SystemMessageEvent: Decodable, Sendable {
    public let type: String
    public let content: String
}

// MARK: - Attachment Status Event Data

public struct AttachmentStatusEvent: Decodable, Sendable {
    public let attachmentId: String
    public let status: String
}

// MARK: - Mention Event Data

public struct MentionCreatedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let senderId: String?
    public let mentionedUserId: String?
    public let mentionedParticipantId: String?
    public let content: String?
    public let timestamp: String?
}

// MARK: - Notification Socket Event Data

public struct SocketNotificationEvent: Decodable, Sendable {
    public let id: String
    public let userId: String
    public let type: String
    public let title: String?
    public let content: String
    public let priority: String?
    public let isRead: Bool?

    // Gateway sends nested objects — decoded into typed structs
    public let actor: SocketNotificationActor?
    public let context: SocketNotificationContext?
    public let metadata: SocketNotificationMetadata?

    // Computed accessors: resolve from nested structs (gateway format)
    public var senderUsername: String? { actor?.username }
    public var senderDisplayName: String? { actor?.displayName }
    public var senderAvatar: String? { actor?.avatar }
    public var senderId: String? { actor?.id }
    public var conversationId: String? { context?.conversationId }
    public var messageId: String? { context?.messageId }
    public var postId: String? { context?.postId ?? metadata?.postId }
    public var postType: String? { metadata?.postType }
    public var messagePreview: String? { metadata?.commentPreview }
    public var conversationTitle: String? { context?.conversationTitle }
    public var conversationType: String? { context?.conversationType }
    public var isDirect: Bool { context?.conversationType == "direct" }
    public var attachments: SocketNotificationAttachments? { metadata?.attachments }

    public var attachmentLabel: String? {
        guard let att = metadata?.attachments, let count = att.count, count > 0 else { return nil }
        if count > 1 { return "\u{1F4CE} \(count) fichiers" }
        switch att.firstType {
        case "image": return "\u{1F4F7} Photo"
        case "video": return "\u{1F3AC} Vid\u{00E9}o"
        case "audio": return "\u{1F3B5} Audio"
        case "document": return "\u{1F4C4} Document"
        default: return "\u{1F4CE} Fichier"
        }
    }

    public var notificationType: MeeshyNotificationType {
        MeeshyNotificationType(rawValue: type) ?? .system
    }
}

public struct SocketNotificationActor: Decodable, Sendable {
    public let id: String?
    public let username: String?
    public let displayName: String?
    public let avatar: String?
}

public struct SocketNotificationContext: Decodable, Sendable {
    public let conversationId: String?
    public let conversationTitle: String?
    public let conversationType: String?
    public let messageId: String?
    public let postId: String?
    public let commentId: String?
    public let friendRequestId: String?
}

public struct SocketNotificationMetadata: Decodable, Sendable {
    public let postId: String?
    public let postType: String?
    public let commentPreview: String?
    public let emoji: String?
    public let attachments: SocketNotificationAttachments?
}

public struct SocketNotificationAttachments: Decodable, Sendable {
    public let count: Int?
    public let firstType: String?
    public let firstFilename: String?
}

public struct ConversationNewEvent: Decodable, Sendable {
    public let conversationId: String
    public let conversationType: String
    public let title: String?
    public let creatorId: String
    public let participantIds: [String]
    public let createdAt: String

    public init(
        conversationId: String,
        conversationType: String,
        title: String?,
        creatorId: String,
        participantIds: [String],
        createdAt: String
    ) {
        self.conversationId = conversationId
        self.conversationType = conversationType
        self.title = title
        self.creatorId = creatorId
        self.participantIds = participantIds
        self.createdAt = createdAt
    }
}

public struct NotificationReadEvent: Decodable, Sendable {
    public let notificationId: String
}

public struct NotificationDeletedEvent: Decodable, Sendable {
    public let notificationId: String
}

public struct NotificationCountsEvent: Decodable, Sendable {
    public let total: Int
    public let unread: Int
    public let byType: [String: Int]?
}

public struct ConversationOnlineStatsEvent: Decodable, Sendable {
    public let conversationId: String
    public let onlineUsers: [OnlineUserInfo]
    public let updatedAt: Date?

    public struct OnlineUserInfo: Decodable, Sendable {
        public let id: String
        public let username: String
        public let firstName: String?
        public let lastName: String?
    }
}

// MARK: - Connection State

public enum ConnectionState: Equatable, Sendable {
    case connected
    case connecting
    case reconnecting(attempt: Int)
    case disconnected
}

// MARK: - Protocol

public protocol MessageSocketProviding: Sendable {
    var messageReceived: PassthroughSubject<APIMessage, Never> { get }
    var messageEdited: PassthroughSubject<APIMessage, Never> { get }
    var messageDeleted: PassthroughSubject<MessageDeletedEvent, Never> { get }
    var reactionAdded: PassthroughSubject<ReactionUpdateEvent, Never> { get }
    var reactionRemoved: PassthroughSubject<ReactionUpdateEvent, Never> { get }
    var typingStarted: PassthroughSubject<TypingEvent, Never> { get }
    var typingStopped: PassthroughSubject<TypingEvent, Never> { get }
    var unreadUpdated: PassthroughSubject<UnreadUpdateEvent, Never> { get }
    var userStatusChanged: PassthroughSubject<UserStatusEvent, Never> { get }
    var readStatusUpdated: PassthroughSubject<ReadStatusUpdateEvent, Never> { get }
    var attachmentStatusUpdated: PassthroughSubject<AttachmentStatusUpdatedEvent, Never> { get }
    var conversationJoined: PassthroughSubject<ConversationParticipationEvent, Never> { get }
    var conversationJoinError: PassthroughSubject<ConversationJoinErrorEvent, Never> { get }
    var conversationLeft: PassthroughSubject<ConversationParticipationEvent, Never> { get }
    var participantRoleUpdated: PassthroughSubject<ParticipantRoleUpdatedEvent, Never> { get }
    var conversationUpdated: PassthroughSubject<ConversationUpdatedEvent, Never> { get }
    var participantSelfLeft: PassthroughSubject<ParticipantLeftEvent, Never> { get }
    var participantBanned: PassthroughSubject<ParticipantBannedEvent, Never> { get }
    var participantUnbanned: PassthroughSubject<ParticipantUnbannedEvent, Never> { get }
    var conversationClosed: PassthroughSubject<ConversationClosedEvent, Never> { get }
    var userPreferencesUpdated: PassthroughSubject<UserPreferencesUpdatedEvent, Never> { get }
    var conversationStatsReceived: PassthroughSubject<ConversationStatsEvent, Never> { get }
    var messageConsumed: PassthroughSubject<MessageConsumedEvent, Never> { get }
    var locationShared: PassthroughSubject<LocationSharedEvent, Never> { get }
    var liveLocationStarted: PassthroughSubject<LiveLocationStartedEvent, Never> { get }
    var liveLocationUpdated: PassthroughSubject<LiveLocationUpdatedEvent, Never> { get }
    var liveLocationStopped: PassthroughSubject<LiveLocationStoppedEvent, Never> { get }
    var translationReceived: PassthroughSubject<TranslationEvent, Never> { get }
    var transcriptionReady: PassthroughSubject<TranscriptionReadyEvent, Never> { get }
    var audioTranslationReady: PassthroughSubject<AudioTranslationEvent, Never> { get }
    var audioTranslationProgressive: PassthroughSubject<AudioTranslationEvent, Never> { get }
    var audioTranslationCompleted: PassthroughSubject<AudioTranslationEvent, Never> { get }
    var didReconnect: PassthroughSubject<Void, Never> { get }
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
    var conversationOnlineStats: PassthroughSubject<ConversationOnlineStatsEvent, Never> { get }
    var callOfferReceived: PassthroughSubject<CallOfferData, Never> { get }
    var callSignalOfferReceived: PassthroughSubject<CallAnswerData, Never> { get }
    var callAnswerReceived: PassthroughSubject<CallAnswerData, Never> { get }
    var callICECandidateReceived: PassthroughSubject<CallICECandidateData, Never> { get }
    var callEnded: PassthroughSubject<CallEndData, Never> { get }
    /// Audit P1-25 — dedicated `call:missed` event publisher (in addition to
    /// `callEnded` which is emitted in parallel for backwards-compat).
    var callMissed: PassthroughSubject<CallMissedData, Never> { get }
    var callParticipantJoined: PassthroughSubject<CallParticipantData, Never> { get }
    var callParticipantLeft: PassthroughSubject<CallParticipantData, Never> { get }
    var callMediaToggled: PassthroughSubject<CallMediaToggleData, Never> { get }
    var callError: PassthroughSubject<CallErrorData, Never> { get }
    var reactionSynced: PassthroughSubject<ReactionSyncEvent, Never> { get }
    var systemMessageReceived: PassthroughSubject<SystemMessageEvent, Never> { get }
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
    func emitLocationShare(payload: LocationSharePayload)
    func emitLiveLocationStart(payload: LiveLocationStartPayload)
    func emitLiveLocationUpdate(payload: LiveLocationUpdatePayload)
    func emitLiveLocationStop(conversationId: String)
    func sendWithAttachments(conversationId: String, content: String?, attachmentIds: [String], replyToId: String?, storyReplyToId: String?, originalLanguage: String?, isEncrypted: Bool, clientMessageId: String?)
    func emitCallInitiate(conversationId: String, isVideo: Bool) async throws -> MessageSocketManager.CallInitiateAck
    func emitCallJoin(callId: String)
    func emitCallLeave(callId: String)
    func emitCallSignal(callId: String, type: String, payload: [String: Any])
    func emitCallSignalWithAck(callId: String, type: String, payload: [String: Any]) async -> Bool
    func emitCallToggleAudio(callId: String, enabled: Bool)
    func emitCallToggleVideo(callId: String, enabled: Bool)
    func emitCallEnd(callId: String)
    func emitCallHeartbeat(callId: String)
}

// MARK: - Protocol Default-Arg Convenience

/// Default-arg shims for source-compatibility with pre-Phase-4 call sites
/// that do not yet pass `clientMessageId`. Protocol requirements cannot have
/// default parameter values directly, so the convenience overload lives in
/// an extension. Phase 4 call sites SHOULD pass an explicit `clientMessageId`
/// so the optimistic row, the ACK echo, and the `message:new` broadcast can
/// be reconciled by the same end-to-end identifier.
public extension MessageSocketProviding {
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
            clientMessageId: nil
        )
    }
}

// MARK: - Message Socket Manager

public final class MessageSocketManager: ObservableObject, MessageSocketProviding, @unchecked Sendable {
    public static let shared = MessageSocketManager()

    // Combine publishers — messages
    public let messageReceived = PassthroughSubject<APIMessage, Never>()
    public let messageEdited = PassthroughSubject<APIMessage, Never>()
    public let messageDeleted = PassthroughSubject<MessageDeletedEvent, Never>()

    // Combine publishers — reactions
    public let reactionAdded = PassthroughSubject<ReactionUpdateEvent, Never>()
    public let reactionRemoved = PassthroughSubject<ReactionUpdateEvent, Never>()

    // Combine publishers — typing
    public let typingStarted = PassthroughSubject<TypingEvent, Never>()
    public let typingStopped = PassthroughSubject<TypingEvent, Never>()

    // Combine publishers — presence
    public let unreadUpdated = PassthroughSubject<UnreadUpdateEvent, Never>()
    public let userStatusChanged = PassthroughSubject<UserStatusEvent, Never>()

    // Combine publishers — read status
    public let readStatusUpdated = PassthroughSubject<ReadStatusUpdateEvent, Never>()

    // Combine publishers — attachment status
    public let attachmentStatusUpdated = PassthroughSubject<AttachmentStatusUpdatedEvent, Never>()

    // Combine publishers — conversation participation
    public let conversationJoined = PassthroughSubject<ConversationParticipationEvent, Never>()
    public let conversationJoinError = PassthroughSubject<ConversationJoinErrorEvent, Never>()
    public let conversationLeft = PassthroughSubject<ConversationParticipationEvent, Never>()

    // Combine publishers — participant role
    public let participantRoleUpdated = PassthroughSubject<ParticipantRoleUpdatedEvent, Never>()

    // Combine publishers — conversation & participant lifecycle
    public let conversationUpdated = PassthroughSubject<ConversationUpdatedEvent, Never>()
    public let participantSelfLeft = PassthroughSubject<ParticipantLeftEvent, Never>()
    public let participantBanned = PassthroughSubject<ParticipantBannedEvent, Never>()
    public let participantUnbanned = PassthroughSubject<ParticipantUnbannedEvent, Never>()
    public let conversationClosed = PassthroughSubject<ConversationClosedEvent, Never>()

    // Combine publishers — user preferences
    public let userPreferencesUpdated = PassthroughSubject<UserPreferencesUpdatedEvent, Never>()

    // Combine publishers — conversation stats
    public let conversationStatsReceived = PassthroughSubject<ConversationStatsEvent, Never>()

    // Combine publishers — view-once
    public let messageConsumed = PassthroughSubject<MessageConsumedEvent, Never>()

    // Combine publishers — location sharing
    public let locationShared = PassthroughSubject<LocationSharedEvent, Never>()
    public let liveLocationStarted = PassthroughSubject<LiveLocationStartedEvent, Never>()
    public let liveLocationUpdated = PassthroughSubject<LiveLocationUpdatedEvent, Never>()
    public let liveLocationStopped = PassthroughSubject<LiveLocationStoppedEvent, Never>()

    // Combine publishers — translation
    public let translationReceived = PassthroughSubject<TranslationEvent, Never>()

    // Combine publishers — transcription & audio
    public let transcriptionReady = PassthroughSubject<TranscriptionReadyEvent, Never>()
    public let audioTranslationReady = PassthroughSubject<AudioTranslationEvent, Never>()
    public let audioTranslationProgressive = PassthroughSubject<AudioTranslationEvent, Never>()
    public let audioTranslationCompleted = PassthroughSubject<AudioTranslationEvent, Never>()

    // Combine publisher — reconnection (fires after successful reconnect)
    public let didReconnect = PassthroughSubject<Void, Never>()

    // Combine publishers — notifications
    public let notificationReceived = PassthroughSubject<SocketNotificationEvent, Never>()
    public let conversationNew = PassthroughSubject<ConversationNewEvent, Never>()
    public let notificationRead = PassthroughSubject<NotificationReadEvent, Never>()
    public let notificationDeleted = PassthroughSubject<NotificationDeletedEvent, Never>()
    public let notificationCounts = PassthroughSubject<NotificationCountsEvent, Never>()

    // Combine publishers — conversation online stats
    public let conversationOnlineStats = PassthroughSubject<ConversationOnlineStatsEvent, Never>()

    // Combine publishers — call signaling
    public let callOfferReceived = PassthroughSubject<CallOfferData, Never>()
    public let callSignalOfferReceived = PassthroughSubject<CallAnswerData, Never>()
    public let callAnswerReceived = PassthroughSubject<CallAnswerData, Never>()
    public let callICECandidateReceived = PassthroughSubject<CallICECandidateData, Never>()
    public let callEnded = PassthroughSubject<CallEndData, Never>()
    public let callMissed = PassthroughSubject<CallMissedData, Never>()
    public let callParticipantJoined = PassthroughSubject<CallParticipantData, Never>()
    public let callParticipantLeft = PassthroughSubject<CallParticipantData, Never>()
    public let callMediaToggled = PassthroughSubject<CallMediaToggleData, Never>()
    public let callError = PassthroughSubject<CallErrorData, Never>()

    // Combine publishers — reactions sync, system, attachments, mentions
    public let reactionSynced = PassthroughSubject<ReactionSyncEvent, Never>()
    public let systemMessageReceived = PassthroughSubject<SystemMessageEvent, Never>()
    public let mentionCreated = PassthroughSubject<MentionCreatedEvent, Never>()

    @Published public var isConnected = false
    @Published public var connectionState: ConnectionState = .disconnected

    // The currently active (foreground) conversation for priority re-join
    public var activeConversationId: String?

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private var joinedConversations: Set<String> = []
    private var reconnectAttempt: Int = 0
    private var hadPreviousConnection = false
    private var heartbeatTimer: Timer?

    // Cached formatters — ISO8601DateFormatter is expensive to allocate.
    // Safe to share: options are set once during init and never mutated after.
    private nonisolated(unsafe) static let isoFormatterWithFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private nonisolated(unsafe) static let isoFormatterBasic: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    deinit {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
    }

    private init() {}

    // MARK: - JWT Helpers

    private static func isJWTExpired(_ token: String) -> Bool {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return true }
        var base64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        guard let data = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = json["exp"] as? TimeInterval else { return true }
        return Date(timeIntervalSince1970: exp).addingTimeInterval(-30) < Date()
    }

    // MARK: - Connection

    public func connect() {
        guard socket == nil || socket?.status != .connected else { return }

        guard let token = APIClient.shared.authToken else {
            Logger.socket.warning("No auth token, skipping connect")
            return
        }

        let tokenExpired = Self.isJWTExpired(token)
        if tokenExpired {
            Logger.socket.warning("MessageSocket: JWT expired, triggering refresh instead of connecting")
            Task { @MainActor in
                AuthManager.shared.handleUnauthorized()
            }
            return
        }

        guard let url = SocketConfig.baseURL else { return }

        DispatchQueue.main.async { self.connectionState = .connecting }

        manager = SocketManager(socketURL: url, config: [
            .log(false),
            .compress,
            .extraHeaders(["Authorization": "Bearer \(token)"]),
            .forceWebsockets(true),
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(16),
            .reconnectAttempts(-1),
        ])

        socket = manager?.defaultSocket
        setupEventHandlers()
        socket?.connect()
    }

    public func connectAnonymous(sessionToken: String) {
        disconnect()

        guard let url = SocketConfig.baseURL else { return }

        DispatchQueue.main.async { self.connectionState = .connecting }

        manager = SocketManager(socketURL: url, config: [
            .log(false),
            .compress,
            .extraHeaders(["X-Session-Token": sessionToken]),
            .forceWebsockets(true),
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(16),
            .reconnectAttempts(-1),
        ])

        socket = manager?.defaultSocket
        setupEventHandlers()
        socket?.connect()
    }

    public func disconnect() {
        stopHeartbeat()
        joinedConversations.removeAll()
        activeConversationId = nil
        socket?.disconnect()
        socket = nil
        manager = nil
        isConnected = false
        connectionState = .disconnected
        reconnectAttempt = 0
        hadPreviousConnection = false
    }

    // MARK: - Background lifecycle

    /// Called when the app transitions to `.background`. We stop the
    /// heartbeat timer so it cannot fire into an OS-frozen runtime and we
    /// explicitly tear down the socket so `isConnected` cannot lie to the
    /// resume path. iOS suspension silently kills the WebSocket without
    /// always firing the `disconnect` event — if we trusted
    /// `isConnected == true` on resume, the guard
    /// `if !isConnected { connect() }` would never reconnect and the app
    /// would appear authenticated but receive zero real-time events.
    public func prepareForBackground() {
        stopHeartbeat()
        disconnect()
    }

    /// Called when the app comes back to `.active`. Since
    /// `prepareForBackground()` explicitly tore the socket down, this is
    /// just a plain reconnect — no stale-state decision to make.
    /// Reads the token from `APIClient` (nonisolated mirror of
    /// `AuthManager.authToken`) to keep this hook callable from any context.
    public func resumeFromBackground() {
        guard APIClient.shared.authToken != nil else { return }
        forceReconnect()
    }

    /// Tear down and rebuild the socket unconditionally. Use this on
    /// foreground resume or after a token refresh so we never depend on
    /// the potentially stale `isConnected` flag. `disconnect()` clears
    /// the flag and nils the underlying socket; `connect()` rebuilds it.
    public func forceReconnect() {
        disconnect()
        connect()
    }

    // MARK: - Heartbeat

    private func startHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            self?.socket?.emit("heartbeat")
        }
    }

    private func stopHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
    }

    // MARK: - Room Management

    public func joinConversation(_ conversationId: String) {
        guard !joinedConversations.contains(conversationId) else { return }
        socket?.emit("conversation:join", ["conversationId": conversationId])
        joinedConversations.insert(conversationId)
        Logger.socket.info("Joined conversation: \(conversationId)")
    }

    public func leaveConversation(_ conversationId: String) {
        guard joinedConversations.contains(conversationId) else { return }
        socket?.emit("conversation:leave", ["conversationId": conversationId])
        joinedConversations.remove(conversationId)
        Logger.socket.info("Left conversation: \(conversationId)")
    }

    // MARK: - Typing Emission

    public func emitTypingStart(conversationId: String) {
        socket?.emit("typing:start", ["conversationId": conversationId])
    }

    public func emitTypingStop(conversationId: String) {
        socket?.emit("typing:stop", ["conversationId": conversationId])
    }

    // MARK: - Translation Request

    public func requestTranslation(messageId: String, targetLanguage: String) {
        socket?.emit("translation:request", ["messageId": messageId, "targetLanguage": targetLanguage])
        Logger.socket.info("Requested translation for \(messageId) -> \(targetLanguage)")
    }

    // MARK: - Location Emission

    public func emitLocationShare(payload: LocationSharePayload) {
        guard let data = try? JSONEncoder().encode(payload),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        socket?.emit("location:share", dict)
    }

    public func emitLiveLocationStart(payload: LiveLocationStartPayload) {
        guard let data = try? JSONEncoder().encode(payload),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        socket?.emit("location:live-start", dict)
    }

    public func emitLiveLocationUpdate(payload: LiveLocationUpdatePayload) {
        guard let data = try? JSONEncoder().encode(payload),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        socket?.emit("location:live-update", dict)
    }

    public func emitLiveLocationStop(conversationId: String) {
        socket?.emit("location:live-stop", ["conversationId": conversationId])
    }

    // MARK: - Send With Attachments

    /// ACK returned by the gateway after `message:send-with-attachments`.
    /// Phase 4 (spec §6.2) requires `_sendResponse()` to echo back the same
    /// `clientMessageId` the client supplied in the request so the local
    /// outbox/optimistic layer can match the row without scraping the
    /// `message:new` broadcast. `clientMessageId` is optional on the wire
    /// during the rollout window — older gateway builds drop the field.
    public struct SendMessageAck: Sendable {
        public let messageId: String
        public let clientMessageId: String?

        public init(messageId: String, clientMessageId: String?) {
            self.messageId = messageId
            self.clientMessageId = clientMessageId
        }
    }

    private func buildAttachmentPayload(
        conversationId: String, content: String?, attachmentIds: [String],
        replyToId: String?, storyReplyToId: String? = nil, originalLanguage: String?, isEncrypted: Bool,
        clientMessageId: String
    ) -> [String: Any] {
        var payload: [String: Any] = [
            "conversationId": conversationId,
            "content": content ?? "",
            "attachmentIds": attachmentIds,
            "isEncrypted": isEncrypted,
            "clientMessageId": clientMessageId
        ]
        if let replyToId { payload["replyToId"] = replyToId }
        if let storyReplyToId { payload["storyReplyToId"] = storyReplyToId }
        if let originalLanguage { payload["originalLanguage"] = originalLanguage }
        return payload
    }

    public func sendWithAttachments(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String? = nil,
        originalLanguage: String? = nil,
        isEncrypted: Bool = false,
        clientMessageId: String? = nil
    ) {
        let cid = clientMessageId ?? ClientMessageId.generate()
        let payload = buildAttachmentPayload(
            conversationId: conversationId, content: content, attachmentIds: attachmentIds,
            replyToId: replyToId, storyReplyToId: storyReplyToId, originalLanguage: originalLanguage, isEncrypted: isEncrypted,
            clientMessageId: cid
        )
        socket?.emit("message:send-with-attachments", payload)
    }

    /// Emits `message:send-with-attachments` and awaits the gateway ACK.
    /// Returns the full `SendMessageAck` (server `messageId` + the echoed
    /// `clientMessageId` from the request) so callers can reconcile the
    /// optimistic row by `clientMessageId` rather than waiting for the
    /// targeted `message:new` broadcast. Returns `nil` on timeout / no socket
    /// / server error.
    public func sendWithAttachmentsAsync(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String? = nil,
        originalLanguage: String? = nil,
        isEncrypted: Bool = false,
        clientMessageId: String? = nil
    ) async -> SendMessageAck? {
        guard let socket else { return nil }
        let cid = clientMessageId ?? ClientMessageId.generate()
        let payload = buildAttachmentPayload(
            conversationId: conversationId, content: content, attachmentIds: attachmentIds,
            replyToId: replyToId, storyReplyToId: storyReplyToId, originalLanguage: originalLanguage, isEncrypted: isEncrypted,
            clientMessageId: cid
        )
        return await withCheckedContinuation { continuation in
            socket.emitWithAck("message:send-with-attachments", payload).timingOut(after: 30) { items in
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool, success,
                   let data = response["data"] as? [String: Any],
                   let messageId = data["messageId"] as? String {
                    let ackCid = data["clientMessageId"] as? String ?? cid
                    continuation.resume(returning: SendMessageAck(messageId: messageId, clientMessageId: ackCid))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    // MARK: - Call Signaling Emission

    public enum CallInitiateError: Error, Sendable {
        case noSocket
        case timeout
        case serverError(String)
        case malformedResponse
    }

    public struct CallInitiateAck: Sendable {
        public let callId: String
        public let mode: String?
        public let iceServers: [SocketIceServer]

        public init(callId: String, mode: String?, iceServers: [SocketIceServer]) {
            self.callId = callId
            self.mode = mode
            self.iceServers = iceServers
        }
    }

    /// Emits `call:initiate` and awaits the gateway ACK that returns the real
    /// MongoDB callId, mode and per-user ICE servers (TURN credentials).
    /// The caller MUST configure WebRTC with these ICE servers BEFORE building
    /// any SDP offer — otherwise NAT-symmetric peers can never connect.
    public func emitCallInitiate(conversationId: String, isVideo: Bool) async throws -> CallInitiateAck {
        guard let socket else { throw CallInitiateError.noSocket }
        let payload: [String: Any] = [
            "conversationId": conversationId,
            "type": isVideo ? "video" : "audio"
        ]
        return try await withCheckedThrowingContinuation { continuation in
            var resumed = false
            socket.emitWithAck("call:initiate", payload).timingOut(after: 10) { items in
                guard !resumed else { return }
                resumed = true

                guard let response = items.first as? [String: Any] else {
                    continuation.resume(throwing: CallInitiateError.timeout)
                    return
                }
                guard let success = response["success"] as? Bool, success,
                      let data = response["data"] as? [String: Any],
                      let callId = data["callId"] as? String else {
                    let message = (response["error"] as? [String: Any])?["message"] as? String
                        ?? (response["error"] as? String)
                        ?? "unknown error"
                    continuation.resume(throwing: CallInitiateError.serverError(message))
                    return
                }

                let mode = data["mode"] as? String
                let rawServers = data["iceServers"] as? [[String: Any]] ?? []

                guard let serversData = try? JSONSerialization.data(withJSONObject: rawServers),
                      let servers = try? JSONDecoder().decode([SocketIceServer].self, from: serversData) else {
                    continuation.resume(throwing: CallInitiateError.malformedResponse)
                    return
                }

                continuation.resume(returning: CallInitiateAck(callId: callId, mode: mode, iceServers: servers))
            }
        }
    }

    public func emitCallJoin(callId: String) {
        socket?.emit("call:join", ["callId": callId])
    }

    public func emitCallLeave(callId: String) {
        socket?.emit("call:leave", ["callId": callId])
    }

    public func emitCallSignal(callId: String, type: String, payload: [String: Any]) {
        var signal: [String: Any] = ["type": type]
        for (key, value) in payload { signal[key] = value }
        socket?.emit("call:signal", ["callId": callId, "signal": signal])
    }

    /// PERF-004: Emit a `call:signal` and await the gateway ACK with a 3s
    /// timeout. Returns `true` once the gateway confirms the signal was
    /// relayed to the peer, `false` on timeout / no socket / server error.
    /// Used for the SDP answer path so CXAnswerCallAction.fulfill() only
    /// runs after the answer is on the wire — without this, CallKit would
    /// race the WebRTC signaling and the audio engine could start before
    /// the peer has received the answer.
    public func emitCallSignalWithAck(callId: String, type: String, payload: [String: Any]) async -> Bool {
        guard let socket else { return false }
        var signal: [String: Any] = ["type": type]
        for (key, value) in payload { signal[key] = value }
        return await withCheckedContinuation { continuation in
            var resumed = false
            socket.emitWithAck("call:signal", ["callId": callId, "signal": signal]).timingOut(after: 3) { items in
                guard !resumed else { return }
                resumed = true
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool {
                    continuation.resume(returning: success)
                } else if items.isEmpty {
                    continuation.resume(returning: false)
                } else {
                    continuation.resume(returning: false)
                }
            }
        }
    }

    public func emitCallToggleAudio(callId: String, enabled: Bool) {
        socket?.emit("call:toggle-audio", ["callId": callId, "enabled": enabled])
    }

    public func emitCallToggleVideo(callId: String, enabled: Bool) {
        socket?.emit("call:toggle-video", ["callId": callId, "enabled": enabled])
    }

    public func emitCallEnd(callId: String) {
        socket?.emit("call:end", ["callId": callId])
    }

    public func emitCallHeartbeat(callId: String) {
        socket?.emit("call:heartbeat", ["callId": callId])
    }

    // MARK: - Event Handlers

    private func setupEventHandlers() {
        guard let socket else { return }

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self else { return }
            let wasReconnect = self.hadPreviousConnection
            self.hadPreviousConnection = true
            self.reconnectAttempt = 0

            DispatchQueue.main.async {
                self.isConnected = true
                self.connectionState = .connected
            }

            self.startHeartbeat()

            // Re-join all tracked conversations
            // Priority: active conversation first for fastest UX
            if let activeId = self.activeConversationId, self.joinedConversations.contains(activeId) {
                self.socket?.emit("conversation:join", ["conversationId": activeId])
            }
            for convId in self.joinedConversations where convId != self.activeConversationId {
                self.socket?.emit("conversation:join", ["conversationId": convId])
            }

            if wasReconnect {
                Logger.socket.info("MessageSocket reconnected — re-joined \(self.joinedConversations.count) room(s)")
                DispatchQueue.main.async { self.didReconnect.send(()) }
            } else {
                Logger.socket.info("MessageSocket connected")
            }
        }

        socket.on(clientEvent: .disconnect) { [weak self] _, _ in
            guard let self else { return }
            self.stopHeartbeat()
            DispatchQueue.main.async {
                self.isConnected = false
                if self.hadPreviousConnection {
                    self.connectionState = .reconnecting(attempt: 0)
                } else {
                    self.connectionState = .disconnected
                }
            }
            Logger.socket.info("MessageSocket disconnected")
        }

        socket.on(clientEvent: .reconnectAttempt) { [weak self] _, _ in
            guard let self else { return }
            self.reconnectAttempt += 1
            let attempt = self.reconnectAttempt
            DispatchQueue.main.async {
                self.connectionState = .reconnecting(attempt: attempt)
            }
            Logger.socket.info("MessageSocket reconnect attempt \(attempt)")
        }

        socket.on(clientEvent: .error) { data, _ in
            // Log but NEVER force a logout from a socket error. Loose string
            // matching on error payloads produced false positives that kicked
            // the user out on transient failures. Socket.IO's built-in
            // reconnect loop will retry; the APIClient 401 path (which calls
            // `AuthManager.handleUnauthorized`) is the only place that can
            // trigger a silent token refresh, and even that preserves the
            // session on failure.
            Logger.socket.error("MessageSocket error: \(data)")
        }

        // --- Message events ---

        socket.on("message:new") { [weak self] data, _ in
            guard let self else { return }
            self.decode(APIMessage.self, from: data) { [weak self] msg in
                self?.messageReceived.send(msg)
            }
        }

        socket.on("message:edited") { [weak self] data, _ in
            guard let self else { return }
            self.decode(APIMessage.self, from: data) { [weak self] msg in
                self?.messageEdited.send(msg)
            }
        }

        socket.on("message:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageDeletedEvent.self, from: data) { [weak self] event in
                self?.messageDeleted.send(event)
            }
        }

        // --- Reaction events ---

        socket.on("reaction:added") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.reactionAdded.send(event)
            }
        }

        socket.on("reaction:removed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.reactionRemoved.send(event)
            }
        }

        // --- Typing events ---

        socket.on("typing:start") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TypingEvent.self, from: data) { [weak self] event in
                self?.typingStarted.send(event)
            }
        }

        socket.on("typing:stop") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TypingEvent.self, from: data) { [weak self] event in
                self?.typingStopped.send(event)
            }
        }

        // --- Unread events ---

        socket.on("conversation:unread-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UnreadUpdateEvent.self, from: data) { [weak self] event in
                self?.unreadUpdated.send(event)
            }
        }

        // --- User status events ---

        socket.on("user:status") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UserStatusEvent.self, from: data) { [weak self] event in
                self?.userStatusChanged.send(event)
            }
        }

        // --- Translation events ---

        socket.on("message:translation") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranslationEvent.self, from: data) { [weak self] event in
                self?.translationReceived.send(event)
            }
        }

        socket.on("message:translated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranslationEvent.self, from: data) { [weak self] event in
                self?.translationReceived.send(event)
            }
        }

        // --- Transcription events ---

        socket.on("audio:transcription-ready") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranscriptionReadyEvent.self, from: data) { [weak self] event in
                self?.transcriptionReady.send(event)
            }
        }

        // --- Audio translation events ---

        socket.on("audio:translation-ready") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationEvent.self, from: data) { [weak self] event in
                self?.audioTranslationReady.send(event)
            }
        }

        socket.on("audio:translations-progressive") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationEvent.self, from: data) { [weak self] event in
                self?.audioTranslationProgressive.send(event)
            }
        }

        socket.on("audio:translations-completed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationEvent.self, from: data) { [weak self] event in
                self?.audioTranslationCompleted.send(event)
            }
        }

        // --- Read status events ---

        socket.on("read-status:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ReadStatusUpdateEvent.self, from: data) { [weak self] event in
                self?.readStatusUpdated.send(event)
            }
        }

        socket.on("attachment-status:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AttachmentStatusUpdatedEvent.self, from: data) { [weak self] event in
                self?.attachmentStatusUpdated.send(event)
            }
        }

        socket.on("message:consumed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageConsumedEvent.self, from: data) { [weak self] event in
                self?.messageConsumed.send(event)
            }
        }

        // --- Conversation participation events ---

        socket.on("conversation:joined") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationParticipationEvent.self, from: data) { [weak self] event in
                self?.conversationJoined.send(event)
            }
        }

        socket.on("conversation:join-error") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationJoinErrorEvent.self, from: data) { [weak self] event in
                self?.conversationJoinError.send(event)
            }
        }

        socket.on("conversation:left") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationParticipationEvent.self, from: data) { [weak self] event in
                self?.conversationLeft.send(event)
            }
        }

        // --- Participant role events ---

        socket.on("participant:role-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantRoleUpdatedEvent.self, from: data) { [weak self] event in
                self?.participantRoleUpdated.send(event)
            }
        }

        socket.on("conversation:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationUpdatedEvent.self, from: data) { [weak self] event in
                self?.conversationUpdated.send(event)
            }
        }

        socket.on("conversation:participant-left") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantLeftEvent.self, from: data) { [weak self] event in
                self?.participantSelfLeft.send(event)
            }
        }

        socket.on("conversation:participant-banned") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantBannedEvent.self, from: data) { [weak self] event in
                self?.participantBanned.send(event)
            }
        }

        socket.on("conversation:participant-unbanned") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantUnbannedEvent.self, from: data) { [weak self] event in
                self?.participantUnbanned.send(event)
            }
        }

        socket.on("conversation:closed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationClosedEvent.self, from: data) { [weak self] event in
                self?.conversationClosed.send(event)
            }
        }

        socket.on("user:preferences-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UserPreferencesUpdatedEvent.self, from: data) { [weak self] event in
                self?.userPreferencesUpdated.send(event)
            }
        }

        socket.on("conversation:stats") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationStatsEvent.self, from: data) { [weak self] event in
                self?.conversationStatsReceived.send(event)
            }
        }

        // --- Location events ---

        socket.on("location:shared") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LocationSharedEvent.self, from: data) { [weak self] event in
                self?.locationShared.send(event)
            }
        }

        socket.on("location:live-started") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LiveLocationStartedEvent.self, from: data) { [weak self] event in
                self?.liveLocationStarted.send(event)
            }
        }

        socket.on("location:live-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LiveLocationUpdatedEvent.self, from: data) { [weak self] event in
                self?.liveLocationUpdated.send(event)
            }
        }

        socket.on("location:live-stopped") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LiveLocationStoppedEvent.self, from: data) { [weak self] event in
                self?.liveLocationStopped.send(event)
            }
        }

        // --- Conversation discovery events ---

        socket.on("conversation:new") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationNewEvent.self, from: data) { [weak self] event in
                self?.conversationNew.send(event)
            }
        }

        // --- Notification events ---

        socket.on("notification:new") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketNotificationEvent.self, from: data) { [weak self] event in
                self?.notificationReceived.send(event)
            }
        }

        socket.on("notification") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketNotificationEvent.self, from: data) { [weak self] event in
                self?.notificationReceived.send(event)
            }
        }

        socket.on("notification:read") { [weak self] data, _ in
            guard let self else { return }
            self.decode(NotificationReadEvent.self, from: data) { [weak self] event in
                self?.notificationRead.send(event)
            }
        }

        socket.on("notification:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(NotificationDeletedEvent.self, from: data) { [weak self] event in
                self?.notificationDeleted.send(event)
            }
        }

        socket.on("notification:counts") { [weak self] data, _ in
            guard let self else { return }
            self.decode(NotificationCountsEvent.self, from: data) { [weak self] event in
                self?.notificationCounts.send(event)
            }
        }

        // --- Conversation online stats events ---

        socket.on("conversation:online-stats") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationOnlineStatsEvent.self, from: data) { [weak self] event in
                self?.conversationOnlineStats.send(event)
            }
        }

        // --- Mention events ---

        socket.on("mention:created") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MentionCreatedEvent.self, from: data) { [weak self] event in
                self?.mentionCreated.send(event)
            }
        }

        // --- Call signaling events ---

        socket.on("call:initiated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallOfferData.self, from: data) { [weak self] event in
                self?.callOfferReceived.send(event)
            }
        }

        socket.on("call:signal") { [weak self] data, _ in
            guard let self else { return }
            guard let first = data.first as? [String: Any],
                  let signalDict = first["signal"] as? [String: Any],
                  let signalType = signalDict["type"] as? String else { return }

            switch signalType {
            case "offer":
                self.decode(CallAnswerData.self, from: data) { [weak self] event in
                    self?.callSignalOfferReceived.send(event)
                }
            case "answer":
                self.decode(CallAnswerData.self, from: data) { [weak self] event in
                    self?.callAnswerReceived.send(event)
                }
            case "ice-candidate":
                self.decode(CallICECandidateData.self, from: data) { [weak self] event in
                    self?.callICECandidateReceived.send(event)
                }
            default:
                Logger.socket.info("Unknown call signal type: \(signalType)")
            }
        }

        socket.on("call:ended") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallEndData.self, from: data) { [weak self] event in
                self?.callEnded.send(event)
            }
        }

        // Audit P1-25 — register the dedicated `call:missed` listener.
        // Gateway emits this event in addition to `call:ended` when the
        // ringing timeout fires and the callee never answered, so the iOS
        // UI can surface a missed-call state explicitly instead of having
        // to infer it from `endedBy != self`.
        socket.on("call:missed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallMissedData.self, from: data) { [weak self] event in
                self?.callMissed.send(event)
            }
        }

        socket.on("call:participant-joined") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallParticipantData.self, from: data) { [weak self] event in
                self?.callParticipantJoined.send(event)
            }
        }

        socket.on("call:participant-left") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallParticipantData.self, from: data) { [weak self] event in
                self?.callParticipantLeft.send(event)
            }
        }

        socket.on("call:media-toggled") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallMediaToggleData.self, from: data) { [weak self] event in
                self?.callMediaToggled.send(event)
            }
        }

        socket.on("call:error") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallErrorData.self, from: data) { [weak self] event in
                self?.callError.send(event)
            }
        }

        // --- Reaction sync events ---

        socket.on("reaction:sync") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ReactionSyncEvent.self, from: data) { [weak self] event in
                self?.reactionSynced.send(event)
            }
        }

        // --- System message events ---

        socket.on("system:message") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SystemMessageEvent.self, from: data) { [weak self] event in
                self?.systemMessageReceived.send(event)
            }
        }

    }

    // MARK: - Decode Helper

    private nonisolated func decode<T: Decodable & Sendable>(_ type: T.Type, from data: [Any], handler: @escaping @Sendable (T) -> Void) {
        guard let first = data.first else { return }

        do {
            let jsonData: Data
            if let dict = first as? [String: Any] {
                jsonData = try JSONSerialization.data(withJSONObject: dict)
            } else if let str = first as? String {
                jsonData = Data(str.utf8)
            } else {
                return
            }

            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .custom { decoder in
                let container = try decoder.singleValueContainer()
                let dateStr = try container.decode(String.self)
                if let date = MessageSocketManager.isoFormatterWithFractional.date(from: dateStr) { return date }
                if let date = MessageSocketManager.isoFormatterBasic.date(from: dateStr) { return date }
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
            }
            let decoded = try decoder.decode(type, from: jsonData)
            DispatchQueue.main.async {
                handler(decoded)
            }
        } catch {
            // Log raw JSON keys for debugging decode failures
            if let dict = first as? [String: Any] {
                let keys = dict.keys.sorted().joined(separator: ", ")
                Logger.socket.error("Decode error for \(String(describing: type)): \(error) — keys: [\(keys)]")
            } else {
                Logger.socket.error("Decode error for \(String(describing: type)): \(error)")
            }
        }
    }
}
