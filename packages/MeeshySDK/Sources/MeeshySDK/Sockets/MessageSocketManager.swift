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

public struct MessagePinnedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let pinnedBy: String?
    public let pinnedAt: String?

    public init(messageId: String, conversationId: String, pinnedBy: String? = nil, pinnedAt: String? = nil) {
        self.messageId = messageId
        self.conversationId = conversationId
        self.pinnedBy = pinnedBy
        self.pinnedAt = pinnedAt
    }
}

public struct MessageUnpinnedEvent: Decodable, Sendable {
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

/// BUG2 A' — delta de réaction par-image reçu du serveur
/// (`attachment:reaction-added` / `attachment:reaction-removed`). `reactionSummary`
/// porte les comptes agrégés APRÈS l'action ; l'état « ma réaction » est maintenu
/// côté client (optimiste + cold-load REST), miroir des réactions message-level.
public struct AttachmentReactionUpdateEvent: Decodable, Sendable {
    public let attachmentId: String
    public let messageId: String
    public let conversationId: String?
    public let participantId: String?
    public let emoji: String
    public let action: String?
    public let reactionSummary: [String: Int]?
    public let timestamp: String?
}

public struct TypingEvent: Decodable, Sendable {
    public let userId: String
    /// Identifiant (handle) de l'utilisateur.
    public let username: String
    /// Nom d'affichage explicite (displayName saisi ou « Prénom Nom »). `nil` si le
    /// gateway ne l'a pas transmis (version antérieure). Le gateway transmet les deux
    /// valeurs brutes — le client choisit quoi afficher via `preferredDisplayName`.
    public let displayName: String?
    public let conversationId: String

    /// Nom à afficher dans l'indicateur de frappe : `displayName` en priorité,
    /// `username` en repli. La décision d'affichage appartient au client.
    public var preferredDisplayName: String {
        if let displayName, !displayName.isEmpty { return displayName }
        return username
    }

    public init(userId: String, username: String, displayName: String? = nil, conversationId: String) {
        self.userId = userId
        self.username = username
        self.displayName = displayName
        self.conversationId = conversationId
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

/// `user:preferences-updated` — **conversation scope**. Mirrors the gateway's
/// `UserPreferencesConversationUpdatedEventData` (versioned per-conversation
/// preferences). The same socket event name also carries a flat **category
/// scope** (`{ userId, category }`) decoded by `UserPreferencesUpdatedEvent`;
/// the decode site discriminates on the presence of `conversationId`.
///
/// `version` drives optimistic-vs-socket resolution in `ConversationStore`
/// (drop when `version <= local`). `reset == true` (DELETE) carries
/// `preferences == nil` — the client restores its local defaults.
public struct UserPreferencesConversationUpdatedSocketEvent: Decodable, Sendable {
    public struct Preferences: Decodable, Sendable {
        public let isPinned: Bool
        public let isMuted: Bool
        public let mentionsOnly: Bool
        public let isArchived: Bool
        public let tags: [String]
        public let categoryId: String?
        public let orderInCategory: Int?
        public let customName: String?
        public let reaction: String?
        public let deletedForUserAt: Date?
        public let clearHistoryBefore: Date?
    }
    public let userId: String
    public let conversationId: String
    public let version: Int
    public let reset: Bool
    public let preferences: Preferences?
}

/// `conversation:deleted` — per-user soft delete broadcast to the user's room.
/// Named `…SocketEvent` to avoid clashing with `ConversationDeletedEvent`
/// (the store input type, same module).
public struct ConversationDeletedSocketEvent: Decodable, Sendable {
    public let userId: String
    public let conversationId: String
}

/// `user:preferences-reordered` — batch drag-reorder broadcast.
public struct UserPreferencesReorderedSocketEvent: Decodable, Sendable {
    public struct Update: Decodable, Sendable {
        public let conversationId: String
        public let orderInCategory: Int
    }
    public let userId: String
    public let updates: [Update]
}

/// `category:created` / `category:updated` — full category snapshot. The
/// nested `category` object decodes straight into `ConversationCategory`
/// (extra gateway keys userId/createdAt/updatedAt are ignored).
public struct CategorySocketEvent: Decodable, Sendable {
    public let userId: String
    public let category: ConversationCategory
}

/// `category:deleted`.
public struct CategoryDeletedSocketEvent: Decodable, Sendable {
    public let userId: String
    public let categoryId: String
}

/// `categories:reordered`.
public struct CategoriesReorderedSocketEvent: Decodable, Sendable {
    public struct Update: Decodable, Sendable {
        public let categoryId: String
        public let order: Int
    }
    public let userId: String
    public let updates: [Update]
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

/// Snapshot émis par le gateway juste après l'authentification du socket. Liste tous
/// les contacts (autres participants des conversations du nouvel arrivant) avec leur
/// `isOnline` runtime calculé depuis la `connectedUsers` Map. Permet au client de seed
/// son store de présence sans attendre des events `user:status` individuels. Voir
/// `services/gateway/src/socketio/MeeshySocketIOManager.ts → _emitPresenceSnapshot`.
public struct PresenceSnapshotEvent: Decodable, Sendable {
    public let users: [UserStatusEvent]

    public init(users: [UserStatusEvent]) {
        self.users = users
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

// MARK: - Translation / Audio / Transcription Failure Events

public struct TranslationFailedEvent: Codable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let error: String
    public let taskId: String?
}

public struct AudioTranslationFailedEvent: Codable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let error: String
    public let errorCode: String?
    public let taskId: String?
}

public struct TranscriptionFailedEvent: Codable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let error: String
    public let errorCode: String?
    public let taskId: String?
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
    /// Read frontier of `userId` (the actor) at broadcast time. Lets that
    /// user's OTHER devices sync their own read cursor (multi-device read
    /// sync). `nil` from a pre-rollout gateway or when the actor has no
    /// cursor yet. Scoped to `userId` — a recipient whose id differs MUST
    /// ignore it. Read receipts are monotone, so a client applies it only
    /// when strictly newer than its local cursor.
    public let lastReadAt: Date?
    /// Server-authoritative unread count for `userId` after the action.
    /// Same `userId` scoping as `lastReadAt`. `nil` from a pre-rollout gateway.
    public let unreadCount: Int?

    public init(
        conversationId: String,
        participantId: String,
        userId: String?,
        type: String,
        updatedAt: Date,
        summary: ReadStatusSummary,
        lastReadAt: Date? = nil,
        unreadCount: Int? = nil
    ) {
        self.conversationId = conversationId
        self.participantId = participantId
        self.userId = userId
        self.type = type
        self.updatedAt = updatedAt
        self.summary = summary
        self.lastReadAt = lastReadAt
        self.unreadCount = unreadCount
    }
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

// MARK: - Attachment Updated Event Data (`message:attachment-updated`)

/// Payload de `SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED`.
///
/// Reçu quand un worker gateway a enrichi un attachment d'un message
/// existant (transcription Whisper finalisée, traduction audio NLLB+TTS
/// finalisée pour une langue, etc.). `attachment` est la forme complète
/// sérialisée par `serializeAttachmentForSocket` côté gateway — incluant
/// `transcription` et `translations` enrichis. Le client remplace
/// l'attachment correspondant dans son store atomiquement et rehydrate
/// les dictionnaires de métadonnées dérivées.
public struct AttachmentUpdatedEvent: Decodable, Sendable {
    public let conversationId: String
    public let messageId: String
    public let attachment: APIMessageAttachment
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
    /// Populated by the message-driven `CONVERSATION_UPDATED` path
    /// (`MessageHandler.ts`) so the client can update the conversation row's
    /// preview without a separate fetch.
    public let lastMessageId: String?
    public let lastMessagePreview: String?
    public let senderId: String?
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
        case lastMessageAt, lastMessageId, lastMessagePreview, senderId, updatedBy, updatedAt
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
        lastMessageId = try container.decodeIfPresent(String.self, forKey: .lastMessageId)
        lastMessagePreview = try container.decodeIfPresent(String.self, forKey: .lastMessagePreview)
        senderId = try container.decodeIfPresent(String.self, forKey: .senderId)
        updatedBy = try container.decodeIfPresent(SocketEventUser.self, forKey: .updatedBy)
        updatedAt = try container.decode(String.self, forKey: .updatedAt)
    }

    public init(
        conversationId: String,
        title: String? = nil,
        description: String? = nil,
        avatar: String? = nil,
        banner: String? = nil,
        defaultWriteRole: String? = nil,
        isAnnouncementChannel: Bool? = nil,
        slowModeSeconds: Int? = nil,
        autoTranslateEnabled: Bool? = nil,
        lastMessageAt: Date? = nil,
        lastMessageId: String? = nil,
        lastMessagePreview: String? = nil,
        senderId: String? = nil,
        updatedBy: SocketEventUser? = nil,
        updatedAt: String
    ) {
        self.conversationId = conversationId
        self.title = title
        self.description = description
        self.avatar = avatar
        self.banner = banner
        self.defaultWriteRole = defaultWriteRole
        self.isAnnouncementChannel = isAnnouncementChannel
        self.slowModeSeconds = slowModeSeconds
        self.autoTranslateEnabled = autoTranslateEnabled
        self.lastMessageAt = lastMessageAt
        self.lastMessageId = lastMessageId
        self.lastMessagePreview = lastMessagePreview
        self.senderId = senderId
        self.updatedBy = updatedBy
        self.updatedAt = updatedAt
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

public struct CallIceServersRefreshedData: Decodable, Sendable {
    public let callId: String
    public let iceServers: [SocketIceServer]
    public let ttl: Int
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
    /// §3.5 — negotiation epoch. Monotonic per peer; the receiver drops any
    /// SDP/ICE whose generation is older than the highest already seen, so
    /// offers/candidates from a churned socket become inert. Optional for
    /// backward compatibility (absent ⇒ generation 0).
    public let negotiationId: Int?
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

/// Audit P1-27 — `call:already-answered` event payload. Emitted by the
/// gateway to the joining user's OTHER sockets when one of their devices
/// answers a call, so the rest can dismiss CallKit + ringing UI.
public struct CallAlreadyAnsweredData: Decodable, Sendable {
    public let callId: String
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
    /// The call this error pertains to, when the gateway knows it. Consumers with
    /// an active call MUST ignore any error whose `callId` is present and does not
    /// match their current call — errors for a different call must never affect a
    /// healthy, unrelated one. Absent for errors that occur before a call context
    /// exists (e.g. auth failures) or from emit sites not yet call-scoped server-side.
    public let callId: String?
}

public struct CallQualityAlertData: Decodable, Sendable {
    public let callId: String
    public let participantId: String
    public let metric: String
    public let value: Double
    public let threshold: Double
}

/// Received when the remote peer starts or stops screen-capturing the call.
/// The gateway relays `call:screen-capture-alert` to the OTHER participant
/// only (socket.to(room)) — every event we receive reflects the remote peer.
public struct CallScreenCaptureAlertData: Decodable, Sendable {
    public let callId: String
    public let participantId: String
    public let isCapturing: Bool
}

/// Received when the gateway force-removes the current user from an active call.
/// The gateway emits `call:force-leave` to the user's personal room so every
/// device they have connected receives the event and tears down the call.
public struct CallForcedLeaveData: Decodable, Sendable {
    public let callId: String
    public let reason: String?
}

public struct CallTranscriptionSegmentPayload: Sendable {
    public let text: String
    public let speakerId: String
    public let startMs: Int
    public let endMs: Int
    public let isFinal: Bool
    public let confidence: Double
    public let language: String

    public init(
        text: String, speakerId: String, startMs: Int, endMs: Int,
        isFinal: Bool, confidence: Double, language: String
    ) {
        self.text = text
        self.speakerId = speakerId
        self.startMs = startMs
        self.endMs = endMs
        self.isFinal = isFinal
        self.confidence = confidence
        self.language = language
    }
}

/// Event: call:translated-segment (Server → Client). Mirrors
/// `CallTranslatedSegmentEvent` in `packages/shared/types/video-call.ts`.
/// `translatedText` is omitted when ZMQ translation is disabled/unavailable —
/// consumers fall back to displaying `text`.
public struct CallTranslatedSegmentData: Decodable, Sendable {
    public let callId: String
    public let segment: Segment

    public struct Segment: Decodable, Sendable {
        public let text: String
        public let translatedText: String?
        public let speakerId: String
        public let startMs: Int
        public let endMs: Int
        public let isFinal: Bool
        public let sourceLanguage: String
        public let targetLanguage: String
        public let confidence: Double
    }
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

    private enum CodingKeys: String, CodingKey {
        case type, messageType, content
    }

    public init(from decoder: Decoder) throws {
        // Le gateway broadcaste `system:message` avec un objet message complet
        // (MeeshySocketIOHandler.broadcastMessage) : la clé porte le nom
        // `messageType`, pas `type`, et tous les champs message sont présents.
        // On accepte les deux clés et on retombe sur des valeurs sûres pour ne
        // jamais échouer le décodage d'un event temps réel.
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = (try? container.decode(String.self, forKey: .type))
            ?? (try? container.decode(String.self, forKey: .messageType))
            ?? "system"
        content = (try? container.decode(String.self, forKey: .content)) ?? ""
    }
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

    /// SyncEngine A5 — numéro de séquence monotone per-user tamponné par le
    /// gateway (`emitWithSeq`, A2.1) sous la clé JSON `_seq`. `nil` sur un
    /// gateway antérieur (backward-compat). Consommé par `SyncSeqState` pour
    /// la détection de gap EXACTE au reconnect.
    public let seq: Int64?

    private enum CodingKeys: String, CodingKey {
        case id, userId, type, title, content, priority, isRead
        case actor, context, metadata
        case seq = "_seq"
    }

    // Computed accessors: resolve from nested structs (gateway format)
    public var senderUsername: String? { actor?.username }
    public var senderDisplayName: String? { actor?.displayName }
    public var senderAvatar: String? { actor?.avatar }
    public var senderId: String? { actor?.id }
    public var conversationId: String? { context?.conversationId }
    public var messageId: String? { context?.messageId }
    public var postId: String? { context?.postId ?? metadata?.postId }
    public var commentId: String? { context?.commentId ?? metadata?.commentId }
    public var parentCommentId: String? { context?.parentCommentId ?? metadata?.parentCommentId }
    public var postType: String? { metadata?.postType }
    public var messagePreview: String? { metadata?.commentPreview }
    public var conversationTitle: String? { context?.conversationTitle }
    public var conversationAvatar: String? { context?.conversationAvatar }
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
    /// Avatar (image URL) of the conversation/group. Used by the in-app toast
    /// as a fallback when the sender has no personal avatar (group messages).
    public let conversationAvatar: String?
    public let conversationType: String?
    public let messageId: String?
    public let postId: String?
    public let commentId: String?
    public let parentCommentId: String?
    public let friendRequestId: String?
}

public struct SocketNotificationMetadata: Decodable, Sendable {
    public let postId: String?
    public let commentId: String?
    public let parentCommentId: String?
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
    func emitCallJoinWithAck(callId: String) async -> Bool
    var callScreenCaptureAlert: PassthroughSubject<CallScreenCaptureAlertData, Never> { get }
    /// Fired when the gateway force-removes the current user from the call.
    /// The client must tear down the call immediately (no user confirmation needed).
    var callForcedLeave: PassthroughSubject<CallForcedLeaveData, Never> { get }
    var callTranslatedSegmentReceived: PassthroughSubject<CallTranslatedSegmentData, Never> { get }
    var messageReceived: PassthroughSubject<APIMessage, Never> { get }
    var messageEdited: PassthroughSubject<APIMessage, Never> { get }
    var messageDeleted: PassthroughSubject<MessageDeletedEvent, Never> { get }
    var messagePinned: PassthroughSubject<MessagePinnedEvent, Never> { get }
    var messageUnpinned: PassthroughSubject<MessageUnpinnedEvent, Never> { get }
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
    var attachmentStatusUpdated: PassthroughSubject<AttachmentStatusUpdatedEvent, Never> { get }
    /// `message:attachment-updated` — delta émis par le gateway après un
    /// enrichissement async (transcription Whisper, traduction audio NLLB+TTS).
    /// Le subscriber remplace l'attachment dans son store atomiquement.
    var attachmentUpdated: PassthroughSubject<AttachmentUpdatedEvent, Never> { get }
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
    /// Conversation-scope variant of `user:preferences-updated` (versioned).
    /// Routed separately from `userPreferencesUpdated` (category scope) so the
    /// `ConversationStore` bridge can apply it with version semantics.
    var userPreferencesConversationUpdated: PassthroughSubject<UserPreferencesConversationUpdatedSocketEvent, Never> { get }
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
    var conversationOnlineStats: PassthroughSubject<ConversationOnlineStatsEvent, Never> { get }
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
    func sendViaSocketFallback(conversationId: String, content: String?, attachmentIds: [String], replyToId: String?, storyReplyToId: String?, originalLanguage: String?, isEncrypted: Bool, clientMessageId: String) async -> MessageSocketManager.SendMessageAck?
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
    public let messagePinned = PassthroughSubject<MessagePinnedEvent, Never>()
    public let messageUnpinned = PassthroughSubject<MessageUnpinnedEvent, Never>()

    // Combine publishers — reactions
    public let reactionAdded = PassthroughSubject<ReactionUpdateEvent, Never>()
    public let reactionRemoved = PassthroughSubject<ReactionUpdateEvent, Never>()
    // BUG2 A' — réactions par-image
    public let attachmentReactionAdded = PassthroughSubject<AttachmentReactionUpdateEvent, Never>()
    public let attachmentReactionRemoved = PassthroughSubject<AttachmentReactionUpdateEvent, Never>()

    // Combine publishers — typing
    public let typingStarted = PassthroughSubject<TypingEvent, Never>()
    public let typingStopped = PassthroughSubject<TypingEvent, Never>()

    // Combine publishers — presence
    public let unreadUpdated = PassthroughSubject<UnreadUpdateEvent, Never>()
    public let userStatusChanged = PassthroughSubject<UserStatusEvent, Never>()
    public let presenceSnapshotReceived = PassthroughSubject<PresenceSnapshotEvent, Never>()

    // Combine publishers — read status
    public let readStatusUpdated = PassthroughSubject<ReadStatusUpdateEvent, Never>()

    // Combine publishers — attachment status
    public let attachmentStatusUpdated = PassthroughSubject<AttachmentStatusUpdatedEvent, Never>()
    public let attachmentUpdated = PassthroughSubject<AttachmentUpdatedEvent, Never>()

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
    public let userPreferencesConversationUpdated = PassthroughSubject<UserPreferencesConversationUpdatedSocketEvent, Never>()
    public let userPreferencesReordered = PassthroughSubject<UserPreferencesReorderedSocketEvent, Never>()
    public let conversationDeleted = PassthroughSubject<ConversationDeletedSocketEvent, Never>()

    // Combine publishers — user conversation categories
    public let categoryCreated = PassthroughSubject<CategorySocketEvent, Never>()
    public let categoryUpdated = PassthroughSubject<CategorySocketEvent, Never>()
    public let categoryDeleted = PassthroughSubject<CategoryDeletedSocketEvent, Never>()
    public let categoriesReordered = PassthroughSubject<CategoriesReorderedSocketEvent, Never>()

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
    public let translationFailed = PassthroughSubject<TranslationFailedEvent, Never>()
    public let audioTranslationFailed = PassthroughSubject<AudioTranslationFailedEvent, Never>()
    public let transcriptionFailed = PassthroughSubject<TranscriptionFailedEvent, Never>()

    // Combine publisher — reconnection (fires after successful reconnect)
    public let didReconnect = PassthroughSubject<Void, Never>()

    // Combine publisher — heartbeat RTT (fires after each heartbeat:ack with ms value)
    public let connectionRTT = PassthroughSubject<Double, Never>()

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
    public let callAlreadyAnswered = PassthroughSubject<CallAlreadyAnsweredData, Never>()
    public let callParticipantJoined = PassthroughSubject<CallParticipantData, Never>()
    /// Last `call:participant-joined` event received, so the initiator's listener
    /// (set up only after the call:initiate ACK) can replay an event that arrived
    /// before it subscribed (callee already in the room). Matched by callId, so a
    /// stale event from a previous call is naturally ignored.
    public private(set) var lastCallParticipantJoined: CallParticipantData?
    public let callParticipantLeft = PassthroughSubject<CallParticipantData, Never>()
    public let callMediaToggled = PassthroughSubject<CallMediaToggleData, Never>()
    public let callError = PassthroughSubject<CallErrorData, Never>()
    public let callIceServersRefreshed = PassthroughSubject<CallIceServersRefreshedData, Never>()
    public let callQualityAlert = PassthroughSubject<CallQualityAlertData, Never>()
    public let callScreenCaptureAlert = PassthroughSubject<CallScreenCaptureAlertData, Never>()
    public let callForcedLeave = PassthroughSubject<CallForcedLeaveData, Never>()
    public let callTranslatedSegmentReceived = PassthroughSubject<CallTranslatedSegmentData, Never>()

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
    private var reconnectAttempts: Int = 0
    private var reconnectDelay: TimeInterval = 1
    private var reconnectTask: Task<Void, Never>?
    private var hadPreviousConnection = false
    private var heartbeatTimer: Timer?
    private var lifecycleCancellables = Set<AnyCancellable>()

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

    private init() {
        observeNetworkRecovery()
    }

    /// Source unique de vérité réseau : quand `NetworkMonitor` repasse en
    /// ligne, forcer une reconnexion socket immédiate. Évite que la bannière
    /// "Reconnexion..." persiste pendant que Socket.IO attend sa propre
    /// boucle de retry (qui peut tarder après une coupure prolongée — iOS
    /// kille silencieusement la WebSocket en arrière-plan).
    private func observeNetworkRecovery() {
        NetworkMonitor.shared.$isOffline
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.handleNetworkBackOnline()
            }
            .store(in: &lifecycleCancellables)
    }

    private func handleNetworkBackOnline() {
        guard !isConnected else { return }
        guard APIClient.shared.authToken != nil else { return }
        scheduleReconnectWithBackoff()
    }

    private func scheduleReconnectWithBackoff() {
        reconnectTask?.cancel()
        // Cap BEFORE applying jitter so the jittered value never exceeds the 60s maximum.
        let capped = min(reconnectDelay, 60)
        let jittered = capped * (0.8 + Double.random(in: 0...0.4))
        let delay = jittered
        let attempt = reconnectAttempts
        Logger.socket.info("MessageSocket: backoff reconnect attempt=\(attempt) delay=\(delay, format: .fixed(precision: 2))s")
        reconnectDelay = min(reconnectDelay * 2, 60)
        reconnectAttempts += 1
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            await MainActor.run { [weak self] in
                guard let self, !self.isConnected else { return }
                self.forceReconnect()
            }
        }
    }

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
        // Ne JAMAIS reconstruire le socket tant qu'une connexion existe ou est
        // en cours. Réassigner `manager`/`socket` relâche l'instance courante
        // en plein handshake : la connexion n'aboutit alors jamais et tous les
        // emits échouent avec « Tried emitting when not connected ».
        if let socket, socket.status == .connected || socket.status == .connecting {
            return
        }

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
            // CALL-FIX 2026-06-06 — WebSocket transport (polling handshake → auto
            // upgrade to WebSocket). The previous `.forcePolling(true)` (HTTP
            // long-poll ONLY) dropped mid-call: every re-poll under WebRTC CPU load
            // surfaced as "transport close" on the gateway, killing call:initiate /
            // SDP / ICE signaling (call stuck on "connecting"). The old "~35s the WS
            // dropped" was a ping timeout (gateway pingTimeout was 10s) — bumped to
            // 20s server-side, so the persistent WebSocket now holds.
            .extraHeaders(["Authorization": "Bearer \(token)"]),
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(16),
            .reconnectAttempts(-1),
            .sessionDelegate(CertificatePinningDelegate()),
        ])

        socket = manager?.defaultSocket
        setupEventHandlers()
        socket?.connect()
    }

    public func connectAnonymous(sessionToken: String) {
        if let socket, socket.status == .connected || socket.status == .connecting {
            return
        }
        disconnect()

        guard let url = SocketConfig.baseURL else { return }

        DispatchQueue.main.async { self.connectionState = .connecting }

        manager = SocketManager(socketURL: url, config: [
            .log(false),
            // CALL-FIX 2026-06-06 — WebSocket transport (voir connect()).
            .extraHeaders(["X-Session-Token": sessionToken]),
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(16),
            .reconnectAttempts(-1),
            .sessionDelegate(CertificatePinningDelegate()),
        ])

        socket = manager?.defaultSocket
        setupEventHandlers()
        socket?.connect()
    }

    /// Transport-only teardown shared by `disconnect()`, `prepareForBackground()`
    /// and `forceReconnect()`. Tears down the live socket + heartbeat (so a stale
    /// `isConnected` flag can never suppress the next reconnect) but DELIBERATELY
    /// preserves the session-level state — `hadPreviousConnection` (so the next
    /// `.connect` reports `wasReconnect == true` and fires `didReconnect`, the
    /// sole trigger for the open conversation's missed-message backfill +
    /// queued-receipt flush) AND `joinedConversations` / `activeConversationId`
    /// (so the `.connect` re-join loop restores the rooms active-first, and
    /// `leaveConversation` / typing accounting stays accurate after resume).
    /// Contrast `disconnect()`, the logout/cold reset, which additionally clears
    /// all of that so the next login is a genuine cold connect with no rooms.
    private func suspendTransport() {
        reconnectTask?.cancel()
        reconnectTask = nil
        stopHeartbeat()
        socket?.disconnect()
        socket = nil
        manager = nil
        isConnected = false
        connectionState = .disconnected
        reconnectAttempt = 0
    }

    public func disconnect() {
        suspendTransport()
        // Logout / cold reset: forget the prior connection AND the joined rooms
        // so the next `.connect` is a cold first connect (no spurious backfill,
        // no stale room re-joins under a different account).
        joinedConversations.removeAll()
        activeConversationId = nil
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
        // Transport-only teardown: drop the socket so a stale `isConnected`
        // cannot fool the resume path, but KEEP `hadPreviousConnection` so the
        // foreground-resume `.connect` fires `didReconnect` (missed-message
        // backfill + queued read/received-receipt flush).
        suspendTransport()
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

    /// CALL-FIX 2026-06-05 — app-injected predicate: "is a call active right now?".
    /// Kept as an opaque closure so the SDK stays call-agnostic (SDK purity rule).
    /// The app wires it to `CallManager.isCallActiveFlag` (a thread-safe nonisolated
    /// flag) at boot. When it returns true, `forceReconnect()` is suppressed so a
    /// token rotation / re-auth never tears down the socket carrying live WebRTC
    /// signaling, which would strand the call on "connecting".
    public var isCallActiveGuard: (@Sendable () -> Bool)?

    /// Tear down and rebuild the socket unconditionally. Use this on
    /// foreground resume or after a token refresh so we never depend on
    /// the potentially stale `isConnected` flag. `disconnect()` clears
    /// the flag and nils the underlying socket; `connect()` rebuilds it.
    public func forceReconnect() {
        if isCallActiveGuard?() == true {
            Logger.socket.info("MessageSocket: forceReconnect suppressed — call active (keep signaling socket)")
            return
        }
        // Suspend (not full disconnect) so `hadPreviousConnection` survives: this
        // rebuild is a reconnect (resume / network-back / re-auth), and the next
        // `.connect` must fire `didReconnect`.
        suspendTransport()
        connect()
    }

    /// Connection-handshake bookkeeping, extracted from the `.connect` handler
    /// so the reconnect-vs-cold decision is unit-testable without driving a live
    /// socket. Records that we have now connected, resets the retry counter,
    /// and — when this connection follows a previous one (network blip,
    /// foreground resume, re-auth) — fires `didReconnect` so the app backfills
    /// the open conversation and flushes queued read/received receipts. Returns
    /// whether it was a reconnect for the caller's logging/re-join branch.
    @discardableResult
    func handleConnectionEstablished() -> Bool {
        reconnectTask?.cancel()
        reconnectTask = nil
        let wasReconnect = hadPreviousConnection
        hadPreviousConnection = true
        reconnectAttempt = 0
        reconnectAttempts = 0
        reconnectDelay = 1
        if wasReconnect {
            DispatchQueue.main.async { [weak self] in self?.didReconnect.send(()) }
        }
        return wasReconnect
    }

    /// The conversation rooms to (re)join on connect, active-first for fastest
    /// UX. Extracted from the `.connect` handler so the re-join set — preserved
    /// across a background suspend (`suspendTransport`) and only cleared on
    /// logout (`disconnect`) — is unit-testable without a live socket.
    func roomsToRejoinOnConnect() -> [String] {
        var rooms: [String] = []
        if let activeId = activeConversationId, joinedConversations.contains(activeId) {
            rooms.append(activeId)
        }
        for convId in joinedConversations where convId != activeConversationId {
            rooms.append(convId)
        }
        return rooms
    }

    // MARK: - Heartbeat

    private func startHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            // Include clientTime so the gateway can compute round-trip latency
            // and return it in heartbeat:ack for connection quality monitoring.
            let clientTimeMs = Int64(Date().timeIntervalSince1970 * 1000)
            self.safeEmit("heartbeat", ["clientTime": clientTimeMs])
        }
    }

    private func stopHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
    }

    // MARK: - Room Management

    public func joinConversation(_ conversationId: String) {
        guard !joinedConversations.contains(conversationId) else { return }
        // Tracker la room AVANT toute emission : le handler `.connect`
        // (re-join loop) re-emet `conversation:join` pour toutes les rooms
        // de `joinedConversations` une fois le handshake termine.
        joinedConversations.insert(conversationId)
        guard socket?.status == .connected else {
            // Socket pas encore connecte : emettre ici serait perdu et
            // declencherait l'erreur `Tried emitting when not connected`.
            // Le re-join du handler `.connect` prendra le relais.
            return
        }
        socket?.emit("conversation:join", ["conversationId": conversationId])
    }

    public func leaveConversation(_ conversationId: String) {
        guard joinedConversations.contains(conversationId) else { return }
        safeEmit("conversation:leave", ["conversationId": conversationId])
        joinedConversations.remove(conversationId)
    }

    /// Emits only when the socket is actually `.connected`. Fire-and-forget
    /// events (typing, heartbeat, leave) that race a background transition would
    /// otherwise hit "Tried emitting when not connected" as the socket suspends —
    /// the emit is lost either way, so drop it quietly. The re-join loop and the
    /// heartbeat timer resume these on reconnect. NOT for user-critical or
    /// ACK-bearing emits (call signaling / translation buffer via their own paths).
    private func safeEmit(_ event: String, _ payload: [String: Any]) {
        guard socket?.status == .connected else {
            Logger.socket.debug("Skipping \(event, privacy: .public) emit — socket not connected")
            return
        }
        socket?.emit(event, payload)
    }

    // MARK: - Typing Emission

    public func emitTypingStart(conversationId: String) {
        safeEmit("typing:start", ["conversationId": conversationId])
    }

    public func emitTypingStop(conversationId: String) {
        safeEmit("typing:stop", ["conversationId": conversationId])
    }

    // MARK: - Attachment Reactions (BUG2 A')

    /// Pose une réaction sur une pièce jointe (emit direct ; parité offline-queue
    /// différée, cf. spec). Le serveur diffuse `attachment:reaction-added`.
    public func addAttachmentReaction(attachmentId: String, messageId: String, emoji: String) {
        socket?.emit("attachment:reaction-add", ["attachmentId": attachmentId, "messageId": messageId, "emoji": emoji])
    }

    public func removeAttachmentReaction(attachmentId: String, messageId: String, emoji: String) {
        socket?.emit("attachment:reaction-remove", ["attachmentId": attachmentId, "messageId": messageId, "emoji": emoji])
    }

    // MARK: - Translation Request

    /// Buffered user-triggered emits that the socket layer must NOT silently
    /// drop on disconnect. Translation requests are at the top of that list:
    /// the user explicitly tapped a flag to ask for a target-language
    /// rendering, and without buffering the request vanishes the instant the
    /// socket is offline (the user blames the app, retries the same tap,
    /// gets the same nothing). Capped + TTL-bounded so a long disconnect
    /// cannot turn this into a memory leak.
    struct PendingTranslationRequest: Equatable, Sendable {
        let messageId: String
        let targetLanguage: String
        let queuedAt: Date
    }

    private var pendingTranslationRequests: [PendingTranslationRequest] = []
    static let translationBufferMaxSize = 50
    static let translationBufferTTL: TimeInterval = 60

    public func requestTranslation(messageId: String, targetLanguage: String) {
        // U4 — ALWAYS buffer, in addition to emitting when connected. The
        // gateway's `message:translation` completion broadcast is fire-and-forget
        // with no ack/replay, so if the socket drops between this request and the
        // broadcast (a multi-second Whisper/NLLB window), the result is dropped
        // and reconnect never re-asks (syncMissedMessages only re-fetches NEWER
        // messages; flushBufferedTranslationRequests previously replayed only the
        // disconnected buffer). Buffering unconditionally lets the reconnect
        // replay re-ask; the gateway request is idempotent (returns the cached
        // translation) so a redundant replay is harmless, and TTL(60s)+dedup+cap
        // bound the buffer.
        bufferTranslationRequest(
            PendingTranslationRequest(
                messageId: messageId,
                targetLanguage: targetLanguage,
                queuedAt: Date()
            )
        )
        if isConnected {
            socket?.emit("translation:request", ["messageId": messageId, "targetLanguage": targetLanguage])
            Logger.socket.info("Requested translation for \(messageId) -> \(targetLanguage)")
        }
    }

    private func bufferTranslationRequest(_ request: PendingTranslationRequest) {
        // De-dup: if the same (messageId, targetLanguage) is already queued,
        // refresh its timestamp rather than enqueue twice — the user re-tapped.
        pendingTranslationRequests.removeAll {
            $0.messageId == request.messageId && $0.targetLanguage == request.targetLanguage
        }
        pendingTranslationRequests.append(request)
        // Cap from the front: oldest pending requests are the least useful
        // when the user is staring at the screen.
        if pendingTranslationRequests.count > Self.translationBufferMaxSize {
            let dropCount = pendingTranslationRequests.count - Self.translationBufferMaxSize
            pendingTranslationRequests.removeFirst(dropCount)
        }
    }

    /// Flush queued translation requests that are still fresh enough to
    /// matter. Called from the `.connect` handler immediately after
    /// re-joining rooms so the gateway sees a coherent stream
    /// (`conversation:join` first, then late translation asks for those
    /// rooms). Exposed as `internal` so the test bundle can validate the
    /// replay without driving a real socket.
    func flushBufferedTranslationRequests(now: Date = Date()) {
        guard !pendingTranslationRequests.isEmpty else { return }
        let cutoff = now.addingTimeInterval(-Self.translationBufferTTL)
        let toReplay = pendingTranslationRequests.filter { $0.queuedAt >= cutoff }
        pendingTranslationRequests.removeAll()
        for request in toReplay {
            socket?.emit("translation:request", [
                "messageId": request.messageId,
                "targetLanguage": request.targetLanguage
            ])
        }
    }

    #if DEBUG
    var debug_pendingTranslationRequests: [PendingTranslationRequest] {
        pendingTranslationRequests
    }
    #endif

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

    /// ACK returned by the gateway after `message:send` / `message:send-with-attachments`.
    /// Phase 4 (spec §6.2) requires `_sendResponse()` to echo back the same
    /// `clientMessageId` the client supplied in the request so the local
    /// outbox/optimistic layer can match the row without scraping the
    /// `message:new` broadcast. `clientMessageId` is optional on the wire
    /// during the rollout window — older gateway builds drop the field.
    /// `createdAt` carries the authoritative server timestamp so the WS-first
    /// send path can stamp the optimistic row without waiting for the
    /// `message:new` broadcast; it is `nil` against older gateway builds.
    public struct SendMessageAck: Sendable {
        public let messageId: String
        public let clientMessageId: String?
        public let createdAt: Date?

        public init(messageId: String, clientMessageId: String?, createdAt: Date? = nil) {
            self.messageId = messageId
            self.clientMessageId = clientMessageId
            self.createdAt = createdAt
        }
    }

    /// Parses the ISO-8601 `createdAt` echoed in a send ACK, tolerating both
    /// the fractional-seconds and basic forms. Returns `nil` on any mismatch
    /// so the caller can fall back to the local send time.
    private static func parseAckDate(_ value: Any?) -> Date? {
        guard let string = value as? String, !string.isEmpty else { return nil }
        return isoFormatterWithFractional.date(from: string)
            ?? isoFormatterBasic.date(from: string)
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
            // 10s (was 30s): the gateway acks as soon as the message row is
            // created — attachments were already uploaded separately, so a
            // healthy ack lands in well under 2s. Holding the optimistic
            // bubble in `.sending` for 30s only prolonged the clock icon; on
            // timeout the caller falls through to the outbox retry loop,
            // which remains the durable safety net. Matches `sendAsync`'s
            // 10s default on the text path.
            socket.emitWithAck("message:send-with-attachments", payload).timingOut(after: 10) { items in
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool, success,
                   let data = response["data"] as? [String: Any],
                   let messageId = data["messageId"] as? String {
                    let ackCid = data["clientMessageId"] as? String ?? cid
                    continuation.resume(returning: SendMessageAck(
                        messageId: messageId,
                        clientMessageId: ackCid,
                        createdAt: MessageSocketManager.parseAckDate(data["createdAt"])
                    ))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    // MARK: - Send Text (WebSocket-first)

    /// Emits a plain-text `message:send` over the open Socket.IO connection and
    /// awaits the gateway ACK. This is the WebSocket-first send path used for
    /// regular text messages — parity with reactions / comments / status, which
    /// already travel over the socket. Carries the full message effect set
    /// (`isBlurred`, `expiresAt` for ephemeral, `effectFlags` bitfield,
    /// `isViewOnce` / `maxViewOnceCount`) at parity with the REST route.
    ///
    /// Returns the `SendMessageAck` (server `messageId`, echoed
    /// `clientMessageId`, server `createdAt`) on success, or `nil` on timeout /
    /// no socket / server error so the caller can fall back to the REST send.
    ///
    /// NOT for E2EE payloads or attachments — the `message:send` event does not
    /// transport those; the caller routes them through REST or
    /// `sendWithAttachments`.
    public func sendAsync(
        conversationId: String,
        content: String?,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        storyReplyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        messageType: String? = nil,
        isBlurred: Bool? = nil,
        expiresAt: Date? = nil,
        effectFlags: UInt32? = nil,
        isViewOnce: Bool? = nil,
        maxViewOnceCount: Int? = nil,
        clientMessageId: String? = nil,
        timeoutSeconds: Double = 10
    ) async -> SendMessageAck? {
        guard let socket else { return nil }
        let cid = clientMessageId ?? ClientMessageId.generate()
        var payload: [String: Any] = [
            "conversationId": conversationId,
            "content": content ?? "",
            "clientMessageId": cid
        ]
        if let originalLanguage { payload["originalLanguage"] = originalLanguage }
        if let messageType { payload["messageType"] = messageType }
        if let replyToId { payload["replyToId"] = replyToId }
        if let storyReplyToId { payload["storyReplyToId"] = storyReplyToId }
        if let forwardedFromId { payload["forwardedFromId"] = forwardedFromId }
        if let forwardedFromConversationId { payload["forwardedFromConversationId"] = forwardedFromConversationId }
        if let isBlurred { payload["isBlurred"] = isBlurred }
        if let expiresAt { payload["expiresAt"] = MessageSocketManager.isoFormatterWithFractional.string(from: expiresAt) }
        if let effectFlags { payload["effectFlags"] = Int(effectFlags) }
        if let isViewOnce { payload["isViewOnce"] = isViewOnce }
        if let maxViewOnceCount { payload["maxViewOnceCount"] = maxViewOnceCount }
        return await withCheckedContinuation { continuation in
            socket.emitWithAck("message:send", payload).timingOut(after: timeoutSeconds) { items in
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool, success,
                   let data = response["data"] as? [String: Any],
                   let messageId = data["messageId"] as? String {
                    let ackCid = data["clientMessageId"] as? String ?? cid
                    continuation.resume(returning: SendMessageAck(
                        messageId: messageId,
                        clientMessageId: ackCid,
                        createdAt: MessageSocketManager.parseAckDate(data["createdAt"])
                    ))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    /// Chemin de repli socket pour `ConversationViewModel.sendMessage`, appelé
    /// quand le POST REST a échoué. Réémet le message sur le socket avec le
    /// MÊME `clientMessageId` : le dedup gateway `(conversationId, clientMessageId)`
    /// garantit l'absence de doublon si l'outbox rejoue le REST plus tard.
    ///
    /// Route vers `message:send-with-attachments` (média) ou `message:send`
    /// (texte). Un texte chiffré E2EE renvoie `nil` — l'event `message:send` ne
    /// transporte pas le chiffrement, on ne réémet pas un payload en clair ;
    /// ces messages restent sur le retry REST de l'outbox.
    public func sendViaSocketFallback(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String?,
        originalLanguage: String?,
        isEncrypted: Bool,
        clientMessageId: String
    ) async -> SendMessageAck? {
        if attachmentIds.isEmpty {
            if isEncrypted { return nil }
            return await sendAsync(
                conversationId: conversationId,
                content: content,
                originalLanguage: originalLanguage,
                replyToId: replyToId,
                storyReplyToId: storyReplyToId,
                clientMessageId: clientMessageId
            )
        }
        return await sendWithAttachmentsAsync(
            conversationId: conversationId,
            content: content,
            attachmentIds: attachmentIds,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            originalLanguage: originalLanguage,
            isEncrypted: isEncrypted,
            clientMessageId: clientMessageId
        )
    }

    // MARK: - Call Signaling Emission

    public enum CallInitiateError: Error, Sendable, LocalizedError {
        case noSocket
        case timeout
        case serverError(String)
        case malformedResponse

        // Conformance LocalizedError pour que les logs d'app et les UI surfaces
        // exposent la cause réelle au lieu du fallback Swift "error N" peu
        // discriminant (N étant l'index de case bridgé en NSError._code, qui
        // peut différer entre les builds quand on ajoute/réordonne des cases).
        public var errorDescription: String? {
            switch self {
            case .noSocket:
                return "noSocket — MessageSocket non connecté lors de l'émission de call:initiate (vérifier login, connexion réseau, état du gateway)"
            case .timeout:
                return "timeout — Le gateway n'a pas répondu à call:initiate sous 10s (vérifier gateway up, latence réseau)"
            case .serverError(let message):
                return "serverError — Gateway a rejeté call:initiate: \(message)"
            case .malformedResponse:
                return "malformedResponse — La réponse ACK de call:initiate ne contient pas data.callId ou iceServers"
            }
        }
    }

    public struct CallInitiateAck: Sendable {
        public let callId: String
        public let mode: String?
        public let iceServers: [SocketIceServer]
        public let ttl: Int?

        public init(callId: String, mode: String?, iceServers: [SocketIceServer], ttl: Int? = nil) {
            self.callId = callId
            self.mode = mode
            self.iceServers = iceServers
            self.ttl = ttl
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

                let ttl = data["ttl"] as? Int
                continuation.resume(returning: CallInitiateAck(callId: callId, mode: mode, iceServers: servers, ttl: ttl))
            }
        }
    }

    public func emitCallJoin(callId: String) {
        socket?.emit("call:join", ["callId": callId])
    }

    /// ACK-aware join: emits `call:join` and awaits gateway confirmation (3 s
    /// timeout). Returns `true` when the gateway has put the socket in the call
    /// room. Use this on socket reconnect before sending room-scoped events
    /// (call:request-ice-servers, call:toggle-video) — the gateway guards those
    /// with `socket.rooms.has(ROOMS.call(callId))` which is only true after the
    /// async joinCall() DB work completes and socket.join() runs.
    public func emitCallJoinWithAck(callId: String) async -> Bool {
        guard let socket else { return false }
        let payload: [String: Any] = ["callId": callId]
        return await withCheckedContinuation { continuation in
            var resumed = false
            // 6s (was 3s): the gateway only sends the success ACK AFTER
            // `joinCall` (Prisma transaction → 'connecting', TURN credential
            // generation, participant enrichment, C8 same-user socket eviction
            // via fetchSockets). Under load that work can exceed 3s, so a
            // slow-but-successful join was falsely reported `NOT ACKed`, firing
            // a redundant retry that burned the caller's ring budget → `missed`.
            // Still well under the 45s ring / 30s connect budget, even with the
            // one retry in joinCallRoomReliably.
            socket.emitWithAck("call:join", payload).timingOut(after: 6) { items in
                guard !resumed else { return }
                resumed = true
                let success = (items.first as? [String: Any])?["success"] as? Bool ?? false
                continuation.resume(returning: success)
            }
        }
    }

    public func emitCallLeave(callId: String) {
        socket?.emit("call:leave", ["callId": callId])
    }

    public func emitRequestIceServers(callId: String) {
        socket?.emit("call:request-ice-servers", ["callId": callId])
    }

    /// Informs the gateway the app entered background while a call is active.
    /// The gateway uses this to switch ringing delivery to VoIP push and extend
    /// its heartbeat tolerance window.
    public func emitCallBackgrounded(callId: String, participantId: String) {
        socket?.emit("call:backgrounded", ["callId": callId, "participantId": participantId])
    }

    /// Informs the gateway the app returned to foreground during an active call.
    /// Resets the heartbeat tolerance window and re-enables socket-based ringing.
    public func emitCallForegrounded(callId: String, participantId: String) {
        socket?.emit("call:foregrounded", ["callId": callId, "participantId": participantId])
    }

    /// Notifies the gateway (and, by relay, other participants) that the local
    /// screen capture state changed. Other participants receive
    /// `call:screen-capture-alert` so they can display a warning.
    public func emitCallScreenCaptureDetected(callId: String, participantId: String, isCapturing: Bool) {
        socket?.emit("call:screen-capture-detected", [
            "callId": callId,
            "participantId": participantId,
            "isCapturing": isCapturing
        ])
    }

    /// Emits a `call:analytics` event with aggregated call metrics at session end.
    /// Fire-and-forget — the gateway persists the summary for observability dashboards.
    public func emitCallAnalytics(callId: String, payload: [String: Any]) {
        var data = payload
        data["callId"] = callId
        socket?.emit("call:analytics", data)
    }

    /// Reports whether the app is in the FOREGROUND so the gateway can decide,
    /// per incoming call, between socket delivery (in-app banner) and a VoIP push
    /// (CallKit). A backgrounded iOS app keeps a live socket for ~45s but is
    /// suspended and can't ring from a socket event — without this signal the
    /// gateway thought it was reachable and never sent the VoIP push, so calls
    /// never rang when the app wasn't foreground. Emit on scenePhase transitions
    /// (and on connect) while the socket is still alive (`.inactive` fires before
    /// suspension).
    /// Last app foreground/background state declared by the app, replayed on every
    /// (re)connect (see the `.connect` handler). Defaults to `true` because the
    /// socket only ever connects while the app is foreground (iOS suspends it in
    /// background), so a fresh connection is foreground by definition.
    private var lastAppForeground = true

    public func emitAppForeground(_ foreground: Bool) {
        lastAppForeground = foreground
        socket?.emit("presence:app-state", ["foreground": foreground])
    }

    /// Émet `call:force-leave` pour la conversation donnée. Le gateway
    /// nettoie alors toute trace d'appel actif où l'utilisateur courant
    /// était participant (CallParticipant.leftAt = null) sans nécessiter
    /// le callId — utile en pré-flight avant `call:initiate` pour purger
    /// les zombies laissés par un crash, un kill app, ou un test antérieur
    /// dont le cleanup gateway n'a pas tourné. Idempotent : no-op si pas
    /// de zombie côté DB.
    public func emitCallForceLeave(conversationId: String) {
        socket?.emit("call:force-leave", ["conversationId": conversationId])
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

    /// Refus explicite : `call:end` avec `reason: "rejected"`. Sans la raison,
    /// le gateway résout tout end pré-décroché en `missed` — fausse
    /// notification « appel manqué » chez le callee qui vient de refuser, et
    /// le refus tombe dans le filtre « manqués » du journal. Parité Android
    /// `emitEnd(callId, reason)` / web `handleRejectCall`.
    public func emitCallReject(callId: String) {
        socket?.emit("call:end", ["callId": callId, "reason": "rejected"])
    }

    /// Variante avec ACK : émet `call:end` et attend confirmation du gateway
    /// (max 3s). Le gateway accepte et broadcast `call:ended` à tous les
    /// participants. Sans ACK le client ne sait pas si le peer a été notifié
    /// — symptôme : l'appelé reste bloqué en `.connecting` ou `.connected`
    /// alors que l'appelant a raccroché. Utiliser cette variante quand le
    /// client a un cycle de vie immédiat (raccrocher = vouloir confirmation
    /// avant de fermer le socket / quitter l'écran).
    public func emitCallEndWithAck(callId: String) async -> Bool {
        guard let socket else { return false }
        return await withCheckedContinuation { continuation in
            var resumed = false
            socket.emitWithAck("call:end", ["callId": callId]).timingOut(after: 3) { items in
                guard !resumed else { return }
                resumed = true
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool {
                    continuation.resume(returning: success)
                } else {
                    continuation.resume(returning: false)
                }
            }
        }
    }

    public func emitCallHeartbeat(callId: String) {
        socket?.emit("call:heartbeat", ["callId": callId])
    }

    /// Emits a final (isFinal=true only — callers must not send partials)
    /// local transcription segment. The gateway relays it, translated per
    /// listener's `systemLanguage`, as `call:translated-segment`.
    public func emitCallTranscriptionSegment(callId: String, segment: CallTranscriptionSegmentPayload) {
        socket?.emit("call:transcription-segment", [
            "callId": callId,
            "segment": [
                "text": segment.text,
                "speakerId": segment.speakerId,
                "startMs": segment.startMs,
                "endMs": segment.endMs,
                "isFinal": segment.isFinal,
                "confidence": segment.confidence,
                "language": segment.language
            ]
        ])
    }

    /// Report periodic call quality + cumulative data usage to the gateway. The
    /// last report before teardown carries the call totals, which the gateway
    /// persists on the CallSession so the call-summary message can surface
    /// "data spent · network quality". Fire-and-forget. `bytesSent`/`bytesReceived`
    /// are cumulative WebRTC counters; `level` is excellent|good|fair|poor.
    public func emitCallQualityReport(
        callId: String, level: String, rtt: Double, packetLoss: Double,
        bytesSent: Int, bytesReceived: Int, availableOutgoingBitrateBps: Int = 0,
        jitterMs: Double = 0
    ) {
        var stats: [String: Any] = [
            "level": level,
            "rtt": rtt,
            "packetLoss": packetLoss,
            "bytesSent": bytesSent,
            "bytesReceived": bytesReceived
        ]
        if availableOutgoingBitrateBps > 0 {
            stats["availableOutgoingBitrateBps"] = availableOutgoingBitrateBps
        }
        if jitterMs > 0 {
            stats["jitterMs"] = jitterMs
        }
        socket?.emit("call:quality-report", ["callId": callId, "stats": stats])
    }

    /// Notify the gateway that a local ICE restart is in progress (e.g. network
    /// handoff or connectivity loss). Fire-and-forget. The gateway updates the
    /// call DB status to `reconnecting` and suppresses premature cleanup.
    public func emitCallReconnecting(callId: String, participantId: String, attempt: Int) {
        socket?.emit("call:reconnecting", [
            "callId": callId,
            "participantId": participantId,
            "attempt": attempt
        ])
    }

    /// Notify the gateway that the ICE restart completed successfully and the
    /// call is active again. Fire-and-forget. Resets call DB status to `active`.
    public func emitCallReconnected(callId: String, participantId: String) {
        socket?.emit("call:reconnected", [
            "callId": callId,
            "participantId": participantId
        ])
    }

    // MARK: - Event Handlers

    private func setupEventHandlers() {
        guard let socket else { return }

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self else { return }
            let wasReconnect = self.handleConnectionEstablished()

            DispatchQueue.main.async {
                self.isConnected = true
                self.connectionState = .connected
            }

            self.startHeartbeat()

            // CALL-FIX 2026-06-06 — replay the app foreground/background state on
            // every (re)connect so the gateway always knows whether to deliver
            // incoming calls via the in-app socket banner (foreground) or a VoIP
            // push / CallKit (background). The first connect fires before the app's
            // scenePhase emit lands, so without this replay the gateway would treat
            // a foreground app as unknown and push CallKit for the first call.
            self.socket?.emit("presence:app-state", ["foreground": self.lastAppForeground])

            // CALL-FIX 2026-06-06 — ask the gateway to replay any in-progress
            // (ringing) call so a user who comes online / opens the app mid-ring
            // sees the incoming banner immediately, instead of missing the call
            // that started while they were offline/backgrounded.
            self.socket?.emit("call:check-active")

            // Re-join all tracked conversations (active-first for fastest UX).
            for convId in self.roomsToRejoinOnConnect() {
                self.socket?.emit("conversation:join", ["conversationId": convId])
            }

            // Replay user-triggered translation requests that arrived during
            // the disconnect window. The gateway will route them to whichever
            // conversation rooms we just re-joined.
            self.flushBufferedTranslationRequests()

            if wasReconnect {
                Logger.socket.info("MessageSocket reconnected — re-joined \(self.joinedConversations.count) room(s)")
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

        // --- Heartbeat ACK — measure RTT ---
        socket.on("heartbeat:ack") { [weak self] data, _ in
            guard let self else { return }
            guard let payload = data.first as? [String: Any],
                  let serverTimeStr = payload["serverTime"] as? String else { return }
            // Compute RTT from latencyHintMs when available (server computed it from
            // clientTime we sent). Fall back to wall-clock if the field is absent.
            let rtt: Double
            if let hint = payload["latencyHintMs"] as? Double {
                rtt = hint * 2 // hint is one-way; double for round-trip
            } else {
                // No server-computed hint: approximate from current wall time vs serverTime.
                let isoFormatter = ISO8601DateFormatter()
                isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let serverDate = isoFormatter.date(from: serverTimeStr) {
                    rtt = abs(Date().timeIntervalSince(serverDate)) * 1000 // ms
                } else {
                    return
                }
            }
            Logger.socket.debug("heartbeat:ack RTT=\(rtt, format: .fixed(precision: 1))ms serverTime=\(serverTimeStr, privacy: .public)")
            self.connectionRTT.send(rtt)
        }

        // --- Message events ---

        socket.on("message:new") { [weak self] data, _ in
            guard let self else { return }
            // Phase A real-time instrumentation — log the socket arrival
            // BEFORE decoding so we capture the gateway → device delivery
            // latency cleanly (decoding is observable separately if needed).
            let recvAt = Date()
            let firstId = (data.first as? [String: Any])?["id"] as? String
            let firstCmid = (data.first as? [String: Any])?["clientMessageId"] as? String
            Logger.socket.info("perf:ios.notif.socket.message-new receivedAt=\(recvAt.timeIntervalSince1970, privacy: .public) serverId=\(firstId ?? "nil", privacy: .public) clientMessageId=\(firstCmid ?? "nil", privacy: .public)")
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

        socket.on("message:pinned") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessagePinnedEvent.self, from: data) { [weak self] event in
                self?.messagePinned.send(event)
            }
        }

        socket.on("message:unpinned") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageUnpinnedEvent.self, from: data) { [weak self] event in
                self?.messageUnpinned.send(event)
            }
        }

        // --- Reaction events ---

        // NOTE (Fix E5 — v1 limitation): realtime reaction events for messages NOT
        // currently held in the active conversation cache are silently dropped here.
        // When the user opens that conversation later, the server-persisted
        // `reactionSummary` on the Message document is the authoritative source of
        // truth and will reflect all reactions. Adding a dedicated reactions cache
        // store was evaluated (approach A) but deferred — the cross-conversation
        // realtime delta is low-value for v1 and the implementation cost is high.
        socket.on("reaction:added") { [weak self] data, _ in
            guard let self else { return }
            let recvAt = Date()
            let firstMsgId = (data.first as? [String: Any])?["messageId"] as? String
            let firstEmoji = (data.first as? [String: Any])?["emoji"] as? String
            Logger.socket.info("perf:ios.notif.socket.reaction-added receivedAt=\(recvAt.timeIntervalSince1970, privacy: .public) messageId=\(firstMsgId ?? "nil", privacy: .public) emoji=\(firstEmoji ?? "nil", privacy: .public)")
            self.decode(ReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.reactionAdded.send(event)
            }
        }

        socket.on("reaction:removed") { [weak self] data, _ in
            guard let self else { return }
            let recvAt = Date()
            let firstMsgId = (data.first as? [String: Any])?["messageId"] as? String
            Logger.socket.info("perf:ios.notif.socket.reaction-removed receivedAt=\(recvAt.timeIntervalSince1970, privacy: .public) messageId=\(firstMsgId ?? "nil", privacy: .public)")
            self.decode(ReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.reactionRemoved.send(event)
            }
        }

        // BUG2 A' — réactions par-image
        socket.on("attachment:reaction-added") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AttachmentReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.attachmentReactionAdded.send(event)
            }
        }

        socket.on("attachment:reaction-removed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AttachmentReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.attachmentReactionRemoved.send(event)
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

        // --- Presence snapshot (emitted by gateway right after auth) ---
        // Le gateway envoie un seul payload `{ users: [...] }` rassemblant tous
        // les contacts du nouvel arrivant avec leur statut runtime. Le client
        // doit hydrater son store en bulk plutôt que d'attendre des transitions
        // d'état spontanées. Voir gateway `_emitPresenceSnapshot`.
        socket.on("presence:snapshot") { [weak self] data, _ in
            guard let self else { return }
            self.decode(PresenceSnapshotEvent.self, from: data) { [weak self] event in
                self?.presenceSnapshotReceived.send(event)
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

        // --- Translation / audio / transcription failure events ---

        socket.on("translation:failed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranslationFailedEvent.self, from: data) { [weak self] event in
                self?.translationFailed.send(event)
            }
        }

        socket.on("audio:translation-failed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationFailedEvent.self, from: data) { [weak self] event in
                self?.audioTranslationFailed.send(event)
            }
        }

        socket.on("audio:transcription-failed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranscriptionFailedEvent.self, from: data) { [weak self] event in
                self?.transcriptionFailed.send(event)
            }
        }

        socket.on("auth:token-expired") { _, _ in
            Logger.socket.info("MessageSocket: auth token expired — triggering refresh")
            Task { @MainActor in
                AuthManager.shared.handleUnauthorized()
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

        socket.on("message:attachment-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AttachmentUpdatedEvent.self, from: data) { [weak self] event in
                self?.attachmentUpdated.send(event)
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
            // One event name, two payload scopes (the gateway emits a union):
            //   conversation scope: { userId, conversationId, version, reset, preferences }
            //   category scope:     { userId, category }
            // Discriminate on `conversationId` so each lands on the right
            // publisher — the conversation scope feeds the versioned
            // `ConversationStore` path, the category scope the legacy flat path.
            if let dict = data.first as? [String: Any], dict["conversationId"] is String {
                self.decode(UserPreferencesConversationUpdatedSocketEvent.self, from: data) { [weak self] event in
                    self?.userPreferencesConversationUpdated.send(event)
                }
            } else {
                self.decode(UserPreferencesUpdatedEvent.self, from: data) { [weak self] event in
                    self?.userPreferencesUpdated.send(event)
                }
            }
        }

        socket.on("user:preferences-reordered") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UserPreferencesReorderedSocketEvent.self, from: data) { [weak self] event in
                self?.userPreferencesReordered.send(event)
            }
        }

        socket.on("conversation:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationDeletedSocketEvent.self, from: data) { [weak self] event in
                self?.conversationDeleted.send(event)
            }
        }

        socket.on("category:created") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CategorySocketEvent.self, from: data) { [weak self] event in
                self?.categoryCreated.send(event)
            }
        }

        socket.on("category:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CategorySocketEvent.self, from: data) { [weak self] event in
                self?.categoryUpdated.send(event)
            }
        }

        socket.on("category:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CategoryDeletedSocketEvent.self, from: data) { [weak self] event in
                self?.categoryDeleted.send(event)
            }
        }

        socket.on("categories:reordered") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CategoriesReorderedSocketEvent.self, from: data) { [weak self] event in
                self?.categoriesReordered.send(event)
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
                // SyncEngine A5 — observe le `_seq` per-user (pilote). Le gap
                // détecté est tracké ; le déclenchement d'une resync sur gap
                // est câblé en A5.2. `observe(nil)` (gateway antérieur) = no-op.
                Task { await SyncSeqTracker.shared.observe(event.seq) }
                self?.notificationReceived.send(event)
            }
        }

        // Intentionally NOT listening for the legacy `"notification"` event
        // here. The gateway only emits `notification:new` (see
        // `NotificationService.createNotification` → `SERVER_EVENTS.NOTIFICATION_NEW`).
        // Keeping a parallel `"notification"` listener that funneled into
        // the same `notificationReceived` subject was a latent
        // double-delivery vector — if any future gateway change emitted
        // both, every notification would arrive twice on iOS and surface
        // duplicate toasts. Single channel keeps the contract obvious.

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
                // Le replay (matché par callId) est inerte une fois l'appel
                // fini ; on libère quand même l'événement bufferisé pour ne
                // pas retenir le dernier payload participant à vie.
                self?.lastCallParticipantJoined = nil
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

        // Audit P1-27 — `call:already-answered` fires on the user's OTHER
        // sockets when one of their devices joins the call. We surface this
        // so the receiving devices can dismiss their ringing CallKit card
        // with .answeredElsewhere instead of staying frozen indefinitely.
        socket.on("call:already-answered") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallAlreadyAnsweredData.self, from: data) { [weak self] event in
                self?.callAlreadyAnswered.send(event)
            }
        }

        socket.on("call:participant-joined") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallParticipantData.self, from: data) { [weak self] event in
                guard let self else { return }
                // CALL-FIX 2026-06-06 — buffer the last event. The initiator sets up
                // its `callParticipantJoined` listener only AFTER the call:initiate
                // ACK; if the callee was already in the call room (socket churn /
                // re-join / rapid retry) the gateway emits participant-joined BEFORE
                // the listener subscribes, and a PassthroughSubject doesn't replay →
                // the offer is never created → 45s ring timeout. The listener replays
                // this buffered value by callId.
                self.lastCallParticipantJoined = event
                self.callParticipantJoined.send(event)
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

        socket.on("call:ice-servers-refreshed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallIceServersRefreshedData.self, from: data) { [weak self] event in
                self?.callIceServersRefreshed.send(event)
            }
        }

        socket.on("call:quality-alert") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallQualityAlertData.self, from: data) { [weak self] event in
                self?.callQualityAlert.send(event)
            }
        }

        socket.on("call:screen-capture-alert") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallScreenCaptureAlertData.self, from: data) { [weak self] event in
                self?.callScreenCaptureAlert.send(event)
            }
        }

        socket.on("call:force-leave") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallForcedLeaveData.self, from: data) { [weak self] event in
                self?.callForcedLeave.send(event)
            }
        }

        socket.on("call:translated-segment") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallTranslatedSegmentData.self, from: data) { [weak self] event in
                self?.callTranslatedSegmentReceived.send(event)
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

    /// Shared, pre-configured decoder. Used ONLY on `decodeQueue` (serial), so a
    /// single reused instance is race-free and avoids allocating a decoder plus
    /// wiring its date strategy on every realtime event.
    private static let socketDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            if let date = MessageSocketManager.isoFormatterWithFractional.date(from: dateStr) { return date }
            if let date = MessageSocketManager.isoFormatterBasic.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }
        return decoder
    }()

    /// Serial so payloads decode in arrival order, off the main thread.
    private static let decodeQueue = DispatchQueue(label: "me.meeshy.socket.decode", qos: .userInitiated)

    private nonisolated func decode<T: Decodable & Sendable>(_ type: T.Type, from data: [Any], handler: @escaping @Sendable (T) -> Void) {
        guard let first = data.first else {
            Logger.socket.error("decode DROP type=\(String(describing: type), privacy: .public) reason=empty-payload")
            return
        }

        // Socket.IO's handle queue defaults to MAIN, so doing the JSONDecoder work
        // inline parsed every realtime event (message / reaction / receipt …) on
        // the main thread — visible CPU on busy conversations. Serialise the dict
        // here (cheap), then decode off-main on a serial queue that preserves
        // arrival order; the handler still lands on main.
        let jsonData: Data
        if let dict = first as? [String: Any] {
            guard let serialized = try? JSONSerialization.data(withJSONObject: dict) else {
                Logger.socket.error("decode DROP type=\(String(describing: type), privacy: .public) reason=reserialize-failed")
                return
            }
            jsonData = serialized
        } else if let str = first as? String {
            jsonData = Data(str.utf8)
        } else {
            Logger.socket.error("decode DROP type=\(String(describing: type), privacy: .public) reason=unexpected-payload-shape")
            return
        }

        // Capture only the (Sendable) key names so a decode failure can still log
        // them off-main, without retaining the non-Sendable payload dictionary.
        let payloadKeys: [String] = (first as? [String: Any]).map { Array($0.keys) } ?? []

        Self.decodeQueue.async {
            do {
                let decoded = try Self.socketDecoder.decode(type, from: jsonData)
                DispatchQueue.main.async { handler(decoded) }
            } catch {
                if payloadKeys.isEmpty {
                    Logger.socket.error("decode FAILED type=\(String(describing: type)): \(error)")
                } else {
                    let keys = payloadKeys.sorted().joined(separator: ", ")
                    Logger.socket.error("decode FAILED type=\(String(describing: type)): \(error) — keys: [\(keys)]")
                }
            }
        }
    }
}
