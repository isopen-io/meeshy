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
        // makeWriter opens, migrates, AND recovers from corruption internally,
        // so the writer it returns is always a fully-migrated, usable store.
        let (writer, ephemeral) = Self.makeWriter()
        self.databaseWriter = writer
        self.isEphemeral = ephemeral
    }

    /// Build a fully-migrated GRDB writer that never crashes the host app.
    /// Opens the on-disk store, runs migrations, and on an unusable file
    /// (SQLITE_CORRUPT / SQLITE_NOTADB / migration failure) deletes it and
    /// recreates once; if that still fails, falls back to an in-memory queue
    /// so the L2 cache is degraded but the app stays alive — critical when the
    /// OS wakes us for a silent push or background task and disk access
    /// transiently fails.
    private static func makeWriter() -> (any DatabaseWriter, Bool) {
        let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb")
        let databaseURL: URL
        do {
            databaseURL = try resolveDatabaseURL()
        } catch {
            logger.error("Failed to resolve on-disk DB location, using in-memory: \(error.localizedDescription, privacy: .public)")
            return inMemoryWriter()
        }
        return openOrRecover(at: databaseURL)
    }

    /// Open + migrate the store at `databaseURL`. A `DatabasePool` opens
    /// lazily, so a corrupt file only throws (SQLITE_CORRUPT / SQLITE_NOTADB)
    /// at migration time — the first real query. We run migrations HERE so
    /// corruption is caught while we can still recover, instead of leaving a
    /// broken pool in use for the whole session (and across relaunches). On
    /// failure: drop the file (+ WAL/SHM sidecars) and retry once; then
    /// in-memory. Internal for tests.
    static func openOrRecover(at databaseURL: URL) -> (any DatabaseWriter, Bool) {
        let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb")
        do {
            let pool = try openPool(at: databaseURL)
            try runMigrations(on: pool)
            return (pool, false)
        } catch {
            logger.error("On-disk DB unusable (\(error.localizedDescription, privacy: .public)); deleting and recreating")
            removeDatabaseFiles(at: databaseURL)
            do {
                let pool = try openPool(at: databaseURL)
                try runMigrations(on: pool)
                logger.info("Recovered on-disk DB by recreating the store")
                return (pool, false)
            } catch {
                logger.error("DB recreate failed (\(error.localizedDescription, privacy: .public)); using in-memory")
                return inMemoryWriter()
            }
        }
    }

    /// Resolve (and create) the on-disk SQLite URL with iOS Data Protection:
    /// the SQLite file and its directory are encrypted by the OS when the
    /// device is locked (readable after the first unlock each boot — required
    /// for background tasks and NSE — but encrypted at rest and excluded from
    /// unencrypted backups).
    private static func resolveDatabaseURL() throws -> URL {
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
        try (directoryURL as NSURL).setResourceValue(
            URLFileProtection.completeUntilFirstUserAuthentication,
            forKey: .fileProtectionKey
        )
        let databaseURL = directoryURL.appendingPathComponent("meeshy.sqlite")
        if fileManager.fileExists(atPath: databaseURL.path) {
            try (databaseURL as NSURL).setResourceValue(
                URLFileProtection.completeUntilFirstUserAuthentication,
                forKey: .fileProtectionKey
            )
        }
        return databaseURL
    }

    private static func openPool(at databaseURL: URL) throws -> DatabasePool {
        var configuration = Configuration()
        configuration.prepareDatabase { db in
            // WAL mode is GRDB default, but set it explicitly for clarity.
            // busy_timeout prevents immediate SQLITE_BUSY errors under concurrent
            // socket-event writes and UI reads (5s gives the writer time to finish).
            try db.execute(sql: "PRAGMA journal_mode = WAL")
            try db.execute(sql: "PRAGMA busy_timeout = 5000")
        }
        return try DatabasePool(path: databaseURL.path, configuration: configuration)
    }

    /// Delete the SQLite file and its WAL/SHM sidecars so a recreate starts clean.
    private static func removeDatabaseFiles(at databaseURL: URL) {
        let fileManager = FileManager.default
        for suffix in ["", "-wal", "-shm"] {
            try? fileManager.removeItem(at: URL(fileURLWithPath: databaseURL.path + suffix))
        }
    }

    private static func inMemoryWriter() -> (any DatabaseWriter, Bool) {
        // swiftlint:disable:next force_try
        let queue = try! DatabaseQueue()
        // The ephemeral DB still needs the schema so reads/writes don't throw.
        try? runMigrations(on: queue)
        return (queue, true)
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

        migrator.registerMigration("v5_translation_cache") { db in
            try db.create(table: "translation_cache") { t in
                t.column("messageId", .text).notNull()
                t.column("targetLanguage", .text).notNull()
                t.column("encodedData", .blob).notNull()
                t.column("cachedAt", .datetime).notNull()
                t.primaryKey(["messageId", "targetLanguage"])
            }
            try db.create(index: "idx_translation_cache_messageId", on: "translation_cache", columns: ["messageId"])
        }

        migrator.registerMigration("v6_tus_upload_checkpoint") { db in
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

        // FTS5 indexes for conversations + users — sit alongside cache_entries
        // so the search index lives in the same database as the data the
        // GRDBCacheStore persists. Defined in `SearchIndexMigrations`.
        SearchIndexMigrations.registerAll(in: &migrator)

        try migrator.migrate(writer)
    }
}
