import Foundation
import GRDB
import os

private nonisolated let recoveryLogger = MeeshyLog.logger(.dependencyContainer)
private nonisolated let migrationLogger = MeeshyLog.logger(.messageStoreSession)

/// Diagnostic record of how a message store file came up.
///
/// Opening never crashes the app: corrupted SQLite files are quarantined and recreated, inaccessible paths fall
/// back to the secondary directory (entitlement-less builds: the app-group container resolves but the sandbox
/// denies access, seen on iOS-on-Mac), and as a last resort a unique temp-file pool is used so the user lands in
/// the app in degraded mode instead of a crash loop. The host surfaces the non-empty case to the user and to
/// Crashlytics.
public struct DatabaseInitDiagnostics: Sendable, Equatable {
    public var firstAttemptError: String?
    public var recoveryAttempted: Bool = false
    public var quarantinedFilePath: String?
    public var fellBackToSecondaryPath: Bool = false
    public var fellBackToEphemeralStorage: Bool = false

    public init() {}
}

/// One account's message store file, opened — the only place the app and the notification extension touch GRDB
/// to open it. Both processes open the SAME App Group file: the app with message + feed migrations and recovery,
/// the extension with message migrations only (`MessageStoreDatabaseTests` proves either order keeps the schema
/// each one writes).
public final class MessageStoreDatabase: Sendable {
    public let pool: DatabasePool
    public let diagnostics: DatabaseInitDiagnostics

    public var path: String { pool.path }

    public init(pool: DatabasePool, diagnostics: DatabaseInitDiagnostics = DatabaseInitDiagnostics()) {
        self.pool = pool
        self.diagnostics = diagnostics
    }

    /// The app's open: recovery tiers, then message and feed migrations. A migration failure is recorded in the
    /// diagnostics, never thrown — the user still lands in the app.
    public static func open(
        path: String,
        fallbackPath: String? = nil,
        fileManager: FileManager = .default
    ) -> MessageStoreDatabase {
        var diagnostics = DatabaseInitDiagnostics()
        let pool = openWithRecovery(
            dbPath: path, fallbackPath: fallbackPath, config: configuration(),
            fileManager: fileManager, diagnostics: &diagnostics
        )
        do {
            try MessageDatabaseMigrations.runAll(on: pool)
            try FeedDatabaseMigrations.runAll(on: pool)
        } catch {
            migrationLogger.fault("Message store migrations failed: \(error.localizedDescription, privacy: .public)")
            diagnostics.firstAttemptError = (diagnostics.firstAttemptError ?? "") + " | migrations: \(error.localizedDescription)"
        }
        return MessageStoreDatabase(pool: pool, diagnostics: diagnostics)
    }

    /// The notification extension's open: no recovery (the extension never quarantines the user's file) and the
    /// message migrations only. The main app holds its own pool on this same file, and GRDB's default
    /// `.immediateError` busy mode would turn a cross-process write collision into an SQLITE_BUSY.
    public static func openForNotificationExtension(path: String) throws -> MessageStoreDatabase {
        var config = Configuration()
        config.busyMode = .timeout(5)
        let pool = try DatabasePool(path: path, configuration: config)
        try MessageDatabaseMigrations.runAll(on: pool)
        return MessageStoreDatabase(pool: pool)
    }

    /// Inserts `record` unless a row already holds its `localId`: a placeholder never replaces a canonical row
    /// (an UPSERT would rewrite every column of it). Returns whether the row was written.
    @discardableResult
    public func insertIfAbsent(_ record: MessageRecord) throws -> Bool {
        try pool.write { db in
            guard try MessageRecord.fetchOne(db, key: record.localId) == nil else { return false }
            try record.insert(db)
            return true
        }
    }
}

// MARK: - Configuration

extension MessageStoreDatabase {

    /// The app's pool configuration. `nonisolated` so the `prepareDatabase` closure runs on GRDB's reader queues
    /// without tripping an isolation check.
    public nonisolated static func configuration() -> Configuration {
        var config = Configuration()
        config.maximumReaderCount = min(ProcessInfo.processInfo.activeProcessorCount * 2, 16)
        // The NSE opens its own pool on the same App Group file: a 5 s timeout absorbs the contention (the NSE's
        // writes are sub-millisecond, the app's are batched).
        config.busyMode = .timeout(5)
        // `observesSuspensionNotifications` is set PER POOL: this one, written on every received message even
        // during the background transition, must learn of the suspension too, or `0xDEAD10CC` comes back.
        DatabaseSuspension.arm(&config)
        config.prepareDatabase { db in
            try db.execute(sql: "PRAGMA synchronous = NORMAL")
            try db.execute(sql: "PRAGMA journal_size_limit = 16777216")
            try db.execute(sql: "PRAGMA wal_autocheckpoint = 1000")
            // Connection-level tuning (`cache_size`, `mmap_size`, `temp_store`) reaches EVERY connection here,
            // readers included, and without a write transaction at launch.
            try DatabaseMaintenance.prepareTuning(db)
        }
        return config
    }
}

// MARK: - Recovery

extension MessageStoreDatabase {

    /// Opens the on-disk database with one-shot recovery: a corruption-shaped failure quarantines the file (with
    /// its WAL/SHM siblings) and reopens a fresh one at the same path. Access-denied errors skip the quarantine —
    /// an unreadable file is not a corrupt one. When the primary path is unusable, `fallbackPath` gets the same
    /// treatment; the last resort is a unique temp-file pool — never `:memory:`, which a `DatabasePool` cannot
    /// honor (WAL requires a real file).
    public nonisolated static func openWithRecovery(
        dbPath: String,
        fallbackPath: @autoclosure () -> String? = nil,
        config: Configuration,
        fileManager: FileManager = .default,
        clock: () -> Date = Date.init,
        diagnostics: inout DatabaseInitDiagnostics
    ) -> DatabasePool {
        do {
            return try DatabasePool(path: dbPath, configuration: config)
        } catch {
            recoveryLogger.fault("Database open failed at \(dbPath, privacy: .public): \(error.localizedDescription, privacy: .public) — attempting recovery")
            diagnostics.firstAttemptError = error.localizedDescription
            if let pool = reopenReplacingCorruptFile(
                at: dbPath, after: error, config: config,
                fileManager: fileManager, clock: clock, diagnostics: &diagnostics
            ) {
                return pool
            }
        }
        if let secondary = fallbackPath(), secondary != dbPath,
           let pool = openFallback(at: secondary, config: config, fileManager: fileManager, clock: clock,
                                   diagnostics: &diagnostics) {
            return pool
        }
        return openEphemeral(config: config, fileManager: fileManager, diagnostics: &diagnostics)
    }

    private nonisolated static func openFallback(
        at secondary: String,
        config: Configuration,
        fileManager: FileManager,
        clock: () -> Date,
        diagnostics: inout DatabaseInitDiagnostics
    ) -> DatabasePool? {
        diagnostics.fellBackToSecondaryPath = true
        do {
            let pool = try DatabasePool(path: secondary, configuration: config)
            recoveryLogger.info("Database opened at fallback path \(secondary, privacy: .public)")
            return pool
        } catch {
            recoveryLogger.fault("Fallback database open failed at \(secondary, privacy: .public): \(error.localizedDescription, privacy: .public)")
            diagnostics.firstAttemptError = (diagnostics.firstAttemptError ?? "") + " | fallback: \(error.localizedDescription)"
            return reopenReplacingCorruptFile(
                at: secondary, after: error, config: config,
                fileManager: fileManager, clock: clock, diagnostics: &diagnostics
            )
        }
    }

    private nonisolated static func openEphemeral(
        config: Configuration,
        fileManager: FileManager,
        diagnostics: inout DatabaseInitDiagnostics
    ) -> DatabasePool {
        diagnostics.fellBackToEphemeralStorage = true
        let ephemeralPath = fileManager.temporaryDirectory
            .appendingPathComponent("meeshy_messages_ephemeral_\(UUID().uuidString).sqlite")
            .path
        recoveryLogger.fault("All database paths unusable — falling back to an ephemeral pool at \(ephemeralPath, privacy: .public)")
        do {
            return try DatabasePool(path: ephemeralPath, configuration: config)
        } catch {
            recoveryLogger.fault("Ephemeral DatabasePool init failed: \(error.localizedDescription, privacy: .public)")
            preconditionFailure("Ephemeral DatabasePool unavailable: \(error)")
        }
    }

    /// Quarantine-then-reopen, reserved for corruption-shaped failures. Returns `nil` when the error is
    /// access-shaped or suspension-shaped (an interruption is not a corruption, and quarantining would cost the
    /// user's message store), or when the fresh open still fails.
    public nonisolated static func reopenReplacingCorruptFile(
        at path: String,
        after error: Error,
        config: Configuration,
        fileManager: FileManager,
        clock: () -> Date,
        diagnostics: inout DatabaseInitDiagnostics
    ) -> DatabasePool? {
        guard !isAccessDenied(error) else {
            recoveryLogger.fault("Access denied at \(path, privacy: .public) — leaving the file untouched (unreadable ≠ corrupt)")
            return nil
        }
        guard !DatabaseSuspension.isSuspensionInterruption(error) else {
            recoveryLogger.fault("Database open interrupted by suspension at \(path, privacy: .public) — leaving the file untouched (interrupted ≠ corrupt)")
            return nil
        }
        diagnostics.recoveryAttempted = true
        diagnostics.quarantinedFilePath = quarantineCorruptDatabase(at: path, fileManager: fileManager, clock: clock)
        do {
            let pool = try DatabasePool(path: path, configuration: config)
            recoveryLogger.info("Database recovered with a fresh file at \(path, privacy: .public)")
            return pool
        } catch {
            recoveryLogger.fault("Database recovery failed at \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
            diagnostics.firstAttemptError = (diagnostics.firstAttemptError ?? "") + " | recovery: \(error.localizedDescription)"
            return nil
        }
    }

    private nonisolated static func isAccessDenied(_ error: Error) -> Bool {
        guard let dbError = error as? DatabaseError else { return false }
        let code = dbError.resultCode
        return code == .SQLITE_AUTH
            || code == .SQLITE_PERM
            || code == .SQLITE_CANTOPEN
            || code == .SQLITE_READONLY
    }

    /// Moves the suspected-corrupt SQLite file out of the way (deleting it when the move fails) and removes its
    /// WAL / SHM siblings, which reference a now-missing main file and carry nothing recoverable. Returns the new
    /// location of the quarantined main file, or `nil` when there was none or the move failed.
    @discardableResult
    public nonisolated static func quarantineCorruptDatabase(
        at path: String,
        fileManager: FileManager = .default,
        clock: () -> Date = Date.init
    ) -> String? {
        let quarantined = "\(path).corrupted.\(Int(clock().timeIntervalSince1970))"
        let mainExists = fileManager.fileExists(atPath: path)
        if mainExists {
            do {
                try fileManager.moveItem(atPath: path, toPath: quarantined)
            } catch {
                recoveryLogger.error("Failed to quarantine corrupt DB: \(error.localizedDescription, privacy: .public) — deleting instead")
                removeIfPresent(path, label: "corrupt DB", fileManager: fileManager)
            }
        }
        removeIfPresent(path + "-wal", label: "WAL file", fileManager: fileManager)
        removeIfPresent(path + "-shm", label: "SHM file", fileManager: fileManager)
        return (mainExists && fileManager.fileExists(atPath: quarantined)) ? quarantined : nil
    }

    private nonisolated static func removeIfPresent(_ path: String, label: String, fileManager: FileManager) {
        guard fileManager.fileExists(atPath: path) else { return }
        do {
            try fileManager.removeItem(atPath: path)
        } catch {
            recoveryLogger.error("Failed to remove \(label, privacy: .public) at \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }
}
