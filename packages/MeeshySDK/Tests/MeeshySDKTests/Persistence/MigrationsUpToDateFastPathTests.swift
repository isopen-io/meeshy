import XCTest
import GRDB
@testable import MeeshySDK

/// `runAll` runs on the main thread at every cold start. Once the schema is
/// current it must only READ — never take the writer barrier that a write held
/// by the notification extension on the shared file would make it wait on.
/// A read-only connection proves it: any write attempt would throw.
final class MigrationsUpToDateFastPathTests: XCTestCase {

    private func makeMigratedFile() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("migrations-fast-path-\(UUID().uuidString).sqlite")
        let queue = try DatabaseQueue(path: url.path)
        try MessageDatabaseMigrations.runAll(on: queue)
        try FeedDatabaseMigrations.runAll(on: queue)
        try queue.close()
        return url
    }

    private func openReadOnly(_ url: URL) throws -> DatabaseQueue {
        var config = Configuration()
        config.readonly = true
        return try DatabaseQueue(path: url.path, configuration: config)
    }

    func test_runAll_onAnUpToDateDatabase_neverWrites() throws {
        let url = try makeMigratedFile()
        defer { try? FileManager.default.removeItem(at: url) }
        let readOnly = try openReadOnly(url)

        XCTAssertNoThrow(try MessageDatabaseMigrations.runAll(on: readOnly))
        XCTAssertNoThrow(try FeedDatabaseMigrations.runAll(on: readOnly))
    }

    func test_runAll_onAFreshDatabase_stillMigrates() throws {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        try FeedDatabaseMigrations.runAll(on: queue)

        try queue.read { db in
            XCTAssertTrue(try db.tableExists("messages"))
            XCTAssertTrue(try db.tableExists("feed_posts"))
        }
    }
}
