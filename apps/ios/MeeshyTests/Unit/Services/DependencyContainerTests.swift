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
}
