import XCTest
import GRDB
@testable import MeeshySDK

final class FTS5MigrationTests: XCTestCase {

    func test_v6_createsMessagesFtsTable() throws {
        let db = try makeFreshDB()
        try MessageDatabaseMigrations.runAll(on: db)

        let exists = try db.read { db in
            try Bool.fetchOne(db, sql: """
                SELECT EXISTS(SELECT 1 FROM sqlite_master
                              WHERE type='table' AND name='messages_fts')
                """) ?? false
        }
        XCTAssertTrue(exists)
    }

    func test_v6_ftsTokenizer_removesAccents() throws {
        let db = try makeFreshDB()
        try MessageDatabaseMigrations.runAll(on: db)

        try db.write { db in
            try db.execute(sql: """
                INSERT INTO messages_fts(rowid, content) VALUES (1, 'Bonjour à tous')
                """)
        }

        let count = try db.read { db in
            try Int.fetchOne(db, sql: """
                SELECT count(*) FROM messages_fts WHERE content MATCH 'a tous'
                """) ?? 0
        }
        XCTAssertEqual(count, 1, "diacritics should be removed during tokenization")
    }

    func test_v6_insertTriggerSyncsFts() throws {
        let db = try makeFreshDB()
        try MessageDatabaseMigrations.runAll(on: db)

        try db.write { db in
            try MessageRecordFactory.make(localId: "m1", content: "hello world").insert(db)
        }

        let ftsCount = try db.read { db in
            try Int.fetchOne(db, sql: """
                SELECT count(*) FROM messages_fts WHERE content MATCH 'hello'
                """) ?? 0
        }
        XCTAssertEqual(ftsCount, 1)
    }

    func test_v6_deleteTriggerRemovesFromFts() throws {
        let db = try makeFreshDB()
        try MessageDatabaseMigrations.runAll(on: db)

        try db.write { db in
            try MessageRecordFactory.make(localId: "m2", content: "goodbye world").insert(db)
        }

        try db.write { db in
            try db.execute(sql: "DELETE FROM messages WHERE localId = 'm2'")
        }

        let ftsCount = try db.read { db in
            try Int.fetchOne(db, sql: """
                SELECT count(*) FROM messages_fts WHERE content MATCH 'goodbye'
                """) ?? 0
        }
        XCTAssertEqual(ftsCount, 0)
    }

    func test_v6_updateTriggerUpdatesFts() throws {
        let db = try makeFreshDB()
        try MessageDatabaseMigrations.runAll(on: db)

        try db.write { db in
            try MessageRecordFactory.make(localId: "m3", content: "original content").insert(db)
        }

        try db.write { db in
            try db.execute(sql: "UPDATE messages SET content = 'updated content' WHERE localId = 'm3'")
        }

        let oldCount = try db.read { db in
            try Int.fetchOne(db, sql: """
                SELECT count(*) FROM messages_fts WHERE content MATCH 'original'
                """) ?? 0
        }
        let newCount = try db.read { db in
            try Int.fetchOne(db, sql: """
                SELECT count(*) FROM messages_fts WHERE content MATCH 'updated'
                """) ?? 0
        }
        XCTAssertEqual(oldCount, 0, "old content should no longer match")
        XCTAssertEqual(newCount, 1, "new content should match")
    }

    // MARK: - Helpers

    private func makeFreshDB() throws -> DatabaseQueue {
        try DatabaseQueue()
    }
}
