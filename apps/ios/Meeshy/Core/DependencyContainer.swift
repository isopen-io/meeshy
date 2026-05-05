// apps/ios/Meeshy/Core/DependencyContainer.swift

import Foundation
import GRDB
import MeeshySDK

@MainActor
final class DependencyContainer {
    static let shared = DependencyContainer()

    let dbPool: DatabasePool
    let messagePersistence: MessagePersistenceActor
    let feedPersistence: FeedPersistenceActor

    private init() {
        let dbPath = Self.databasePath()
        let config = Self.dbConfig()

        do {
            let pool = try DatabasePool(path: dbPath, configuration: config)
            try MessageDatabaseMigrations.runAll(on: pool)
            try FeedDatabaseMigrations.runAll(on: pool)
            self.dbPool = pool
            let persistence = MessagePersistenceActor(dbWriter: pool)
            self.messagePersistence = persistence
            self.feedPersistence = FeedPersistenceActor(dbWriter: pool)
            // Start the actor's background write processor (must be done outside init).
            Task { await persistence.start() }
        } catch {
            fatalError("Failed to initialize database: \(error)")
        }
    }

    // MARK: - App Group shared path (O6)

    static func databasePath() -> String {
        let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.me.meeshy.apps"
        )!
        let dbDir = container.appendingPathComponent("Database")
        try? FileManager.default.createDirectory(at: dbDir, withIntermediateDirectories: true)
        return dbDir.appendingPathComponent("meeshy_messages.sqlite").path
    }

    // MARK: - Database config (O7, N7, N8)

    static func dbConfig() -> Configuration {
        var config = Configuration()
        config.maximumReaderCount = min(ProcessInfo.processInfo.activeProcessorCount * 2, 16)
        config.prepareDatabase { db in
            try db.execute(sql: "PRAGMA synchronous = NORMAL")
            try db.execute(sql: "PRAGMA journal_size_limit = 16777216")
            try db.execute(sql: "PRAGMA wal_autocheckpoint = 1000")
        }
        return config
    }
}
