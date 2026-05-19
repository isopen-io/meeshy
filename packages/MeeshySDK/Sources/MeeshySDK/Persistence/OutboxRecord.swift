import Foundation
import GRDB

/// Kind of write mutation persisted in the outbox.
///
/// Raw values are stable on-disk identifiers (column `outbox.kind`) — renaming
/// a case is a migration, not a refactor. New cases MUST be appended ;
/// existing cases MUST NOT have their raw value changed.
///
/// The first four (`.sendMessage`, `.sendReaction`, `.editMessage`,
/// `.deleteMessage`) are the message-centric kinds shipped in Phase 4 §6.
/// The 14 additional cases (Wave 1 Task 3.2) generalize the outbox to all
/// write mutations and key into the gateway `MutationLog` table via
/// `(userId, clientMutationId)`.
///
/// `CaseIterable` is required by `OutboxKindCodableTests` to lock the
/// total surface, and by future migration tooling.
public enum OutboxKind: String, Codable, CaseIterable, Sendable {
    // Message-centric (Phase 4 §6 — existing rows in the outbox table use
    // these raw values, do not rename).
    case sendMessage
    case sendReaction
    case editMessage
    case deleteMessage

    // Wave 1 Task 3.2 — non-message mutations. Keyed to the gateway
    // `MutationLog` via `clientMutationId` (`cmid_<uuid>`).
    case markAsRead
    case sendFriendRequest
    /// accept | reject — see `RespondFriendRequestPayload.action`.
    case respondFriendRequest
    case blockUser
    case unblockUser
    case createConversation
    /// title, description, avatar — see `UpdateConversationPayload`.
    case updateConversation
    /// displayName, bio, avatarUrl — see `UpdateProfilePayload`.
    case updateProfile
    /// language, regional, custom, notifications, privacy — see `UpdateSettingsPayload`.
    case updateSettings
    /// Existing `StoryOfflineQueue` items will migrate here (Tier C). The
    /// payload (`PublishStoryPayload`) holds the offline-queue item id so
    /// the slide snapshot stays in its current JSON file for now.
    case publishStory
    case repostStory
    case createPost
    case toggleLikePost
    case createComment
    case deleteComment
    case toggleLikeComment
}

extension OutboxKind {
    /// Whether a still-pending row of this kind should keep the app's
    /// « Synchronisation… » indicator visible.
    ///
    /// `markAsRead` est un accusé de lecture purement informatif et
    /// idempotent : s'il échoue ou reste coincé (session expirée, etc.) le
    /// contenu de la conversation est malgré tout synchronisé. Le compter
    /// ferait croire à l'utilisateur qu'une synchro est en cours alors que
    /// tout est à jour — c'est précisément le bandeau « bloqué » observé.
    public var countsTowardSyncIndicator: Bool {
        switch self {
        case .markAsRead:
            return false
        default:
            return true
        }
    }
}

public enum OutboxStatus: String, Codable, Sendable {
    case pending
    case inflight
    case failed
    case exhausted
}

public struct OutboxRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "outbox"

    public let id: String
    public let kind: OutboxKind
    public let conversationId: String
    public let messageLocalId: String?
    /// Stable end-to-end identifier (`cid_<uuid v4 lowercase>`) used for idempotent
    /// dedup with the gateway and for in-queue coalescing of edit/delete/reaction
    /// records targeting the same message.
    public let clientMessageId: String
    public let payload: Data
    public var status: OutboxStatus
    public var attempts: Int
    public var lastError: String?
    public let createdAt: Date
    public var updatedAt: Date
    public var nextAttemptAt: Date

    public init(
        id: String = UUID().uuidString,
        kind: OutboxKind,
        conversationId: String,
        messageLocalId: String? = nil,
        clientMessageId: String,
        payload: Data,
        status: OutboxStatus = .pending,
        attempts: Int = 0,
        lastError: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        nextAttemptAt: Date = Date()
    ) {
        self.id = id
        self.kind = kind
        self.conversationId = conversationId
        self.messageLocalId = messageLocalId
        self.clientMessageId = clientMessageId
        self.payload = payload
        self.status = status
        self.attempts = attempts
        self.lastError = lastError
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.nextAttemptAt = nextAttemptAt
    }
}
