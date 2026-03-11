import Foundation
import GRDB
import os

public actor MessageCacheManager {
    public static let shared = MessageCacheManager()

    private let db: any DatabaseWriter
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "message-cache")
    private let ttl: TimeInterval = 86400
    private let maxMessagesPerConversation = 50

    private var memoryCache: [String: [MeeshyMessage]] = [:]

    public init(databaseWriter: (any DatabaseWriter)? = nil) {
        self.db = databaseWriter ?? AppDatabase.shared.databaseWriter
    }

    private func metadataKey(for conversationId: String) -> String {
        "messages:\(conversationId)"
    }

    // MARK: - Read

    public func loadMessages(for conversationId: String) -> [MeeshyMessage] {
        if let cached = memoryCache[conversationId] { return cached }
        do {
            let key = metadataKey(for: conversationId)
            let meta = try db.read { try DBCacheMetadata.fetchOne($0, key: key) }
            guard let meta, !meta.isExpired(ttl: ttl) else { return [] }

            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let records = try db.read {
                try DBMessage
                    .filter(Column("conversationId") == conversationId)
                    .order(Column("createdAt").asc)
                    .fetchAll($0)
            }
            let messages = records.compactMap { try? decoder.decode(MeeshyMessage.self, from: $0.encodedData) }
            memoryCache[conversationId] = messages
            return messages
        } catch {
            logger.error("Failed to load cached messages for \(conversationId): \(error.localizedDescription)")
            return []
        }
    }

    public func isExpired(for conversationId: String) -> Bool {
        do {
            let meta = try db.read { try DBCacheMetadata.fetchOne($0, key: metadataKey(for: conversationId)) }
            guard let meta else { return true }
            return meta.isExpired(ttl: ttl)
        } catch { return true }
    }

    // MARK: - Write

    public func saveMessages(_ messages: [MeeshyMessage], for conversationId: String) {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601

            let sorted = messages.sorted { $0.createdAt < $1.createdAt }
            let trimmed = Array(sorted.suffix(maxMessagesPerConversation))

            try db.write { db in
                try DBMessage.filter(Column("conversationId") == conversationId).deleteAll(db)

                for msg in trimmed {
                    let encoded = try encoder.encode(msg)
                    let record = DBMessage(
                        id: msg.id,
                        conversationId: conversationId,
                        createdAt: msg.createdAt,
                        encodedData: encoded
                    )
                    try record.save(db)
                }

                let meta = DBCacheMetadata(
                    key: metadataKey(for: conversationId),
                    nextCursor: nil,
                    hasMore: false,
                    totalCount: trimmed.count,
                    lastFetchedAt: Date()
                )
                try meta.save(db)
            }
            memoryCache[conversationId] = trimmed
        } catch {
            logger.error("Failed to save messages for \(conversationId): \(error.localizedDescription)")
        }
    }

    public func appendMessage(_ message: MeeshyMessage, for conversationId: String) {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let encoded = try encoder.encode(message)

            try db.write { db in
                let record = DBMessage(
                    id: message.id,
                    conversationId: conversationId,
                    createdAt: message.createdAt,
                    encodedData: encoded
                )
                try record.save(db)

                let count = try DBMessage.filter(Column("conversationId") == conversationId).fetchCount(db)
                if count > maxMessagesPerConversation {
                    let removeCount = count - maxMessagesPerConversation
                    let toDelete = try String.fetchAll(
                        db,
                        sql: "SELECT id FROM messages WHERE conversationId = ? ORDER BY createdAt ASC LIMIT ?",
                        arguments: [conversationId, removeCount]
                    )
                    try DBMessage.filter(toDelete.contains(Column("id"))).deleteAll(db)
                }

                if var meta = try DBCacheMetadata.fetchOne(db, key: metadataKey(for: conversationId)) {
                    meta.lastFetchedAt = Date()
                    let newCount = try DBMessage.filter(Column("conversationId") == conversationId).fetchCount(db)
                    meta.totalCount = newCount
                    try meta.update(db)
                } else {
                    let meta = DBCacheMetadata(
                        key: metadataKey(for: conversationId),
                        nextCursor: nil,
                        hasMore: false,
                        totalCount: 1,
                        lastFetchedAt: Date()
                    )
                    try meta.save(db)
                }
            }
            memoryCache[conversationId] = nil
        } catch {
            logger.error("Failed to append message for \(conversationId): \(error.localizedDescription)")
        }
    }

    // MARK: - Delete

    public func deleteMessage(id: String, conversationId: String) {
        do {
            try db.write { _ = try DBMessage.deleteOne($0, key: id) }
            memoryCache[conversationId] = nil
        } catch {
            logger.error("Failed to delete message \(id): \(error.localizedDescription)")
        }
    }

    // MARK: - Invalidation

    public func invalidate(conversationId: String) {
        memoryCache[conversationId] = nil
        do {
            try db.write { db in
                try DBMessage.filter(Column("conversationId") == conversationId).deleteAll(db)
                _ = try DBCacheMetadata.deleteOne(db, key: metadataKey(for: conversationId))
            }
        } catch {
            logger.error("Failed to invalidate messages for \(conversationId): \(error.localizedDescription)")
        }
    }

    public func invalidateAll() {
        memoryCache.removeAll()
        do {
            try db.write { db in
                try DBMessage.deleteAll(db)
                try DBCacheMetadata.filter(Column("key").like("messages:%")).deleteAll(db)
            }
        } catch {
            logger.error("Failed to invalidate all messages: \(error.localizedDescription)")
        }
    }
}
