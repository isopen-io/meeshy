import Foundation
import GRDB

public enum OutboxKind: String, Codable, Sendable {
    case sendMessage
    case sendReaction
    case editMessage
    case deleteMessage
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
