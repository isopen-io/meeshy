// apps/ios/Meeshy/Core/DependencyContainer.swift

import Foundation
import GRDB
import MeeshySDK
import os

private let containerLogger = Logger(subsystem: "me.meeshy.app", category: "dependency-container")

/// Diagnostic record produced by ``DependencyContainer`` boot.
///
/// The container no longer crashes the app when the on-disk database
/// cannot be opened — corrupted SQLite files are quarantined, an empty
/// database is recreated, and as a last resort an in-memory pool is
/// used so the user lands in the app (in degraded mode) instead of a
/// crash loop. This struct records what happened so the host app can
/// surface the issue to the user and to Crashlytics.
struct DatabaseInitDiagnostics: Sendable, Equatable {
    var firstAttemptError: String?
    var recoveryAttempted: Bool = false
    var recoveredFromCorruption: Bool = false
    var quarantinedFilePath: String?
    var fellBackToInMemory: Bool = false
}

@MainActor
final class DependencyContainer {
    static let shared = DependencyContainer()

    let dbPool: DatabasePool
    let messagePersistence: MessagePersistenceActor
    let feedPersistence: FeedPersistenceActor
    let retryEngine: RetryEngine
    let thumbnailPrefetcher: ThumbnailPrefetcher
    let mediaSnapshotStore: MediaSnapshotStore

    /// Snapshot of how the database came up. Surfaced to ``AppDelegate``
    /// (which forwards the non-empty case to Crashlytics) and to the
    /// RecoveryView when ``fellBackToInMemory`` is true.
    let initDiagnostics: DatabaseInitDiagnostics

    private init() {
        let dbPath = Self.databasePath()
        let config = Self.dbConfig()

        var diagnostics = DatabaseInitDiagnostics()
        let pool = Self.openWithRecovery(
            dbPath: dbPath,
            config: config,
            diagnostics: &diagnostics
        )

        // Migrations + tuning. If these fail on the recovered DB, we surface
        // the diagnostic but still proceed — the alternative is crashing the
        // user into a boot loop they can't escape from.
        do {
            try MessageDatabaseMigrations.runAll(on: pool)
            try FeedDatabaseMigrations.runAll(on: pool)
            DatabaseMaintenance.applyTuning(on: pool)
        } catch {
            containerLogger.fault("Database migrations failed after recovery: \(error.localizedDescription, privacy: .public)")
            diagnostics.firstAttemptError = (diagnostics.firstAttemptError ?? "") + " | migrations: \(error.localizedDescription)"
        }

        self.dbPool = pool
        let persistence = MessagePersistenceActor(dbWriter: pool)
        self.messagePersistence = persistence
        self.feedPersistence = FeedPersistenceActor(dbWriter: pool)
        self.thumbnailPrefetcher = ThumbnailPrefetcher.shared
        self.mediaSnapshotStore = MediaSnapshotStore.shared
        self.retryEngine = RetryEngine(
            persistence: messagePersistence,
            dbWriter: pool,
            sender: MessageRESTSender()
        )
        self.initDiagnostics = diagnostics

        Task {
            await messagePersistence.start()
            await retryEngine.start()
        }

        // Skip the auto-vacuum tune when we're on the in-memory fallback —
        // there's no on-disk file to vacuum and the next launch will retry
        // against the real path anyway.
        let autoVacuumKey = "meeshy.db.autoVacuumOneShotDone"
        if !diagnostics.fellBackToInMemory,
           !UserDefaults.standard.bool(forKey: autoVacuumKey) {
            let pool = self.dbPool
            Task.detached(priority: .background) {
                try? DatabaseMaintenance.enableIncrementalAutoVacuumOneShot(on: pool)
                await MainActor.run {
                    UserDefaults.standard.set(true, forKey: autoVacuumKey)
                }
            }
        }
    }

    // MARK: - Recovery (P1.5 — no more fatalError on DB init)

    /// Open the on-disk database with one-shot recovery: if the first
    /// `DatabasePool(path:)` throws (typically `SQLITE_CORRUPT`), the
    /// offending file is moved aside with its WAL/SHM siblings, then a
    /// fresh database is opened at the same path. Only when even that
    /// fails do we fall back to an in-memory pool so the user lands in
    /// the app instead of into a crash loop.
    ///
    /// Internal access for ``DependencyContainerRecoveryTests`` to drive
    /// the corrupted-file path against tmp directories.
    static func openWithRecovery(
        dbPath: String,
        config: Configuration,
        fileManager: FileManager = .default,
        clock: () -> Date = Date.init,
        diagnostics: inout DatabaseInitDiagnostics
    ) -> DatabasePool {
        do {
            return try DatabasePool(path: dbPath, configuration: config)
        } catch {
            containerLogger.fault("Database open failed at \(dbPath, privacy: .public): \(error.localizedDescription, privacy: .public) — attempting recovery")
            diagnostics.firstAttemptError = error.localizedDescription
            diagnostics.recoveryAttempted = true

            let quarantined = quarantineCorruptDatabase(
                at: dbPath,
                fileManager: fileManager,
                clock: clock
            )
            diagnostics.quarantinedFilePath = quarantined

            do {
                let pool = try DatabasePool(path: dbPath, configuration: config)
                diagnostics.recoveredFromCorruption = true
                containerLogger.info("Database recovered with a fresh file at \(dbPath, privacy: .public)")
                return pool
            } catch {
                containerLogger.fault("Database recovery failed at \(dbPath, privacy: .public): \(error.localizedDescription, privacy: .public) — falling back to in-memory pool")
                diagnostics.firstAttemptError = (diagnostics.firstAttemptError ?? "") + " | recovery: \(error.localizedDescription)"
                diagnostics.fellBackToInMemory = true
                // `:memory:` cannot fail under normal operation — DatabasePool
                // does not throw for ephemeral in-process storage. If it
                // somehow does, the runtime is so broken that no recovery
                // makes sense; surface a meaningful crash carrying the real
                // GRDB error rather than the original opaque
                // "Failed to initialize database" message.
                do {
                    return try DatabasePool(path: ":memory:", configuration: config)
                } catch {
                    containerLogger.fault("In-memory DatabasePool init failed: \(error.localizedDescription, privacy: .public)")
                    preconditionFailure("In-memory DatabasePool unavailable: \(error)")
                }
            }
        }
    }

    /// Move the suspected-corrupt SQLite file (plus its WAL / SHM siblings)
    /// out of the way so a fresh one can be created at the canonical path.
    /// Returns the new location of the quarantined main file, or `nil` when
    /// the move failed (in which case we delete instead).
    static func quarantineCorruptDatabase(
        at path: String,
        fileManager: FileManager = .default,
        clock: () -> Date = Date.init
    ) -> String? {
        let timestamp = Int(clock().timeIntervalSince1970)
        let quarantined = "\(path).corrupted.\(timestamp)"

        let mainExists = fileManager.fileExists(atPath: path)
        if mainExists {
            do {
                try fileManager.moveItem(atPath: path, toPath: quarantined)
            } catch {
                containerLogger.error("Failed to quarantine corrupt DB: \(error.localizedDescription, privacy: .public) — deleting instead")
                try? fileManager.removeItem(atPath: path)
            }
        }
        // The WAL and SHM siblings reference a now-missing main file and
        // would prevent GRDB from creating a fresh database. They never
        // carry data we can recover separately, so they're safe to remove.
        try? fileManager.removeItem(atPath: path + "-wal")
        try? fileManager.removeItem(atPath: path + "-shm")

        return (mainExists && fileManager.fileExists(atPath: quarantined)) ? quarantined : nil
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

    nonisolated static func dbConfig() -> Configuration {
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
