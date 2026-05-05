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
}
