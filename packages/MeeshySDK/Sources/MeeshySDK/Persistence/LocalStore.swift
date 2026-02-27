import Foundation
import os
import GRDB

// MARK: - Local Store

public actor LocalStore {
    public static let shared = LocalStore()

    private let fileManager = FileManager.default
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "localstore-grdb")
    
    private let dbWriter: DatabaseWriter

    private static let maxCachedMessagesPerConversation = 50
    // GRDB handles dates naturally, but we define thresholds for cleanup if needed.
    private static let staleConversationThresholdDays = 30

    private init() {
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        
        // Setup SQLite via GRDB
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dbDirectory = documentsURL.appendingPathComponent("meeshy_cache_db", isDirectory: true)
        
        do {
            if !FileManager.default.fileExists(atPath: dbDirectory.path) {
                try FileManager.default.createDirectory(at: dbDirectory, withIntermediateDirectories: true)
            }
            let dbURL = dbDirectory.appendingPathComponent("meeshy_cache.sqlite")
            dbWriter = try DatabasePool(path: dbURL.path)
            
            // Perform migrations
            var migrator = DatabaseMigrator()
            migrator.registerMigration("v1_create_tables") { db in
                try db.create(table: "conversations") { t in
                    t.column("id", .text).primaryKey()
                    t.column("updatedAt", .datetime).notNull()
                    t.column("lastAccessAt", .datetime).notNull()
                    t.column("encodedData", .blob).notNull()
                }
                
                try db.create(table: "messages") { t in
                    t.column("id", .text).primaryKey()
                    t.column("conversationId", .text).notNull().references("conversations", onDelete: .cascade)
                    t.column("createdAt", .datetime).notNull()
                    t.column("encodedData", .blob).notNull()
                }
                
                try db.create(index: "index_messages_on_conversationId_createdAt", on: "messages", columns: ["conversationId", "createdAt"])
            }
            try migrator.migrate(dbWriter)
            logger.info("GRDB initialized successfully at \(dbURL.path)")
            
        } catch {
            fatalError("Failed to initialize GRDB cache: \(error.localizedDescription)")
        }
    }

    // MARK: - Helper DB Models
    
    private struct DBConversation: Codable, FetchableRecord, PersistableRecord {
        static let databaseTableName = "conversations"
        var id: String
        var updatedAt: Date
        var lastAccessAt: Date
        var encodedData: Data
    }
    
    private struct DBMessage: Codable, FetchableRecord, PersistableRecord {
        static let databaseTableName = "messages"
        var id: String
        var conversationId: String
        var createdAt: Date
        var encodedData: Data
    }

    // MARK: - Conversations

    public func saveConversations(_ conversations: [MeeshyConversation]) {
        do {
            try dbWriter.write { db in
                let now = Date()
                for conv in conversations {
                    let encoded = try encoder.encode(conv)
                    let dbConv = DBConversation(
                        id: conv.id,
                        updatedAt: conv.updatedAt ?? now,
                        lastAccessAt: now,
                        encodedData: encoded
                    )
                    try dbConv.save(db)
                }
            }
            logger.debug("Saved \(conversations.count) conversations to SQLite")
        } catch {
            logger.error("Failed to save conversations to SQLite: \(error.localizedDescription)")
        }
    }

    public func loadConversations() -> [MeeshyConversation] {
        do {
            return try dbWriter.read { db in
                let records = try DBConversation.order(Column("updatedAt").desc).fetchAll(db)
                return records.compactMap { record in
                    try? decoder.decode(MeeshyConversation.self, from: record.encodedData)
                }
            }
        } catch {
            logger.error("Failed to load conversations from SQLite: \(error.localizedDescription)")
            return []
        }
    }

    // MARK: - Messages

    public func saveMessages(_ messages: [MeeshyMessage], for conversationId: String) {
        do {
            let sortedMessages = messages.sorted { ($0.createdAt ?? Date.distantPast) < ($1.createdAt ?? Date.distantPast) }
            let trimmed = Array(sortedMessages.suffix(Self.maxCachedMessagesPerConversation))
            
            try dbWriter.write { db in
                // Update conversation's last access metadata
                if var conv = try DBConversation.fetchOne(db, key: conversationId) {
                    conv.lastAccessAt = Date()
                    try conv.update(db)
                }
                
                // Insert messages
                for msg in trimmed {
                    let encoded = try encoder.encode(msg)
                    let dbMsg = DBMessage(
                        id: msg.id,
                        conversationId: conversationId,
                        createdAt: msg.createdAt ?? Date(),
                        encodedData: encoded
                    )
                    try dbMsg.save(db) // Upserts
                }
                
                // Trim messages exceeding max limit for this conversation
                let count = try DBMessage.filter(Column("conversationId") == conversationId).fetchCount(db)
                if count > Self.maxCachedMessagesPerConversation {
                    let removeCount = count - Self.maxCachedMessagesPerConversation
                    let toDelete = try String.fetchAll(db, sql: "SELECT id FROM messages WHERE conversationId = ? ORDER BY createdAt ASC LIMIT ?", arguments: [conversationId, removeCount])
                    try DBMessage.filter(toDelete.contains(Column("id"))).deleteAll(db)
                }
            }
            logger.debug("Saved \(trimmed.count) messages for conversation \(conversationId) in SQLite")
        } catch {
            logger.error("Failed to save messages for \(conversationId) in SQLite: \(error.localizedDescription)")
        }
    }

    public func loadMessages(for conversationId: String) -> [MeeshyMessage] {
        do {
            return try dbWriter.read { db in
                let records = try DBMessage
                    .filter(Column("conversationId") == conversationId)
                    .order(Column("createdAt").asc)
                    .fetchAll(db)
                
                let messages = records.compactMap { record in
                    try? decoder.decode(MeeshyMessage.self, from: record.encodedData)
                }
                logger.debug("Loaded \(messages.count) cached messages for conversation \(conversationId) from SQLite")
                return messages
            }
        } catch {
            logger.error("Failed to load sqlite messages for \(conversationId): \(error.localizedDescription)")
            return []
        }
    }

    // MARK: - Cleanup

    public func cleanupStaleMessageCaches() {
        let threshold = Calendar.current.date(
            byAdding: .day,
            value: -Self.staleConversationThresholdDays,
            to: Date()
        ) ?? Date()

        do {
            try dbWriter.write { db in
                let staleConversations = try DBConversation
                    .filter(Column("lastAccessAt") < threshold)
                    .fetchAll(db)
                
                let staleIds = staleConversations.map(\.id)
                guard !staleIds.isEmpty else { return }
                
                // SQLite foreign key cascade will delete related messages
                let deletedCount = try DBConversation.filter(staleIds.contains(Column("id"))).deleteAll(db)
                logger.info("Cleaned up \(deletedCount) stale conversation caches from SQLite")
            }
        } catch {
            logger.error("Failed to cleanup SQLite cache: \(error.localizedDescription)")
        }
    }

    // MARK: - Clear All

    public func clearAll() {
        do {
            try dbWriter.write { db in
                try DBMessage.deleteAll(db)
                try DBConversation.deleteAll(db)
            }
            logger.info("Cleared all SQLite local cache tables")
        } catch {
            logger.error("Failed to clear SQLite cache: \(error.localizedDescription)")
        }
    }
}
