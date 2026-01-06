//
//  MessageStore.swift
//  Meeshy
//
//  Ultra-fast SQLite-based message storage
//  Uses native SQLite3 (no external dependencies)
//  Thread-safe with actor isolation + SQLite FULLMUTEX
//
//  Performance: ~1ms per query vs ~50ms+ CoreData
//

import Foundation
import SQLite3

// MARK: - SQLite Message Store

actor MessageStore {

    // MARK: - Singleton

    static let shared = MessageStore()

    // MARK: - Properties

    // SQLite pointers marked nonisolated(unsafe) for init/deinit access
    // Thread-safety is ensured by SQLITE_OPEN_FULLMUTEX mode
    nonisolated(unsafe) private var db: OpaquePointer?
    nonisolated(unsafe) private var insertStmt: OpaquePointer?
    nonisolated(unsafe) private var selectByConversationStmt: OpaquePointer?
    nonisolated(unsafe) private var selectByIdStmt: OpaquePointer?
    nonisolated(unsafe) private var updateStmt: OpaquePointer?
    nonisolated(unsafe) private var deleteStmt: OpaquePointer?

    private let dbPath: String

    // MARK: - Initialization

    private init() {
        let fileManager = FileManager.default
        let cacheDir = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let dbDir = cacheDir.appendingPathComponent("MessageStore", isDirectory: true)

        try? fileManager.createDirectory(at: dbDir, withIntermediateDirectories: true)

        dbPath = dbDir.appendingPathComponent("messages.sqlite").path

        openDatabaseSync()
        createTablesSync()
        prepareStatementsSync()
    }

    deinit {
        closeDatabaseSync()
    }

    // MARK: - Database Setup (nonisolated for init/deinit)

    private nonisolated func openDatabaseSync() {
        // Open with WAL mode for better concurrency
        var flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
        #if DEBUG
        flags |= SQLITE_OPEN_URI
        #endif

        if sqlite3_open_v2(dbPath, &db, flags, nil) != SQLITE_OK {
            cacheLogger.error("MessageStore: Failed to open database")
            return
        }

        // Enable WAL mode for better performance
        sqlite3_exec(db, "PRAGMA journal_mode=WAL", nil, nil, nil)
        sqlite3_exec(db, "PRAGMA synchronous=NORMAL", nil, nil, nil)
        sqlite3_exec(db, "PRAGMA cache_size=-2000", nil, nil, nil) // 2MB cache
        sqlite3_exec(db, "PRAGMA temp_store=MEMORY", nil, nil, nil)

        cacheLogger.info("MessageStore: Database opened at \(dbPath)")
    }

    private nonisolated func createTablesSync() {
        let createMessagesSQL = """
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                sender_id TEXT,
                content TEXT NOT NULL,
                message_type TEXT NOT NULL DEFAULT 'text',
                is_edited INTEGER NOT NULL DEFAULT 0,
                edited_at TEXT,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                reply_to_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                local_id TEXT,
                is_sending INTEGER NOT NULL DEFAULT 0,
                send_error TEXT,
                sender_username TEXT,
                sender_display_name TEXT,
                sender_avatar TEXT,
                synced_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_messages_local_id ON messages(local_id);
            CREATE INDEX IF NOT EXISTS idx_messages_sending ON messages(is_sending);
        """

        if sqlite3_exec(db, createMessagesSQL, nil, nil, nil) != SQLITE_OK {
            let error = String(cString: sqlite3_errmsg(db))
            cacheLogger.error("MessageStore: Failed to create tables - \(error)")
        }
    }

    private nonisolated func prepareStatementsSync() {
        // Insert statement
        let insertSQL = """
            INSERT OR REPLACE INTO messages (
                id, conversation_id, sender_id, content, message_type,
                is_edited, edited_at, is_deleted, reply_to_id,
                created_at, updated_at, local_id, is_sending, send_error,
                sender_username, sender_display_name, sender_avatar, synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        sqlite3_prepare_v2(db, insertSQL, -1, &insertStmt, nil)

        // Select by conversation
        let selectByConvSQL = """
            SELECT * FROM messages
            WHERE conversation_id = ? AND is_deleted = 0
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        """
        sqlite3_prepare_v2(db, selectByConvSQL, -1, &selectByConversationStmt, nil)

        // Select by ID
        let selectByIdSQL = "SELECT * FROM messages WHERE id = ?"
        sqlite3_prepare_v2(db, selectByIdSQL, -1, &selectByIdStmt, nil)

        // Delete
        let deleteSQL = "UPDATE messages SET is_deleted = 1 WHERE id = ?"
        sqlite3_prepare_v2(db, deleteSQL, -1, &deleteStmt, nil)
    }

    private nonisolated func closeDatabaseSync() {
        sqlite3_finalize(insertStmt)
        sqlite3_finalize(selectByConversationStmt)
        sqlite3_finalize(selectByIdStmt)
        sqlite3_finalize(updateStmt)
        sqlite3_finalize(deleteStmt)
        sqlite3_close(db)
    }

    // MARK: - Public API

    /// Save a message (insert or update)
    func saveMessage(_ message: Message) {
        guard let stmt = insertStmt else { return }

        sqlite3_reset(stmt)

        let dateFormatter = ISO8601DateFormatter()

        sqlite3_bind_text(stmt, 1, message.id, -1, SQLITE_TRANSIENT)
        sqlite3_bind_text(stmt, 2, message.conversationId, -1, SQLITE_TRANSIENT)
        bindOptionalText(stmt, 3, message.senderId)
        sqlite3_bind_text(stmt, 4, message.content, -1, SQLITE_TRANSIENT)
        sqlite3_bind_text(stmt, 5, message.messageType.rawValue, -1, SQLITE_TRANSIENT)
        sqlite3_bind_int(stmt, 6, message.isEdited ? 1 : 0)
        bindOptionalText(stmt, 7, message.editedAt.map { dateFormatter.string(from: $0) })
        sqlite3_bind_int(stmt, 8, message.isDeleted ? 1 : 0)
        bindOptionalText(stmt, 9, message.replyToId)
        sqlite3_bind_text(stmt, 10, dateFormatter.string(from: message.createdAt), -1, SQLITE_TRANSIENT)
        sqlite3_bind_text(stmt, 11, dateFormatter.string(from: message.updatedAt), -1, SQLITE_TRANSIENT)
        bindOptionalText(stmt, 12, message.localId?.uuidString)
        sqlite3_bind_int(stmt, 13, message.isSending ? 1 : 0)
        bindOptionalText(stmt, 14, message.sendError)
        bindOptionalText(stmt, 15, message.sender?.username)
        bindOptionalText(stmt, 16, message.sender?.displayName)
        bindOptionalText(stmt, 17, message.sender?.avatar)
        sqlite3_bind_text(stmt, 18, dateFormatter.string(from: Date()), -1, SQLITE_TRANSIENT)

        if sqlite3_step(stmt) != SQLITE_DONE {
            let error = String(cString: sqlite3_errmsg(db))
            cacheLogger.error("MessageStore: Failed to save message - \(error)")
        }
    }

    /// Save multiple messages in a transaction (batch insert)
    func saveMessages(_ messages: [Message]) {
        guard !messages.isEmpty else { return }

        let startTime = CFAbsoluteTimeGetCurrent()

        sqlite3_exec(db, "BEGIN TRANSACTION", nil, nil, nil)

        for message in messages {
            saveMessage(message)
        }

        sqlite3_exec(db, "COMMIT", nil, nil, nil)

        let elapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
        cacheLogger.info("MessageStore: Saved \(messages.count) messages in \(String(format: "%.1f", elapsed))ms")
    }

    /// Load messages for a conversation
    func loadMessages(conversationId: String, limit: Int = 50, offset: Int = 0) -> [Message] {
        guard let stmt = selectByConversationStmt else { return [] }

        let startTime = CFAbsoluteTimeGetCurrent()

        sqlite3_reset(stmt)
        sqlite3_bind_text(stmt, 1, conversationId, -1, SQLITE_TRANSIENT)
        sqlite3_bind_int(stmt, 2, Int32(limit))
        sqlite3_bind_int(stmt, 3, Int32(offset))

        var messages: [Message] = []

        while sqlite3_step(stmt) == SQLITE_ROW {
            if let message = mapRowToMessage(stmt) {
                messages.append(message)
            }
        }

        let elapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
        cacheLogger.debug("MessageStore: Loaded \(messages.count) messages in \(String(format: "%.2f", elapsed))ms")

        return messages
    }

    /// Get a single message by ID
    func getMessage(id: String) -> Message? {
        guard let stmt = selectByIdStmt else { return nil }

        sqlite3_reset(stmt)
        sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT)

        if sqlite3_step(stmt) == SQLITE_ROW {
            return mapRowToMessage(stmt)
        }

        return nil
    }

    /// Delete a message (soft delete)
    func deleteMessage(id: String) {
        guard let stmt = deleteStmt else { return }

        sqlite3_reset(stmt)
        sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT)

        if sqlite3_step(stmt) != SQLITE_DONE {
            let error = String(cString: sqlite3_errmsg(db))
            cacheLogger.error("MessageStore: Failed to delete message - \(error)")
        }
    }

    /// Delete all messages for a conversation
    func deleteMessages(conversationId: String) {
        let sql = "DELETE FROM messages WHERE conversation_id = ?"
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_text(stmt, 1, conversationId, -1, SQLITE_TRANSIENT)
            sqlite3_step(stmt)
            sqlite3_finalize(stmt)
        }
    }

    /// Get unsent messages (for retry)
    func getUnsentMessages() -> [Message] {
        let sql = "SELECT * FROM messages WHERE is_sending = 1 OR send_error IS NOT NULL ORDER BY created_at ASC"
        var stmt: OpaquePointer?
        var messages: [Message] = []

        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            while sqlite3_step(stmt) == SQLITE_ROW {
                if let message = mapRowToMessage(stmt) {
                    messages.append(message)
                }
            }
            sqlite3_finalize(stmt)
        }

        return messages
    }

    /// Clear all data
    func clearAll() {
        sqlite3_exec(db, "DELETE FROM messages", nil, nil, nil)
        sqlite3_exec(db, "VACUUM", nil, nil, nil)
        cacheLogger.info("MessageStore: All data cleared")
    }

    /// Get total message count
    func getMessageCount() -> Int {
        let sql = "SELECT COUNT(*) FROM messages WHERE is_deleted = 0"
        var stmt: OpaquePointer?
        var count = 0

        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            if sqlite3_step(stmt) == SQLITE_ROW {
                count = Int(sqlite3_column_int(stmt, 0))
            }
            sqlite3_finalize(stmt)
        }

        return count
    }

    // MARK: - Private Helpers

    private nonisolated let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private func bindOptionalText(_ stmt: OpaquePointer?, _ index: Int32, _ value: String?) {
        if let value = value {
            sqlite3_bind_text(stmt, index, value, -1, SQLITE_TRANSIENT)
        } else {
            sqlite3_bind_null(stmt, index)
        }
    }

    private func getOptionalText(_ stmt: OpaquePointer?, _ index: Int32) -> String? {
        guard let ptr = sqlite3_column_text(stmt, index) else { return nil }
        return String(cString: ptr)
    }

    private func mapRowToMessage(_ stmt: OpaquePointer?) -> Message? {
        guard let stmt = stmt else { return nil }

        let dateFormatter = ISO8601DateFormatter()

        guard let id = getOptionalText(stmt, 0),
              let conversationId = getOptionalText(stmt, 1),
              let content = getOptionalText(stmt, 3),
              let messageTypeStr = getOptionalText(stmt, 4),
              let createdAtStr = getOptionalText(stmt, 9),
              let updatedAtStr = getOptionalText(stmt, 10),
              let createdAt = dateFormatter.date(from: createdAtStr),
              let updatedAt = dateFormatter.date(from: updatedAtStr) else {
            return nil
        }

        let senderId = getOptionalText(stmt, 2)
        let messageType = MessageContentType(rawValue: messageTypeStr) ?? .text
        let isEdited = sqlite3_column_int(stmt, 5) == 1
        let editedAtStr = getOptionalText(stmt, 6)
        let editedAt = editedAtStr.flatMap { dateFormatter.date(from: $0) }
        let isDeleted = sqlite3_column_int(stmt, 7) == 1
        let replyToId = getOptionalText(stmt, 8)
        let localIdStr = getOptionalText(stmt, 11)
        let localId = localIdStr.flatMap { UUID(uuidString: $0) }
        let isSending = sqlite3_column_int(stmt, 12) == 1
        let sendError = getOptionalText(stmt, 13)

        // Sender info
        let senderUsername = getOptionalText(stmt, 14)
        let senderDisplayName = getOptionalText(stmt, 15)
        let senderAvatar = getOptionalText(stmt, 16)

        let sender: MessageSender? = {
            guard let username = senderUsername, let sid = senderId else { return nil }
            return MessageSender(
                id: sid,
                username: username,
                displayName: senderDisplayName,
                avatar: senderAvatar
            )
        }()

        return Message(
            id: id,
            conversationId: conversationId,
            senderId: senderId,
            anonymousSenderId: nil,
            content: content,
            originalLanguage: "fr",
            messageType: messageType,
            isEdited: isEdited,
            editedAt: editedAt,
            isDeleted: isDeleted,
            deletedAt: nil,
            replyToId: replyToId,
            validatedMentions: [],
            createdAt: createdAt,
            updatedAt: updatedAt,
            sender: sender,
            attachments: nil,
            reactions: nil,
            mentions: nil,
            status: nil,
            localId: localId,
            isSending: isSending,
            sendError: sendError
        )
    }
}

// MARK: - Search Extension

extension MessageStore {
    /// Search messages by content
    func searchMessages(query: String, conversationId: String? = nil, limit: Int = 50) -> [Message] {
        var sql = "SELECT * FROM messages WHERE content LIKE ? AND is_deleted = 0"
        if conversationId != nil {
            sql += " AND conversation_id = ?"
        }
        sql += " ORDER BY created_at DESC LIMIT ?"

        var stmt: OpaquePointer?
        var messages: [Message] = []

        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            let searchPattern = "%\(query)%"
            sqlite3_bind_text(stmt, 1, searchPattern, -1, SQLITE_TRANSIENT)

            var paramIndex: Int32 = 2
            if let convId = conversationId {
                sqlite3_bind_text(stmt, paramIndex, convId, -1, SQLITE_TRANSIENT)
                paramIndex += 1
            }
            sqlite3_bind_int(stmt, paramIndex, Int32(limit))

            while sqlite3_step(stmt) == SQLITE_ROW {
                if let message = mapRowToMessage(stmt) {
                    messages.append(message)
                }
            }
            sqlite3_finalize(stmt)
        }

        return messages
    }
}
