import XCTest
import GRDB
@testable import MeeshySDK

final class DatabaseMigrationUpgradePathTests: XCTestCase {

    private func schemaFingerprint(_ queue: DatabaseQueue) throws -> [String] {
        try queue.read { db in
            try String.fetchAll(db, sql: """
                SELECT type || '|' || name || '|' || tbl_name || '|' || COALESCE(sql, '')
                FROM sqlite_master
                WHERE name NOT LIKE 'sqlite_%' AND name != 'grdb_migrations'
                ORDER BY type, name, tbl_name
                """)
        }
    }

    private func assertEveryPrefixReachesFreshSchema(
        identifiers: [String],
        migrate: (DatabaseQueue, String?) throws -> Void,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws {
        let fresh = try DatabaseQueue()
        try migrate(fresh, nil)
        let expected = try schemaFingerprint(fresh)

        for identifier in identifiers {
            let upgraded = try DatabaseQueue()
            try migrate(upgraded, identifier)
            try migrate(upgraded, nil)
            XCTAssertEqual(try schemaFingerprint(upgraded), expected, "prefix \(identifier)", file: file, line: line)
        }
    }

    func test_appDatabase_upgradeFromEveryInstalledPrefix_reachesFreshInstallSchema() throws {
        try assertEveryPrefixReachesFreshSchema(identifiers: DatabaseMigrationTableTests.appIdentifiers) { queue, upTo in
            guard let upTo else { return try AppDatabase.runMigrations(on: queue) }
            try AppDatabase.runMigrations(on: queue, upTo: upTo)
        }
    }

    func test_messageMigrations_upgradeFromEveryInstalledPrefix_reachesFreshInstallSchema() throws {
        try assertEveryPrefixReachesFreshSchema(identifiers: DatabaseMigrationTableTests.messageIdentifiers) { queue, upTo in
            var migrator = DatabaseMigrator()
            MessageDatabaseMigrations.registerAll(in: &migrator)
            guard let upTo else { return try migrator.migrate(queue) }
            try migrator.migrate(queue, upTo: upTo)
        }
    }

    func test_feedMigrations_upgradeFromEveryInstalledPrefix_reachesFreshInstallSchema() throws {
        try assertEveryPrefixReachesFreshSchema(identifiers: DatabaseMigrationTableTests.feedIdentifiers) { queue, upTo in
            var migrator = DatabaseMigrator()
            FeedDatabaseMigrations.registerAll(in: &migrator)
            guard let upTo else { return try migrator.migrate(queue) }
            try migrator.migrate(queue, upTo: upTo)
        }
    }

    func test_searchMigrations_upgradeFromEveryInstalledPrefix_reachesFreshInstallSchema() throws {
        try assertEveryPrefixReachesFreshSchema(identifiers: DatabaseMigrationTableTests.searchIdentifiers) { queue, upTo in
            var migrator = DatabaseMigrator()
            SearchIndexMigrations.registerAll(in: &migrator)
            guard let upTo else { return try migrator.migrate(queue) }
            try migrator.migrate(queue, upTo: upTo)
        }
    }
}
