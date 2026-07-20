import XCTest
import GRDB
@testable import Meeshy

final class DependencyContainerTests: XCTestCase {

    /// Regression test for a Swift 6 isolation crash on `GRDB.DatabasePool.reader.1`.
    ///
    /// `DependencyContainer` is `@MainActor`-isolated for its instance state, but
    /// `dbConfig()` MUST stay `nonisolated` so that the closure passed to
    /// `Configuration.prepareDatabase { db in ... }` can be invoked from GRDB's
    /// internal reader queues without tripping `swift_task_checkIsolatedSwift`.
    ///
    /// If someone removes `nonisolated` in the future, this test will crash
    /// inside `Task.detached` when the first reader connection is opened.
    func test_dbConfig_allowsReadsFromNonMainActorContext() async throws {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("meeshy-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(
            at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let dbPath = dir.appendingPathComponent("dbconfig.sqlite").path

        let pool = try DatabasePool(
            path: dbPath,
            configuration: DependencyContainer.dbConfig()
        )

        let value = try await Task.detached {
            try await pool.read { db in
                try Int.fetchOne(db, sql: "SELECT 1") ?? 0
            }
        }.value

        XCTAssertEqual(value, 1)
    }

    /// Verifies the PRAGMAs declared in `prepareDatabase` are actually applied
    /// to reader connections.
    func test_dbConfig_appliesPragmasToReaderConnections() async throws {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("meeshy-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(
            at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let dbPath = dir.appendingPathComponent("pragmas.sqlite").path

        let pool = try DatabasePool(
            path: dbPath,
            configuration: DependencyContainer.dbConfig()
        )

        let synchronous = try await pool.read { db -> Int in
            try Int.fetchOne(db, sql: "PRAGMA synchronous") ?? -1
        }
        // PRAGMA synchronous = NORMAL maps to integer 1.
        XCTAssertEqual(synchronous, 1)
    }

    // MARK: - openWithRecovery (P1.5 — no more fatalError on DB init)

    /// Happy path: opening a valid (non-existent) DB path returns a pool
    /// without touching the recovery flow.
    @MainActor
    func test_openWithRecovery_validPath_returnsPoolWithoutRecovery() async throws {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("meeshy-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }

        var diagnostics = DatabaseInitDiagnostics()
        let pool = DependencyContainer.openWithRecovery(
            dbPath: dir.appendingPathComponent("ok.sqlite").path,
            config: DependencyContainer.dbConfig(),
            diagnostics: &diagnostics
        )

        let one = try await pool.read { db in
            try Int.fetchOne(db, sql: "SELECT 1") ?? 0
        }
        XCTAssertEqual(one, 1)
        XCTAssertFalse(diagnostics.recoveryAttempted)
        XCTAssertFalse(diagnostics.fellBackToInMemory)
        XCTAssertNil(diagnostics.firstAttemptError)
    }

    /// Corrupted SQLite file: the recovery moves it aside, opens a fresh DB
    /// at the canonical path, and surfaces the journey via diagnostics.
    @MainActor
    func test_openWithRecovery_corruptedFile_quarantinesAndRecovers() throws {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("meeshy-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }

        let dbPath = dir.appendingPathComponent("corrupt.sqlite").path
        // Junk header — SQLite rejects this with SQLITE_NOTADB / CORRUPT.
        let junk = Data("not a sqlite database at all".utf8)
        try junk.write(to: URL(fileURLWithPath: dbPath))

        var diagnostics = DatabaseInitDiagnostics()
        let pool = DependencyContainer.openWithRecovery(
            dbPath: dbPath,
            config: DependencyContainer.dbConfig(),
            diagnostics: &diagnostics
        )

        // The pool must be usable (write + read round-trip).
        try pool.write { db in
            try db.execute(sql: "CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT)")
            try db.execute(sql: "INSERT INTO probe (value) VALUES ('ok')")
        }
        let value = try pool.read { db in
            try String.fetchOne(db, sql: "SELECT value FROM probe LIMIT 1")
        }
        XCTAssertEqual(value, "ok")

        XCTAssertTrue(diagnostics.recoveryAttempted)
        XCTAssertTrue(diagnostics.recoveredFromCorruption)
        XCTAssertFalse(diagnostics.fellBackToInMemory)
        XCTAssertNotNil(diagnostics.firstAttemptError)
        XCTAssertNotNil(diagnostics.quarantinedFilePath)

        // The corrupt file should now exist under the quarantined path.
        let quarantined = try XCTUnwrap(diagnostics.quarantinedFilePath)
        XCTAssertTrue(FileManager.default.fileExists(atPath: quarantined))
        // And the canonical path should hold a fresh, opened DB.
        XCTAssertTrue(FileManager.default.fileExists(atPath: dbPath))
    }

    /// `quarantineCorruptDatabase` must also clean up sidecar `-wal` /
    /// `-shm` files; otherwise GRDB refuses to create a fresh DB at the
    /// same path because the stale WAL references a now-missing main file.
    @MainActor
    func test_quarantineCorruptDatabase_cleansWALAndSHMSidecars() throws {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("meeshy-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }

        let dbPath = dir.appendingPathComponent("withSidecars.sqlite").path
        try Data("junk".utf8).write(to: URL(fileURLWithPath: dbPath))
        try Data("walbytes".utf8).write(to: URL(fileURLWithPath: dbPath + "-wal"))
        try Data("shmbytes".utf8).write(to: URL(fileURLWithPath: dbPath + "-shm"))

        let quarantined = DependencyContainer.quarantineCorruptDatabase(
            at: dbPath,
            clock: { Date(timeIntervalSince1970: 100) }
        )

        XCTAssertEqual(quarantined, "\(dbPath).corrupted.100")
        XCTAssertFalse(FileManager.default.fileExists(atPath: dbPath))
        XCTAssertFalse(FileManager.default.fileExists(atPath: dbPath + "-wal"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: dbPath + "-shm"))
        XCTAssertTrue(FileManager.default.fileExists(atPath: quarantined!))
    }

    /// When the main DB file does not exist, `quarantineCorruptDatabase`
    /// should be a no-op for the move (no file to move) but still purge
    /// any lingering sidecar entries — a callable in a clean state.
    @MainActor
    func test_quarantineCorruptDatabase_handlesMissingMainFileGracefully() throws {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("meeshy-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }

        let dbPath = dir.appendingPathComponent("absent.sqlite").path
        // Only a stale WAL is present.
        try Data("walbytes".utf8).write(to: URL(fileURLWithPath: dbPath + "-wal"))

        let quarantined = DependencyContainer.quarantineCorruptDatabase(at: dbPath)

        XCTAssertNil(quarantined)
        XCTAssertFalse(FileManager.default.fileExists(atPath: dbPath + "-wal"))
    }

    // MARK: - databasePath (TestFlight crash 2026-06-12 — nil app-group container)

    /// Nominal path: the shared app-group container hosts `Database/`.
    @MainActor
    func test_databasePath_withGroupContainer_usesSharedDatabaseDirectory() throws {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("meeshy-tests-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }

        let path = DependencyContainer.databasePath(groupContainer: dir)

        XCTAssertEqual(
            path,
            dir.appendingPathComponent("Database")
                .appendingPathComponent("meeshy_messages.sqlite").path
        )
        var isDir: ObjCBool = false
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: dir.appendingPathComponent("Database").path,
            isDirectory: &isDir
        ))
        XCTAssertTrue(isDir.boolValue)
    }

    /// Regression: distribution-signed builds whose provisioning lost the
    /// `group.me.meeshy.apps` entitlement get `nil` from
    /// `containerURL(forSecurityApplicationGroupIdentifier:)`. The container
    /// must fall back to Application Support instead of trapping — a trap
    /// here is a launch crash-loop (TestFlight build 1125, 2026-06-12).
    @MainActor
    func test_databasePath_withoutGroupContainer_fallsBackToApplicationSupport() {
        let path = DependencyContainer.databasePath(groupContainer: nil)

        let appSupport = URL.applicationSupportDirectory
        XCTAssertEqual(
            path,
            appSupport.appendingPathComponent("Database")
                .appendingPathComponent("meeshy_messages.sqlite").path
        )
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: appSupport.appendingPathComponent("Database").path
        ))
    }

    // MARK: - N1 — busy_timeout on the shared message store

    /// The App Group message store is written by TWO processes (app +
    /// notification service extension), each holding its own `DatabasePool`.
    /// GRDB's default `busyMode` is `.immediateError`: a cross-pool write
    /// collision surfaces as `SQLITE_BUSY` instead of waiting, which the NSE
    /// swallows silently — the pre-persisted bubble is simply lost.
    /// `dbConfig()` must therefore configure a busy timeout so a concurrent
    /// writer WAITS for the lock instead of failing.
    func test_dbConfig_busyTimeout_absorbsConcurrentCrossPoolWriter() async throws {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("meeshy-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(
            at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let dbPath = dir.appendingPathComponent("busy.sqlite").path

        let appPool = try DatabasePool(
            path: dbPath, configuration: DependencyContainer.dbConfig())
        let nsePool = try DatabasePool(
            path: dbPath, configuration: DependencyContainer.dbConfig())

        try await appPool.write { db in
            try db.execute(sql: "CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, v TEXT)")
        }

        // Writer A grabs the write lock and holds it for 500 ms — long enough
        // for writer B to collide, far shorter than the 5 s busy timeout.
        let holdingWriter = Task.detached {
            try appPool.writeWithoutTransaction { db in
                try db.execute(sql: "BEGIN IMMEDIATE")
                Thread.sleep(forTimeInterval: 0.5)
                try db.execute(sql: "INSERT INTO t (v) VALUES ('a')")
                try db.execute(sql: "COMMIT")
            }
        }

        // Give writer A time to acquire the lock before B attempts its write.
        try await Task.sleep(nanoseconds: 100_000_000)

        // Without a busy timeout this throws SQLITE_BUSY. With
        // `busyMode: .timeout(5)` it waits for A's commit and succeeds.
        try await nsePool.write { db in
            try db.execute(sql: "INSERT INTO t (v) VALUES ('b')")
        }

        _ = try await holdingWriter.value

        let count = try await appPool.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM t") ?? 0
        }
        XCTAssertEqual(count, 2, "Both writers must have landed their row")
    }

    // MARK: - N2 — explicit file protection on the shared message store

    /// The NSE is woken while the device is LOCKED. The main app carries the
    /// `default-data-protection = NSFileProtectionComplete` entitlement, so a
    /// database file (re)created by the app would inherit `.complete` and the
    /// NSE could neither open nor write it until the next unlock. The path
    /// resolver must therefore pin `.completeUntilFirstUserAuthentication` on
    /// the Database directory AND on the sqlite file + WAL/SHM sidecars,
    /// mirroring `AppDatabase.resolveDatabaseURL`.
    func test_databasePath_appliesCompleteUntilFirstUserAuthenticationProtection() throws {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("meeshy-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(
            at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }

        // Pre-create the database files as a previous app run would have,
        // with no explicit protection class.
        let dbDir = dir.appendingPathComponent("Database")
        try FileManager.default.createDirectory(
            at: dbDir, withIntermediateDirectories: true)
        let sqlitePath = dbDir.appendingPathComponent("meeshy_messages.sqlite").path
        for suffix in ["", "-wal", "-shm"] {
            FileManager.default.createFile(atPath: sqlitePath + suffix, contents: Data())
        }

        let resolved = DependencyContainer.databasePath(groupContainer: dir)
        XCTAssertEqual(resolved, sqlitePath)

        var checkedPaths = [dbDir.path]
        checkedPaths += ["", "-wal", "-shm"].map { sqlitePath + $0 }
        for path in checkedPaths {
            let attributes = try FileManager.default.attributesOfItem(atPath: path)
            guard let protection = attributes[.protectionKey] as? FileProtectionType else {
                throw XCTSkip("File protection attributes are not recorded on this platform")
            }
            XCTAssertEqual(
                protection,
                .completeUntilFirstUserAuthentication,
                "\(path) must stay writable for the NSE while the device is locked"
            )
        }
    }
}
