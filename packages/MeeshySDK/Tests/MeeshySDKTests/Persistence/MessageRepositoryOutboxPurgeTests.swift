import XCTest
import GRDB
@testable import MeeshySDK

final class MessageRepositoryOutboxPurgeTests: XCTestCase {

    private static func outboxRow(_ id: String, status: OutboxStatus) -> OutboxRecord {
        let date = Date(timeIntervalSince1970: 0)
        return OutboxRecord(id: id, kind: .blockUser, conversationId: "c", clientMessageId: "cm_\(id)",
                            payload: Data(), status: status, attempts: 0, lastError: nil,
                            createdAt: date, updatedAt: date, nextAttemptAt: date)
    }

    func test_purgeOutbox_removesEveryRowWhateverItsStatus_andLeavesMessagesAlone() async throws {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        let repository = MessageRepository(persistence: MessagePersistenceActor(dbWriter: queue, currentUserId: "user_me"))
        try await queue.write { db in
            try Self.outboxRow("p", status: .pending).insert(db)
            try Self.outboxRow("i", status: .inflight).insert(db)
            try Self.outboxRow("e", status: .exhausted).insert(db)
            try MessageRecordFactory.make(localId: "m1", state: .sent).insert(db)
        }

        let removed = try await repository.purgeOutbox()

        XCTAssertEqual(removed, 3)
        let (outbox, messages) = try await queue.read { db in
            (try OutboxRecord.fetchCount(db), try MessageRecord.fetchCount(db))
        }
        XCTAssertEqual(outbox, 0)
        XCTAssertEqual(messages, 1)
    }
}
