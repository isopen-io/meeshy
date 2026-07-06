// apps/ios/Meeshy/Core/DependencyContainer.swift

import Foundation
import Combine
import GRDB
import MeeshySDK
import os

private nonisolated let containerLogger = Logger(subsystem: "me.meeshy.app", category: "dependency-container")

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
    let thumbnailPrefetcher: ThumbnailPrefetcher
    let mediaSnapshotStore: MediaSnapshotStore

    /// Q3 (P1 hotfix) — Combine subscriptions tenues par le container.
    /// Aujourd'hui : un seul abonnement sur `AuthManager.isAuthenticated` pour
    /// le hook outbox logout (cf. `wireOutboxLogoutHook`).
    private var cancellables = Set<AnyCancellable>()

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
        self.initDiagnostics = diagnostics

        Task {
            await messagePersistence.start()
        }

        // Q3 (P1 hotfix) — au logout, purge TOUTES les tables messages
        // on-device. Sans ça, des messages enqueued par user A pourraient
        // être envoyés sous l'identité du user B après un logout+login rapide
        // sur le même device. Hook côté app car le SDK AuthManager ne connaît
        // pas DependencyContainer (qui est app-side).
        wireOutboxLogoutHook()
        wireCurrentUserHook()

        // Mirror every API message the SyncEngine sees (global `message:new`
        // relay, push-driven `ensureMessages`, pagination) into the GRDB
        // message store. The engine only maintains CacheCoordinator (list
        // previews); the conversation timeline reads GRDB — without this hook
        // a message received while its conversation is closed shows in the
        // list preview but is missing when the conversation opens.
        ConversationSyncEngine.shared.apiMessagePersistor = { [weak persistence] messages in
            guard !messages.isEmpty else { return }
            await persistence?.bufferIncomingAPIMessages(messages)
        }

        // Skip the auto-vacuum tune when we're on the in-memory fallback —
        // there's no on-disk file to vacuum and the next launch will retry
        // against the real path anyway.
        let autoVacuumKey = "meeshy.db.autoVacuumOneShotDone"
        if !diagnostics.fellBackToInMemory,
           !UserDefaults.standard.bool(forKey: autoVacuumKey) {
            let pool = self.dbPool
            Task.detached(priority: .background) {
                do {
                    try DatabaseMaintenance.enableIncrementalAutoVacuumOneShot(on: pool)
                } catch {
                    containerLogger.error("Failed to enable incremental auto-vacuum: \(error.localizedDescription, privacy: .public)")
                }
                await MainActor.run {
                    UserDefaults.standard.set(true, forKey: autoVacuumKey)
                }
            }
        }
    }

    // MARK: - Q3 — Outbox session quiesce hook

    /// Pattern calqué sur `ConversationAudioCoordinator.wireAuthLogoutHook` :
    /// observe la transition `isAuthenticated true→false` et purge TOUTES les
    /// tables messages on-device (outbox + `messages` autoritaire +
    /// translations/transcriptions/audio/attachments/pending_ids via
    /// `clearAllMessagesForLogout`). Sans la purge de `messages`, user B verrait
    /// le contenu de user A au prochain login (table non namespacée par userId,
    /// lue par `MessageStore.loadInitialSnapshot`).
    private func wireOutboxLogoutHook() {
        let persistence = messagePersistence
        AuthManager.shared.$isAuthenticated
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { _ in
                Task {
                    do {
                        try await persistence.clearAllMessagesForLogout()
                    } catch {
                        containerLogger.error("Q3 logout message purge failed: \(error.localizedDescription, privacy: .public)")
                    }
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Current-user hook (T7 — reaction ownership)

    /// Keep the persistence actor's `currentUserId` in sync with the
    /// authenticated user. The on-device DB has no userId column and the
    /// aggregated reaction payload only flags WHICH emojis the current user
    /// reacted with, so the actor needs to know who "the current user" is to
    /// tag their reconstructed reactions with the right owner (otherwise the
    /// "I reacted" highlight is lost after a cache reload). `$currentUser`
    /// replays its current value on subscription, so this both seeds and keeps
    /// the value current across login / account switch / logout (nil).
    private func wireCurrentUserHook() {
        let persistence = messagePersistence
        AuthManager.shared.$currentUser
            .map { $0?.id }
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { userId in
                Task { await persistence.setCurrentUserId(userId) }
            }
            .store(in: &cancellables)
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
                do {
                    try fileManager.removeItem(atPath: path)
                } catch {
                    containerLogger.error("Failed to delete corrupt DB at \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }
        // The WAL and SHM siblings reference a now-missing main file and
        // would prevent GRDB from creating a fresh database. They never
        // carry data we can recover separately, so they're safe to remove.
        do { try fileManager.removeItem(atPath: path + "-wal") } catch {
            containerLogger.error("Failed to remove WAL file at \(path, privacy: .public)-wal: \(error.localizedDescription, privacy: .public)")
        }
        do { try fileManager.removeItem(atPath: path + "-shm") } catch {
            containerLogger.error("Failed to remove SHM file at \(path, privacy: .public)-shm: \(error.localizedDescription, privacy: .public)")
        }

        return (mainExists && fileManager.fileExists(atPath: quarantined)) ? quarantined : nil
    }

    // MARK: - App Group shared path (O6)

    static func databasePath() -> String {
        databasePath(
            groupContainer: FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: "group.me.meeshy.apps"
            )
        )
    }

    /// `groupContainer` is `nil` when the signed binary lost the app-group
    /// entitlement (seen on Xcode Cloud distribution-signed TestFlight
    /// builds — launch crash-loop of build 1125, 2026-06-12). Trapping here
    /// boot-loops the app on EVERY launch; falling back to Application
    /// Support keeps the user in the app, merely without NSE/widget data
    /// sharing until the signing issue is fixed.
    static func databasePath(groupContainer: URL?) -> String {
        if groupContainer == nil {
            containerLogger.fault("App-group container unavailable (missing entitlement?) — falling back to Application Support for the message store")
        }
        let base = groupContainer ?? URL.applicationSupportDirectory
        let dbDir = base.appendingPathComponent("Database")
        do {
            try FileManager.default.createDirectory(at: dbDir, withIntermediateDirectories: true)
        } catch {
            containerLogger.error("Failed to create database directory at \(dbDir.path, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
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

