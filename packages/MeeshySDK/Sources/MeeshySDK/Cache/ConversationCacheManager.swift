import Foundation
import GRDB
import os

public actor ConversationCacheManager {
    public static let shared = ConversationCacheManager()

    private let db: any DatabaseWriter
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "conversation-cache")
    private let ttl: TimeInterval = 86400
    private let metadataKey = "conversations:list"

    private var memoryCache: [MeeshyConversation]?

    public init(databaseWriter: (any DatabaseWriter)? = nil) {
        self.db = databaseWriter ?? AppDatabase.shared.databaseWriter
    }

    // MARK: - Read

    public func loadConversations() -> [MeeshyConversation] {
        if let memory = memoryCache { return memory }
        do {
            let meta = try db.read { try DBCacheMetadata.fetchOne($0, key: metadataKey) }
            guard let meta, !meta.isExpired(ttl: ttl) else { return [] }

            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let records = try db.read { try DBConversation.order(Column("updatedAt").desc).fetchAll($0) }
            let conversations = records.compactMap { try? decoder.decode(MeeshyConversation.self, from: $0.encodedData) }
            memoryCache = conversations
            return conversations
        } catch {
            logger.error("Failed to load cached conversations: \(error.localizedDescription)")
            return []
        }
    }

    public func isExpired() -> Bool {
        do {
            let meta = try db.read { try DBCacheMetadata.fetchOne($0, key: metadataKey) }
            guard let meta else { return true }
            return meta.isExpired(ttl: ttl)
        } catch { return true }
    }

    // MARK: - Write

    public func saveConversations(_ conversations: [MeeshyConversation]) {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            try db.write { db in
                try DBConversation.deleteAll(db)

                for conv in conversations {
                    let encoded = try encoder.encode(conv)
                    let record = DBConversation(
                        id: conv.id,
                        name: conv.name,
                        encodedData: encoded,
                        updatedAt: conv.updatedAt
                    )
                    try record.save(db)
                }

                let meta = DBCacheMetadata(
                    key: metadataKey,
                    nextCursor: nil,
                    hasMore: false,
                    totalCount: conversations.count,
                    lastFetchedAt: Date()
                )
                try meta.save(db)
            }
            memoryCache = conversations
        } catch {
            logger.error("Failed to save conversations: \(error.localizedDescription)")
        }
    }

    public func updateConversation(_ conversation: MeeshyConversation) {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let encoded = try encoder.encode(conversation)
            try db.write { db in
                let record = DBConversation(
                    id: conversation.id,
                    name: conversation.name,
                    encodedData: encoded,
                    updatedAt: conversation.updatedAt
                )
                try record.save(db)
            }
            memoryCache = nil
        } catch {
            logger.error("Failed to update conversation: \(error.localizedDescription)")
        }
    }

    public func removeConversation(id: String) {
        do {
            try db.write { _ = try DBConversation.deleteOne($0, key: id) }
            memoryCache?.removeAll { $0.id == id }
        } catch {
            logger.error("Failed to remove conversation: \(error.localizedDescription)")
        }
    }

    // MARK: - Invalidation

    public func invalidateAll() {
        memoryCache = nil
        do {
            try db.write { db in
                try DBConversation.deleteAll(db)
                _ = try DBCacheMetadata.deleteOne(db, key: metadataKey)
            }
        } catch {
            logger.error("Failed to invalidate conversations: \(error.localizedDescription)")
        }
    }
}
