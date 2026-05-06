import XCTest
import GRDB
@testable import MeeshySDK

final class MessageTimestampPrecomputeTests: XCTestCase {

    func test_insertOptimistic_precomputesTimestampString() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)

        let actor = MessagePersistenceActor(dbWriter: pool)
        let date = ISO8601DateFormatter().date(from: "2026-05-06T14:32:00Z")!

        var record = MessageRecordFactory.make(localId: "x", content: "hi")
        record.createdAt = date

        try await actor.insertOptimistic(record)

        let stored = try pool.read { db in
            try MessageRecord.fetchOne(db, key: "x")
        }
        XCTAssertNotNil(stored?.cachedTimeString,
            "cachedTimeString must be populated on optimistic insert")
        XCTAssertFalse(stored?.cachedTimeString?.isEmpty ?? true,
            "cachedTimeString must not be empty")
    }

    func test_strftime_localtime_returnsDeviceLocalTime() throws {
        let pool = try DatabaseQueue()
        try pool.write { db in
            try db.execute(sql: "CREATE TABLE t (createdAt DATETIME)")
            let date = ISO8601DateFormatter().date(from: "2026-05-06T14:32:00Z")!
            try db.execute(
                sql: "INSERT INTO t (createdAt) VALUES (?)",
                arguments: [date]
            )
        }

        let result: String? = try pool.read { db in
            try String.fetchOne(db, sql: "SELECT strftime('%H:%M', createdAt, 'localtime') FROM t")
        }
        XCTAssertNotNil(result, "strftime must return a value")

        let expected = TimeStringCache.shared.format(
            ISO8601DateFormatter().date(from: "2026-05-06T14:32:00Z")!
        )
        XCTAssertEqual(result, expected,
            "strftime localtime must match TimeStringCache (both use device timezone)")
    }
}
