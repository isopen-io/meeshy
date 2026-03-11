import Foundation
import GRDB
import os

// MARK: - AppDatabase
public final class AppDatabase: @unchecked Sendable {
    public static let shared = AppDatabase()
    
    public let databaseWriter: any DatabaseWriter
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb")
    
    private init() {
        do {
            let fileManager = FileManager.default
            let appSupportDir = try fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
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
            self.databaseWriter = pool

            try Self.runMigrations(on: self.databaseWriter)
        } catch {
            fatalError("Failed to initialize GRDB: \(error)")
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

        try migrator.migrate(writer)
    }
}
