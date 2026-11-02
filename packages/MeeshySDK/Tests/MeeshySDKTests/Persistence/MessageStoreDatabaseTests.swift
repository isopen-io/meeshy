import XCTest
import GRDB
@testable import MeeshySDK

/// The message store file is opened by TWO processes: the app (`open`, message + feed migrations, recovery) and the
/// notification extension (`openForNotificationExtension`, message migrations only). Whatever order they take, each
/// must find the schema it writes, and neither may undo what the other did.
final class MessageStoreDatabaseTests: XCTestCase {

    private func makeDirectory() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("message-store-db-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return dir
    }

    private func hasCompletedAllMigrations(_ database: MessageStoreDatabase) throws -> Bool {
        var migrator = DatabaseMigrator()
        MessageDatabaseMigrations.registerAll(in: &migrator)
        var feed = DatabaseMigrator()
        FeedDatabaseMigrations.registerAll(in: &feed)
        return try database.pool.read { db in
            try migrator.hasCompletedMigrations(db) && feed.hasCompletedMigrations(db)
        }
    }

    func test_open_freshFile_runsMessageAndFeedMigrationsWithoutRecovery() throws {
        let path = try makeDirectory().appendingPathComponent("a.sqlite").path

        let database = MessageStoreDatabase.open(path: path)

        XCTAssertEqual(database.path, path)
        XCTAssertEqual(database.diagnostics, DatabaseInitDiagnostics())
        XCTAssertTrue(try hasCompletedAllMigrations(database))
    }

    func test_extensionThenApp_placeholderSurvivesAndAppCompletesItsSchema() throws {
        let path = try makeDirectory().appendingPathComponent("b.sqlite").path
        let placeholder = MessageRecordFactory.make(localId: "m_push", state: .delivered)

        let extensionStore = try MessageStoreDatabase.openForNotificationExtension(path: path)
        XCTAssertTrue(try extensionStore.insertIfAbsent(placeholder))
        let appStore = MessageStoreDatabase.open(path: path)

        XCTAssertTrue(try hasCompletedAllMigrations(appStore))
        let stored = try appStore.pool.read { db in try MessageRecord.fetchOne(db, key: "m_push") }
        XCTAssertEqual(stored?.content, placeholder.content)
    }

    func test_appThenExtension_extensionWritesOnTheAppSchema() throws {
        let path = try makeDirectory().appendingPathComponent("c.sqlite").path
        let appStore = MessageStoreDatabase.open(path: path)

        let extensionStore = try MessageStoreDatabase.openForNotificationExtension(path: path)

        XCTAssertTrue(try extensionStore.insertIfAbsent(MessageRecordFactory.make(localId: "m_push")))
        XCTAssertEqual(try appStore.pool.read { db in try MessageRecord.fetchCount(db) }, 1)
        XCTAssertTrue(try hasCompletedAllMigrations(appStore))
    }

    func test_insertIfAbsent_neverOverwritesTheCanonicalRow() throws {
        let path = try makeDirectory().appendingPathComponent("d.sqlite").path
        let appStore = MessageStoreDatabase.open(path: path)
        try appStore.pool.write { db in
            try MessageRecordFactory.make(localId: "m1", content: "canonical", state: .sent).insert(db)
        }
        let extensionStore = try MessageStoreDatabase.openForNotificationExtension(path: path)

        let inserted = try extensionStore.insertIfAbsent(MessageRecordFactory.make(localId: "m1", content: ""))

        XCTAssertFalse(inserted)
        let stored = try appStore.pool.read { db in try MessageRecord.fetchOne(db, key: "m1") }
        XCTAssertEqual(stored?.content, "canonical")
    }

    func test_configuration_waitsOnCrossProcessWritersInsteadOfFailingBusy() {
        let configuration = MessageStoreDatabase.configuration()

        guard case .timeout(let seconds) = configuration.busyMode else {
            return XCTFail("the shared App Group file needs a busy timeout")
        }
        XCTAssertEqual(seconds, 5)
    }

    func test_openForNotificationExtension_waitsOnTheAppWriterInsteadOfDroppingTheBubble() throws {
        let path = try makeDirectory().appendingPathComponent("e.sqlite").path

        let extensionStore = try MessageStoreDatabase.openForNotificationExtension(path: path)

        guard case .timeout(let seconds) = extensionStore.pool.configuration.busyMode else {
            return XCTFail("an SQLITE_BUSY in the extension silently loses the pre-persisted bubble")
        }
        XCTAssertEqual(seconds, 5)
    }
}
