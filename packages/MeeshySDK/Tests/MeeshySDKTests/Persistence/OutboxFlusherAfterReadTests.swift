import XCTest
import GRDB
@testable import MeeshySDK

/// La consommation d'une flamme-œil (#18556) passe par l'outbox : une ligne en
/// échec PLUS ANCIENNE ne la retient pas derrière elle.
final class OutboxFlusherAfterReadTests: XCTestCase {

    func test_flush_consumeAfterRead_isDispatchedBehindAFailingHead() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let past = Date().addingTimeInterval(-10)
        try await pool.write { db in
            try Self.record(id: "head", kind: .sendMessage, at: past).insert(db)
            try Self.record(id: "flame", kind: .consumeAfterRead, at: past.addingTimeInterval(1)).insert(db)
        }
        let dispatcher = FailingHeadDispatcher(failing: "head")

        await OutboxFlusher(pool: pool, dispatcher: dispatcher).flush()

        let processed = await dispatcher.processedIds
        XCTAssertEqual(processed, ["head", "flame"])
        let flameLeft = try await pool.read { db in try OutboxRecord.fetchOne(db, key: "flame") }
        XCTAssertNil(flameLeft, "la consommation est partie et sa ligne a quitté la file")
        let head = try await pool.read { db in try OutboxRecord.fetchOne(db, key: "head") }
        XCTAssertEqual(head?.status, .pending, "la tête en échec attend son recul, seule")
    }

    private static func record(id: String, kind: OutboxKind, at date: Date) -> OutboxRecord {
        OutboxRecord(
            id: id, kind: kind, conversationId: "c1", clientMessageId: "cid_\(id)",
            payload: Data(), status: .pending, attempts: 0, lastError: nil,
            createdAt: date, updatedAt: date, nextAttemptAt: date
        )
    }
}

private actor FailingHeadDispatcher: OutboxDispatching {
    private(set) var processedIds: [String] = []
    let failing: String

    init(failing: String) { self.failing = failing }

    func dispatch(_ record: OutboxRecord) async throws {
        processedIds.append(record.id)
        if record.id == failing { throw NSError(domain: "test", code: -1) }
    }
}
