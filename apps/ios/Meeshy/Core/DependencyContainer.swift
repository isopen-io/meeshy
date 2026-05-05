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
    let retryEngine: RetryEngine
    let thumbnailPrefetcher: ThumbnailPrefetcher
    let mediaSnapshotStore: MediaSnapshotStore

    private init() {
        let dbPath = Self.databasePath()
        let config = Self.dbConfig()

        do {
            let pool = try DatabasePool(path: dbPath, configuration: config)
            try MessageDatabaseMigrations.runAll(on: pool)
            try FeedDatabaseMigrations.runAll(on: pool)
            self.dbPool = pool
            self.messagePersistence = MessagePersistenceActor(dbWriter: pool)
            self.feedPersistence = FeedPersistenceActor(dbWriter: pool)
            self.thumbnailPrefetcher = ThumbnailPrefetcher.shared
            self.mediaSnapshotStore = MediaSnapshotStore.shared
            self.retryEngine = RetryEngine(
                persistence: messagePersistence,
                dbWriter: pool,
                sender: MessageRESTSender()
            )
        } catch {
            fatalError("Failed to initialize database: \(error)")
        }

        Task { await retryEngine.start() }
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

// MARK: - Stub REST sender (TODO: wire to actual REST API)

private struct MessageRESTSender: MessageSending {
    func send(
        conversationId: String,
        content: String?,
        contentType: String,
        encryptedPayload: Data?,
        attachments: Data?
    ) async throws -> SendMessageResponse {
        throw NSError(domain: "NotImplemented", code: 0,
                      userInfo: [NSLocalizedDescriptionKey: "MessageRESTSender not yet wired"])
    }
}
