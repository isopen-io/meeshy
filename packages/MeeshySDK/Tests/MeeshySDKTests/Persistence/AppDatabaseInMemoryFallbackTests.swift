import XCTest
import GRDB
@testable import MeeshySDK

final class AppDatabaseInMemoryFallbackTests: XCTestCase {

    private struct StubError: Error {}

    func test_inMemoryWriter_firstOpenerThrows_fallsBackToNextOpenerAndRecordsFailure() throws {
        let spy = SpyErrorRecorder()
        let openers: [AppDatabase.InMemoryOpener] = [
            { throw StubError() },
            { try DatabaseQueue() },
        ]

        let (writer, ephemeral) = AppDatabase.inMemoryWriter(openers: openers, recorder: spy)

        XCTAssertTrue(ephemeral)
        let migrated = try writer.read { db in try db.tableExists("cache_entries") }
        XCTAssertTrue(migrated)
        XCTAssertEqual(spy.failures.count, 1)
        XCTAssertEqual(spy.failures.first?.category, .grdb)
    }

    func test_inMemoryWriter_firstOpenerSucceeds_recordsNothing() {
        let spy = SpyErrorRecorder()
        let openers: [AppDatabase.InMemoryOpener] = [{ try DatabaseQueue() }]

        _ = AppDatabase.inMemoryWriter(openers: openers, recorder: spy)

        XCTAssertTrue(spy.failures.isEmpty)
    }

    func test_inMemoryWriter_migrationThrows_recordsFailureAndStaysUsable() throws {
        let spy = SpyErrorRecorder()

        let (writer, ephemeral) = AppDatabase.inMemoryWriter(recorder: spy) { _ in throw StubError() }

        XCTAssertTrue(ephemeral)
        XCTAssertEqual(spy.failures.count, 1)
        XCTAssertEqual(spy.failures.first?.category, .grdb)
        XCTAssertNoThrow(try writer.write { db in try db.execute(sql: "CREATE TABLE probe (id INTEGER)") })
    }

    func test_fallbackOpeners_secondOpener_opensAUsableTemporaryFileQueue() throws {
        XCTAssertEqual(AppDatabase.fallbackOpeners.count, 2)

        let queue = try AppDatabase.fallbackOpeners[1]()

        XCTAssertNoThrow(try queue.write { db in try db.execute(sql: "CREATE TABLE probe (id INTEGER)") })
    }
}
