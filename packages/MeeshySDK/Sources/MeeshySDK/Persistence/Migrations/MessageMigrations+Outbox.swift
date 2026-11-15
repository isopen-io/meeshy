import Foundation
import GRDB

struct OutboxMigration: DatabaseMigration {
    let identifier = "outbox"

    func migrate(_ db: Database) throws {
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
}

struct OutboxV2ClientMessageIdMigration: DatabaseMigration {
    let identifier = "outbox_v2_client_message_id"

    func migrate(_ db: Database) throws {
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
}

struct OutboxV3WaitingForFanoutOriginSinceMigration: DatabaseMigration {
    let identifier = "outbox_v3_waiting_for_fanout_origin_since"

    func migrate(_ db: Database) throws {
        try db.alter(table: "outbox") { t in
            t.add(column: "waitingForFanoutOriginSince", .datetime)
        }
    }
}

struct OutboxV4CancelRequestedAtMigration: DatabaseMigration {
    let identifier = "outbox_v4_cancel_requested_at"

    func migrate(_ db: Database) throws {
        try db.alter(table: "outbox") { t in
            t.add(column: "cancelRequestedAt", .datetime)
        }
    }
}
