import Foundation
import GRDB

enum AppDatabaseMigrations {
    static let all: [any DatabaseMigration] = beforeSearchIndex + SearchIndexMigrations.all + afterSearchIndex

    private static let beforeSearchIndex: [any DatabaseMigration] = [
        V1CreateTablesMigration(),
        V2ParticipantCacheMigration(),
        V3UnifiedCacheMigration(),
        V4DropLegacyTablesMigration(),
        V5TranslationCacheMigration(),
        V6TusUploadCheckpointMigration(),
    ]

    private static let afterSearchIndex: [any DatabaseMigration] = [
        V7CacheEntriesItemIdIndexMigration(),
        V8CacheEntriesContentHashMigration(),
        V9CacheEntriesPositionMigration(),
        V10PurgeCanvasReencodedByV1Migration(),
    ]
}

struct V1CreateTablesMigration: DatabaseMigration {
    let identifier = "v1_create_tables"

    func migrate(_ db: Database) throws {
        try db.create(table: "conversations") { t in
            t.column("id", .text).primaryKey()
            t.column("name", .text).notNull()
            t.column("encodedData", .blob).notNull() // Temporary fallback column
            t.column("updatedAt", .datetime).notNull()
        }

        try db.create(table: "messages") { t in
            t.column("id", .text).primaryKey()
            t.column("conversationId", .text).notNull().references("conversations", onDelete: .cascade)
            t.column("createdAt", .datetime).notNull()
            t.column("encodedData", .blob).notNull() // Temporary fallback column
        }

        try db.create(index: "index_messages_on_conversationId_createdAt", on: "messages", columns: ["conversationId", "createdAt"])
    }
}

struct V2ParticipantCacheMigration: DatabaseMigration {
    let identifier = "v2_participant_cache"

    func migrate(_ db: Database) throws {
        try db.create(table: "cached_participants") { t in
            t.column("id", .text).primaryKey()
            t.column("conversationId", .text).notNull()
            t.column("userId", .text)
            t.column("username", .text)
            t.column("firstName", .text)
            t.column("lastName", .text)
            t.column("displayName", .text)
            t.column("avatar", .text)
            t.column("conversationRole", .text)
            t.column("isOnline", .boolean)
            t.column("lastActiveAt", .datetime)
            t.column("joinedAt", .datetime)
            t.column("isActive", .boolean)
            t.column("cachedAt", .datetime).notNull()
        }

        try db.create(
            index: "idx_cached_participants_conversationId",
            on: "cached_participants",
            columns: ["conversationId"]
        )

        try db.create(table: "cache_metadata") { t in
            t.column("key", .text).primaryKey()
            t.column("nextCursor", .text)
            t.column("hasMore", .boolean).notNull().defaults(to: true)
            t.column("totalCount", .integer)
            t.column("lastFetchedAt", .datetime).notNull()
        }
    }
}

struct V3UnifiedCacheMigration: DatabaseMigration {
    let identifier = "v3_unified_cache"

    func migrate(_ db: Database) throws {
        try db.drop(table: "cached_participants")
        try db.create(table: "cache_entries") { t in
            t.column("key", .text).notNull()
            t.column("itemId", .text).notNull()
            t.column("encodedData", .blob).notNull()
            t.column("updatedAt", .datetime).notNull()
            t.primaryKey(["key", "itemId"])
        }
        try db.create(index: "idx_cache_entries_key", on: "cache_entries", columns: ["key"])
    }
}

struct V4DropLegacyTablesMigration: DatabaseMigration {
    let identifier = "v4_drop_legacy_tables"

    func migrate(_ db: Database) throws {
        try db.drop(table: "conversations")
        try db.drop(table: "messages")
    }
}

struct V5TranslationCacheMigration: DatabaseMigration {
    let identifier = "v5_translation_cache"

    func migrate(_ db: Database) throws {
        try db.create(table: "translation_cache") { t in
            t.column("messageId", .text).notNull()
            t.column("targetLanguage", .text).notNull()
            t.column("encodedData", .blob).notNull()
            t.column("cachedAt", .datetime).notNull()
            t.primaryKey(["messageId", "targetLanguage"])
        }
        try db.create(index: "idx_translation_cache_messageId", on: "translation_cache", columns: ["messageId"])
    }
}

struct V6TusUploadCheckpointMigration: DatabaseMigration {
    let identifier = "v6_tus_upload_checkpoint"

    func migrate(_ db: Database) throws {
        // Per-file TUS upload checkpoints persisted across app kills so
        // a retry can PATCH from the last known offset instead of
        // re-uploading the slide from byte 0. Keyed on the SHA256 of
        // the file content (computed bytewise by `TusUploadManager`)
        // — stable across re-encodes that produce the same bytes,
        // collision-free across distinct files.
        try db.create(table: "tus_upload_checkpoint") { t in
            t.column("checkpointKey", .text).primaryKey()
            t.column("uploadURL", .text).notNull()
            t.column("byteOffset", .integer).notNull()
            t.column("fileSize", .integer).notNull()
            t.column("fileName", .text).notNull()
            t.column("mimeType", .text).notNull()
            t.column("uploadContext", .text)
            t.column("thumbHash", .text)
            t.column("createdAt", .datetime).notNull()
            t.column("updatedAt", .datetime).notNull()
        }
        try db.create(
            index: "idx_tus_upload_checkpoint_updatedAt",
            on: "tus_upload_checkpoint",
            columns: ["updatedAt"]
        )
    }
}

struct V7CacheEntriesItemIdIndexMigration: DatabaseMigration {
    let identifier = "v7_cache_entries_itemId_index"

    func migrate(_ db: Database) throws {
        try db.create(index: "idx_cache_entries_itemId", on: "cache_entries", columns: ["itemId"])
    }
}

struct V8CacheEntriesContentHashMigration: DatabaseMigration {
    let identifier = "v8_cache_entries_content_hash"

    func migrate(_ db: Database) throws {
        try db.alter(table: "cache_entries") { t in
            t.add(column: "contentHash", .text)
        }
    }
}

struct V9CacheEntriesPositionMigration: DatabaseMigration {
    let identifier = "v9_cache_entries_position"

    func migrate(_ db: Database) throws {
        try db.alter(table: "cache_entries") { t in
            t.add(column: "position", .integer)
        }
    }
}

struct V10PurgeCanvasReencodedByV1Migration: DatabaseMigration {
    let identifier = "v10_purge_canvas_reencoded_by_v1"

    func migrate(_ db: Database) throws {
        for prefix in ["feed:", "stories:"] {
            try db.execute(
                sql: "DELETE FROM cache_entries WHERE substr(key, 1, ?) = ?",
                arguments: [prefix.count, prefix]
            )
            try db.execute(
                sql: "DELETE FROM cache_metadata WHERE substr(key, 1, ?) = ?",
                arguments: [prefix.count, prefix]
            )
        }
    }
}
