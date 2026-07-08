import Foundation
import GRDB

public enum MessageDatabaseMigrations {

    /// Run all message-layer migrations on the given database
    public static func runAll(on db: any DatabaseWriter) throws {
        var migrator = DatabaseMigrator()
        registerAll(in: &migrator)
        try migrator.migrate(db)
    }

    /// Register migrations without running — for use with shared migrator
    public static func registerAll(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("msg_v1_messages") { db in
            try db.create(table: "messages") { t in
                t.column("localId", .text).primaryKey()
                t.column("serverId", .text).indexed()
                t.column("conversationId", .text).notNull()
                t.column("senderId", .text).notNull()
                t.column("content", .text)
                t.column("originalLanguage", .text).notNull().defaults(to: "fr")
                t.column("messageType", .text).notNull().defaults(to: "text")
                t.column("messageSource", .text).notNull().defaults(to: "user")
                t.column("contentType", .text).notNull().defaults(to: "text")
                t.column("state", .text).notNull()
                t.column("retryCount", .integer).notNull().defaults(to: 0)
                t.column("lastError", .text)
                t.column("isEncrypted", .boolean).notNull().defaults(to: false)
                t.column("encryptionMode", .text)
                t.column("encryptedPayload", .blob)
                t.column("replyToId", .text)
                t.column("storyReplyToId", .text)
                t.column("forwardedFromId", .text)
                t.column("forwardedFromConversationId", .text)
                t.column("replyToJson", .blob)
                t.column("forwardedFromJson", .blob)
                t.column("expiresAt", .datetime)
                t.column("effectFlags", .integer).notNull().defaults(to: 0)
                t.column("maxViewOnceCount", .integer)
                t.column("viewOnceCount", .integer).notNull().defaults(to: 0)
                t.column("isEdited", .boolean).notNull().defaults(to: false)
                t.column("editedAt", .datetime)
                t.column("deletedAt", .datetime)
                t.column("pinnedAt", .datetime)
                t.column("pinnedBy", .text)
                t.column("senderName", .text)
                t.column("senderUsername", .text)
                t.column("senderColor", .text)
                t.column("senderAvatarURL", .text)
                t.column("deliveredCount", .integer).notNull().defaults(to: 0)
                t.column("readCount", .integer).notNull().defaults(to: 0)
                t.column("deliveredToAllAt", .datetime)
                t.column("readByAllAt", .datetime)
                t.column("createdAt", .datetime).notNull()
                t.column("sentAt", .datetime)
                t.column("deliveredAt", .datetime)
                t.column("readAt", .datetime)
                t.column("updatedAt", .datetime).notNull()
                t.column("attachmentsJson", .blob)
                t.column("reactionsJson", .blob)
                t.column("reactionCount", .integer).notNull().defaults(to: 0)
                t.column("currentUserReactionsJson", .blob)
                t.column("mentionedUsersJson", .blob)
                t.column("cachedBubbleWidth", .double)
                t.column("cachedBubbleHeight", .double)
                t.column("cachedLastLineWidth", .double)
                t.column("cachedLineCount", .integer)
                t.column("cachedTimestampInline", .boolean)
                t.column("layoutVersion", .integer).notNull().defaults(to: 0)
                t.column("layoutMaxWidth", .double)
                t.column("changeVersion", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_msg_conv_date", on: "messages",
                          columns: ["conversationId", "createdAt"])
            try db.create(index: "idx_msg_state", on: "messages", columns: ["state"])
        }

        migrator.registerMigration("msg_v1_pending_ids") { db in
            try db.create(table: "pending_ids") { t in
                t.column("localId", .text).primaryKey()
                t.column("serverId", .text).notNull().indexed()
                t.column("conversationId", .text).notNull()
                t.column("reconciledAt", .datetime)
            }
        }

        migrator.registerMigration("msg_v1_translations") { db in
            try db.create(table: "message_translations") { t in
                t.column("id", .text).primaryKey()
                t.column("messageLocalId", .text).notNull().indexed()
                t.column("messageServerId", .text)
                t.column("targetLanguage", .text).notNull()
                t.column("translatedContent", .text).notNull()
                t.column("translationModel", .text).notNull()
                t.column("confidenceScore", .double)
                t.column("sourceLanguage", .text)
                t.column("receivedAt", .datetime).notNull()
            }
            try db.create(index: "idx_trans_msg_lang", on: "message_translations",
                          columns: ["messageLocalId", "targetLanguage"], unique: true)
        }

        migrator.registerMigration("msg_v1_transcriptions") { db in
            try db.create(table: "message_transcriptions") { t in
                t.column("messageLocalId", .text).primaryKey()
                t.column("messageServerId", .text)
                t.column("language", .text).notNull()
                t.column("text", .text).notNull()
                t.column("segmentsJson", .blob)
                t.column("speakerCount", .integer)
                t.column("receivedAt", .datetime).notNull()
            }
        }

        migrator.registerMigration("msg_v1_audio_translations") { db in
            try db.create(table: "message_audio_translations") { t in
                t.column("id", .text).primaryKey()
                t.column("messageLocalId", .text).notNull().indexed()
                t.column("messageServerId", .text)
                t.column("targetLanguage", .text).notNull()
                t.column("audioUrl", .text)
                t.column("status", .text).notNull()
                t.column("receivedAt", .datetime).notNull()
            }
        }

        migrator.registerMigration("msg_v1_local_attachments") { db in
            try db.create(table: "local_attachments") { t in
                t.column("localId", .text).primaryKey()
                t.column("messageLocalId", .text).notNull().indexed()
                t.column("type", .text).notNull()
                t.column("mimeType", .text).notNull()
                t.column("fileName", .text).notNull()
                t.column("fileSize", .integer).notNull()
                t.column("localPath", .text).notNull()
                t.column("thumbnailPath", .text)
                t.column("width", .double)
                t.column("height", .double)
                t.column("duration", .double)
                t.column("createdAt", .datetime).notNull()
                t.column("remoteUrl", .text)
                t.column("uploadProgress", .double)
                t.column("uploadState", .text).notNull().defaults(to: "pending")
            }
        }

        migrator.registerMigration("outbox") { db in
            try db.execute(sql: """
                CREATE TABLE outbox (
                    id TEXT PRIMARY KEY NOT NULL,
                    kind TEXT NOT NULL,
                    conversationId TEXT NOT NULL,
                    messageLocalId TEXT,
                    payload BLOB NOT NULL,
                    status TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    lastError TEXT,
                    createdAt DATETIME NOT NULL,
                    updatedAt DATETIME NOT NULL,
                    nextAttemptAt DATETIME NOT NULL
                )
                """)

            try db.execute(sql: """
                CREATE INDEX idx_outbox_status_next ON outbox(status, nextAttemptAt)
                """)

            try db.execute(sql: """
                CREATE INDEX idx_outbox_conv ON outbox(conversationId)
                """)
        }

        migrator.registerMigration("outbox_v2_client_message_id") { db in
            // Add the column nullable (SQLite cannot ALTER TABLE ADD a NOT NULL
            // column without a default), then backfill from `messageLocalId`
            // (the legacy local id that carried the same role pre-Phase-4) or
            // from `id` as a last-resort fallback so every existing row has a
            // non-empty value. The Swift `OutboxRecord.clientMessageId` is
            // declared non-optional; rows decoded after this migration are
            // guaranteed to satisfy it.
            try db.execute(sql: """
                ALTER TABLE outbox ADD COLUMN clientMessageId TEXT
                """)
            try db.execute(sql: """
                UPDATE outbox SET clientMessageId = COALESCE(messageLocalId, id)
                WHERE clientMessageId IS NULL OR clientMessageId = ''
                """)
            // Composite index that backs the in-queue coalescing query
            // `WHERE conversationId = ? AND clientMessageId = ? AND status = 'pending'`
            // executed on every enqueue.
            try db.execute(sql: """
                CREATE INDEX idx_outbox_conv_client_status
                ON outbox(conversationId, clientMessageId, status)
                """)
        }

        migrator.registerMigration("messages_cached_time_string") { db in
            try db.alter(table: "messages") { t in
                t.add(column: "cachedTimeString", .text)
            }
            // Backfill existing rows — GRDB stores Date columns as UTC text
            // ("yyyy-MM-dd HH:mm:ss.SSS" with a space separator). The 'localtime'
            // modifier converts from UTC to the device's local timezone so the
            // cached string matches what TimeStringCache.shared.format() produces.
            try db.execute(sql: """
                UPDATE messages SET cachedTimeString =
                    strftime('%H:%M', createdAt, 'localtime')
                WHERE cachedTimeString IS NULL
                """)
        }

        migrator.registerMigration("msg_v1_messages_fts5") { db in
            // External-content FTS5 — content lives in `messages`, FTS just indexes
            // unicode61 remove_diacritics 2 gives French-aware accent folding:
            // "à", "é", "ç" all match their unaccented forms at query time
            try db.execute(sql: """
                CREATE VIRTUAL TABLE messages_fts USING fts5(
                    content,
                    content='messages',
                    content_rowid='rowid',
                    tokenize='unicode61 remove_diacritics 2'
                )
                """)

            // Backfill existing rows (exclude soft-deleted messages)
            try db.execute(sql: """
                INSERT INTO messages_fts(rowid, content)
                SELECT rowid, content FROM messages
                WHERE content IS NOT NULL AND deletedAt IS NULL
                """)

            // Insert trigger — keep FTS in sync when a new message is stored
            try db.execute(sql: """
                CREATE TRIGGER msg_fts_ai AFTER INSERT ON messages BEGIN
                    INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
                END
                """)

            // Delete trigger — use FTS5 'delete' command for external-content tables
            try db.execute(sql: """
                CREATE TRIGGER msg_fts_ad AFTER DELETE ON messages BEGIN
                    INSERT INTO messages_fts(messages_fts, rowid, content)
                    VALUES('delete', old.rowid, old.content);
                END
                """)

            // Update trigger — remove stale index entry, insert updated one
            try db.execute(sql: """
                CREATE TRIGGER msg_fts_au AFTER UPDATE ON messages BEGIN
                    INSERT INTO messages_fts(messages_fts, rowid, content)
                    VALUES('delete', old.rowid, old.content);
                    INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
                END
                """)
        }

        // Structured call-summary metadata for system call messages — persisted
        // as a JSON blob (mirrors attachmentsJson/reactionsJson) so the rich,
        // actionable call bubble survives a GRDB cache reload, not just the
        // live socket/REST render.
        migrator.registerMigration("messages_call_summary") { db in
            try db.alter(table: "messages") { t in
                t.add(column: "callSummaryJson", .blob)
            }
        }

        // Server's authoritative active-recipient denominator for the
        // all-or-nothing delivery indicator (active participants excluding the
        // sender). NOT NULL DEFAULT 0 keeps existing rows valid and matches
        // `MessageRecord.recipientCount` (0 = server did not provide it → the
        // display falls back to `memberCount − 1`).
        migrator.registerMigration("messages_recipient_count") { db in
            try db.alter(table: "messages") { t in
                t.add(column: "recipientCount", .integer).notNull().defaults(to: 0)
            }
        }

        // Journal local des tentatives d'envoi (spec 2026-07-08
        // message-send-failure-retry-flow) — une ligne par tentative de
        // transport, clé `localId` = clientMessageId. Conservé après succès
        // pour la carte « Historique d'envoi » de la vue détails.
        migrator.registerMigration("messages_send_attempts") { db in
            try db.create(table: "send_attempts") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("localId", .text).notNull().indexed()
                t.column("attemptNumber", .integer).notNull()
                t.column("transport", .text).notNull()
                t.column("startedAt", .datetime).notNull()
                t.column("finishedAt", .datetime)
                t.column("outcome", .text).notNull()
                t.column("errorMessage", .text)
            }
        }
    }
}
