import XCTest
import GRDB
@testable import MeeshySDK

/// S4 — `AppDatabase` must recover from a corrupt on-disk SQLite store instead
/// of retaining a broken pool for the whole session (and across relaunches).
/// A `DatabasePool` opens lazily, so corruption surfaces at migration time; the
/// recovery path deletes the unusable file and recreates a fresh migrated store,
/// only falling back to in-memory if even that fails.
final class AppDatabaseRecoveryTests: XCTestCase {

    private func uniqueTempDBURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy_test_\(UUID().uuidString).sqlite")
    }

    private func cleanup(_ url: URL) {
        for suffix in ["", "-wal", "-shm"] {
            try? FileManager.default.removeItem(at: URL(fileURLWithPath: url.path + suffix))
        }
    }

    func test_openOrRecover_corruptFile_recreatesAndRecoversOnDisk() throws {
        let url = uniqueTempDBURL()
        defer { cleanup(url) }
        // Simulate a corrupt store: a file whose header is not a SQLite database.
        try Data("this is definitely not a valid sqlite database".utf8).write(to: url)

        let (writer, ephemeral) = AppDatabase.openOrRecover(at: url)

        XCTAssertFalse(ephemeral,
            "a corrupt on-disk file must be deleted and recreated on disk, NOT silently degrade to in-memory")
        // `cache_entries` is the unified-cache table (v3) that survives all
        // migrations — its presence proves the recreated store is fully migrated.
        let migrated = try writer.read { db in try db.tableExists("cache_entries") }
        XCTAssertTrue(migrated,
            "the recreated store must be fully migrated (the 'cache_entries' table is present)")
    }

    func test_openOrRecover_validFile_isReusedNotRecreated() throws {
        let url = uniqueTempDBURL()
        defer { cleanup(url) }

        // First open creates + migrates the store; seed a sentinel row.
        do {
            let (writer, ephemeral) = AppDatabase.openOrRecover(at: url)
            XCTAssertFalse(ephemeral)
            try writer.write { db in
                try db.execute(sql: "CREATE TABLE IF NOT EXISTS sentinel (id INTEGER)")
                try db.execute(sql: "INSERT INTO sentinel (id) VALUES (1)")
            }
        } // writer released → connections close, like an app relaunch

        // Reopening a VALID store must reuse it (no delete+recreate), so the
        // sentinel survives — guards against over-aggressive recovery wiping
        // good data.
        let (writer2, ephemeral2) = AppDatabase.openOrRecover(at: url)
        XCTAssertFalse(ephemeral2, "a valid existing store must open on-disk")
        let count = try writer2.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM sentinel") ?? -1
        }
        XCTAssertEqual(count, 1,
            "a valid store must be reused, not deleted and recreated (no data loss)")
    }

    // MARK: - In-memory fallback migration (P3 hardening)

    func test_inMemoryWriter_migrationSucceeds_returnsUsableMigratedEphemeralStore() throws {
        let (writer, ephemeral) = AppDatabase.inMemoryWriter()

        XCTAssertTrue(ephemeral)
        let migrated = try writer.read { db in try db.tableExists("cache_entries") }
        XCTAssertTrue(migrated, "the default in-memory writer must run the real migrations")
    }

    /// If the injected migration throws, the fallback must NOT crash the host
    /// app (that is the entire point of degrading to in-memory) — it still
    /// returns a usable, ephemeral writer, just without the schema applied.
    func test_inMemoryWriter_migrationThrows_stillReturnsUsableEphemeralWriterWithoutCrashing() throws {
        struct StubMigrationFailure: Error {}

        let (writer, ephemeral) = AppDatabase.inMemoryWriter { _ in
            throw StubMigrationFailure()
        }

        XCTAssertTrue(ephemeral, "must still degrade to in-memory rather than propagate the failure")
        // The queue itself stays usable even though the schema never landed —
        // proves the do/catch swallowed the throw without tearing down the writer.
        let result = try writer.read { db in try db.tableExists("cache_entries") }
        XCTAssertFalse(result, "a failed migration must not silently pretend the schema exists")
    }
}
