import Foundation
import os
import GRDB

public actor SQLLocalStore {
    public static let shared = SQLLocalStore()
    
    private let db = AppDatabase.shared.databaseWriter
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "sqllocalstore")
    
    private init() {
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }
    
    // MARK: - Conversations
    
    public func saveConversations(_ conversations: [MeeshyConversation]) {
        do {
            try db.write { db in
                for conv in conversations {
                    let encoded = try encoder.encode(conv)
                    let dbConv = DBConversation(
                        id: conv.id,
                        name: conv.name ?? "Unnamed",
                        encodedData: encoded,
                        updatedAt: conv.updatedAt ?? Date()
                    )
                    try dbConv.save(db)
                }
            }
            logger.debug("Saved \(conversations.count) conversations to DB")
        } catch {
            logger.error("Failed to save conversations to DB: \(error.localizedDescription)")
        }
    }
    
    public func loadConversations() -> [MeeshyConversation] {
        do {
            return try db.read { db in
                let records = try DBConversation.order(Column("updatedAt").desc).fetchAll(db)
                return records.compactMap { record in
                    try? decoder.decode(MeeshyConversation.self, from: record.encodedData)
                }
            }
        } catch {
            logger.error("Failed to load conversations from DB: \(error.localizedDescription)")
            return []
        }
    }
    
    // MARK: - Messages
    
    public func saveMessages(_ messages: [MeeshyMessage], for conversationId: String) {
        do {
            try db.write { db in
                // Start a transaction implicitly inside write
                // Insert new/updated messages
                for msg in messages {
                    let encoded = try encoder.encode(msg)
                    let dbMsg = DBMessage(
                        id: msg.id,
                        conversationId: conversationId,
                        createdAt: msg.createdAt ?? Date(),
                        encodedData: encoded
                    )
                    try dbMsg.save(db)
                }
                
                // Trim to max 200 per conversation
                let count = try DBMessage.filter(Column("conversationId") == conversationId).fetchCount(db)
                if count > 200 {
                    let overage = count - 200
                    let idsToDelete = try String.fetchAll(db, sql: """
                        SELECT id FROM messages WHERE conversationId = ? ORDER BY createdAt ASC LIMIT ?
                        """, arguments: [conversationId, overage])
                    
                    try DBMessage.filter(idsToDelete.contains(Column("id"))).deleteAll(db)
                }
            }
            logger.debug("Saved \(messages.count) messages for conversation \(conversationId)")
        } catch {
            logger.error("Failed to save messages for \(conversationId): \(error.localizedDescription)")
        }
    }
    
    public func loadMessages(for conversationId: String) -> [MeeshyMessage] {
        do {
            return try db.read { db in
                let records = try DBMessage
                    .filter(Column("conversationId") == conversationId)
                    .order(Column("createdAt").asc)
                    .fetchAll(db)
                
                return records.compactMap { record in
                    try? decoder.decode(MeeshyMessage.self, from: record.encodedData)
                }
            }
        } catch {
            logger.error("Failed to load messages for \(conversationId): \(error.localizedDescription)")
            return []
        }
    }
    
    // MARK: - Clear All
    
    public func clearAll() {
        do {
            try db.write { db in
                try DBMessage.deleteAll(db)
                try DBConversation.deleteAll(db)
            }
            logger.info("Cleared all SQLite local cache")
        } catch {
            logger.error("Failed to clear DB: \(error.localizedDescription)")
        }
    }
}
