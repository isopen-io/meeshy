import Foundation
import GRDB
import os

// MARK: - AppDatabase
public final class AppDatabase: @unchecked Sendable {
    public static let shared = AppDatabase()

    public let databaseWriter: any DatabaseWriter
    /// `true` when the on-disk SQLite store could not be opened and we fell
    /// back to an in-memory queue. Callers that persist long-term data can
    /// decide to skip writes or surface a warning to the user.
    public let isEphemeral: Bool
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb")

    private init() {
        let (writer, ephemeral) = Self.makeWriter()
        self.databaseWriter = writer
        self.isEphemeral = ephemeral

        do {
            try Self.runMigrations(on: writer)
        } catch {
            Logger(subsystem: "com.meeshy.sdk", category: "grdb")
                .error("Migration failed, continuing with ephemeral writer: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Build a GRDB writer that never crashes the host app. On failure we log
    /// and fall back to an in-memory queue so the L2 cache is degraded but
    /// the app stays alive — critical when the OS wakes us for a silent push
    /// or background task and disk access transiently fails.
    private static func makeWriter() -> (any DatabaseWriter, Bool) {
        let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb")
        do {
            let fileManager = FileManager.default
            let appSupportDir = try fileManager.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            let directoryURL = appSupportDir.appendingPathComponent("Database", isDirectory: true)

            if !fileManager.fileExists(atPath: directoryURL.path) {
                try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
            }

            let databaseURL = directoryURL.appendingPathComponent("meeshy.sqlite")

            var configuration = Configuration()
            configuration.prepareDatabase { db in
                db.trace { _ in }
            }

            let pool = try DatabasePool(path: databaseURL.path, configuration: configuration)
            return (pool, false)
        } catch {
            logger.error("Failed to open on-disk GRDB, falling back to in-memory: \(error.localizedDescription, privacy: .public)")
            // In-memory DatabaseQueue() is trivially constructible; the only
            // realistic failure would be a hard OOM which the OS handles.
            let queue = try! DatabaseQueue()  // swiftlint:disable:this force_try
            return (queue, true)
        }
    }

    static func runMigrations(on writer: any DatabaseWriter) throws {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1_create_tables") { db in
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

        migrator.registerMigration("v2_participant_cache") { db in
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

        migrator.registerMigration("v3_unified_cache") { db in
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

        migrator.registerMigration("v4_drop_legacy_tables") { db in
            try db.drop(table: "conversations")
            try db.drop(table: "messages")
        }

        try migrator.migrate(writer)
    }
}
