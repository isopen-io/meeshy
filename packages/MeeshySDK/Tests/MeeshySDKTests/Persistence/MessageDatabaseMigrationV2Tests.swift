import XCTest
import GRDB
@testable import MeeshySDK

final class MessageDatabaseMigrationV2Tests: XCTestCase {

    func test_migrations_createAllTables() throws {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)

        try dbQueue.read { db in
            XCTAssertTrue(try db.tableExists("messages"))
            XCTAssertTrue(try db.tableExists("pending_ids"))
            XCTAssertTrue(try db.tableExists("message_translations"))
            XCTAssertTrue(try db.tableExists("message_transcriptions"))
            XCTAssertTrue(try db.tableExists("message_audio_translations"))
            XCTAssertTrue(try db.tableExists("local_attachments"))
        }
    }

    func test_migrations_messagesTableHasCorrectColumns() throws {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)

        try dbQueue.read { db in
            let columns = try db.columns(in: "messages").map(\.name)
            XCTAssertTrue(columns.contains("localId"))
            XCTAssertTrue(columns.contains("conversationId"))
            XCTAssertTrue(columns.contains("state"))
            XCTAssertTrue(columns.contains("changeVersion"))
            XCTAssertTrue(columns.contains("cachedBubbleWidth"))
            XCTAssertTrue(columns.contains("cachedTimestampInline"))
            XCTAssertTrue(columns.contains("reactionsJson"))
        }
    }

    func test_migrations_indexesCreated() throws {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)

        try dbQueue.read { db in
            let indexes = try db.indexes(on: "messages").map(\.name)
            XCTAssertTrue(indexes.contains("idx_msg_conv_date"))
            XCTAssertTrue(indexes.contains("idx_msg_state"))
        }
    }
}
