import XCTest
import GRDB
@testable import MeeshySDK

final class SearchIndexMigrationTests: XCTestCase {

    func test_migration_createsConversationsFtsTable() throws {
        let db = try DatabaseQueue()
        try SearchIndexMigrations.runAll(on: db)

        let exists = try db.read { db in
            try Bool.fetchOne(db, sql: """
                SELECT EXISTS(SELECT 1 FROM sqlite_master
                              WHERE type='table' AND name='conversations_fts')
                """) ?? false
        }
        XCTAssertTrue(exists, "conversations_fts virtual table should be created")
    }

    func test_migration_createsUsersFtsTable() throws {
        let db = try DatabaseQueue()
        try SearchIndexMigrations.runAll(on: db)

        let exists = try db.read { db in
            try Bool.fetchOne(db, sql: """
                SELECT EXISTS(SELECT 1 FROM sqlite_master
                              WHERE type='table' AND name='users_fts')
                """) ?? false
        }
        XCTAssertTrue(exists, "users_fts virtual table should be created")
    }

    func test_migration_isIdempotent() throws {
        let db = try DatabaseQueue()
        try SearchIndexMigrations.runAll(on: db)
        XCTAssertNoThrow(try SearchIndexMigrations.runAll(on: db),
            "Re-running migrations on the same DB must be a no-op")
    }

    func test_conversations_tokenizer_removesAccents() throws {
        let db = try DatabaseQueue()
        try SearchIndexMigrations.runAll(on: db)

        try db.write { db in
            try db.execute(sql: """
                INSERT INTO conversations_fts(id, title, description, identifier, lastMessagePreview, participantUsername)
                VALUES ('c1', 'Hôtel des Sports', '', 'hotel', '', '')
                """)
        }

        let count = try db.read { db in
            try Int.fetchOne(db, sql: """
                SELECT count(*) FROM conversations_fts WHERE conversations_fts MATCH 'hotel'
                """) ?? 0
        }
        XCTAssertEqual(count, 1,
            "unicode61 remove_diacritics 2 should match 'Hôtel' against 'hotel'")
    }

    func test_users_tokenizer_removesAccents() throws {
        let db = try DatabaseQueue()
        try SearchIndexMigrations.runAll(on: db)

        try db.write { db in
            try db.execute(sql: """
                INSERT INTO users_fts(id, username, displayName, firstName, lastName, bio)
                VALUES ('u1', 'andre', 'André Martin', 'André', 'Martin', '')
                """)
        }

        let count = try db.read { db in
            try Int.fetchOne(db, sql: """
                SELECT count(*) FROM users_fts WHERE users_fts MATCH 'andre'
                """) ?? 0
        }
        XCTAssertEqual(count, 1,
            "unicode61 remove_diacritics 2 should match 'André' against 'andre'")
    }
}
