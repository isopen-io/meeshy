import XCTest
import GRDB
@testable import MeeshySDK

final class DatabaseMaintenanceTests: XCTestCase {

    func test_pragmas_applied() throws {
        let pool = try makeFreshPool()
        DatabaseMaintenance.applyTuning(on: pool)

        try pool.read { db in
            let cacheSize = try Int.fetchOne(db, sql: "PRAGMA cache_size") ?? 0
            // cache_size can be returned as positive (pages) or negative (KB).
            // 8000 pages OR -32000 KB are both acceptable.
            XCTAssertTrue(abs(cacheSize) >= 8000 || abs(cacheSize) >= 32000,
                "cache_size should be at least 8000 pages or 32MB")

            let autoVacuum = try Int.fetchOne(db, sql: "PRAGMA auto_vacuum") ?? 0
            // auto_vacuum: 0=NONE, 1=FULL, 2=INCREMENTAL
            XCTAssertEqual(autoVacuum, 2, "auto_vacuum must be INCREMENTAL")

            let mmap = try Int.fetchOne(db, sql: "PRAGMA mmap_size") ?? 0
            XCTAssertGreaterThanOrEqual(mmap, 67108864, "mmap_size must be >= 64MB")
        }
    }

    func test_incrementalVacuum_runsOnDemand() throws {
        let pool = try makeFreshPool()
        DatabaseMaintenance.applyTuning(on: pool)

        try pool.write { db in
            try db.execute(sql: "CREATE TABLE t (x BLOB)")
            for _ in 0..<100 {
                try db.execute(sql: "INSERT INTO t VALUES (zeroblob(1024))")
            }
            try db.execute(sql: "DELETE FROM t")
        }

        XCTAssertNoThrow(try DatabaseMaintenance.runIncrementalVacuum(on: pool, pages: 10))
    }

    func test_runOptimize_succeeds() throws {
        let pool = try makeFreshPool()
        DatabaseMaintenance.applyTuning(on: pool)
        XCTAssertNoThrow(try DatabaseMaintenance.runOptimize(on: pool))
    }

    private func makeFreshPool() throws -> DatabaseQueue {
        let path = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("test_maint_\(UUID().uuidString).sqlite").path
        return try DatabaseQueue(path: path)
    }
}
