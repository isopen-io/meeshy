import XCTest
import GRDB
@testable import MeeshySDK

/// Spec 2026-07-08 (message-send-failure-retry-flow) — chaque dispatch d'un
/// record `.sendMessage` par le flusher journalise une ligne `send_attempts`
/// (transport `outbox`), succès comme échec, keyed sur le `clientMessageId`.
final class OutboxFlusherSendAttemptJournalTests: XCTestCase {

    private func makePool(with record: OutboxRecord) async throws -> DatabaseQueue {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        try await pool.write { db in try record.insert(db) }
        return pool
    }

    private func makeRecord(
        id: String = "ofq_1",
        kind: OutboxKind = .sendMessage,
        clientMessageId: String = "cid_journal"
    ) -> OutboxRecord {
        let now = Date()
        return OutboxRecord(
            id: id, kind: kind, conversationId: "conv_1",
            clientMessageId: clientMessageId,
            payload: Data(), status: .pending, attempts: 0, lastError: nil,
            createdAt: now, updatedAt: now, nextAttemptAt: now
        )
    }

    private func attempts(in pool: DatabaseQueue, localId: String) async throws -> [SendAttemptRecord] {
        try await pool.read { db in
            try SendAttemptRecord
                .filter(Column("localId") == localId)
                .order(Column("attemptNumber").asc)
                .fetchAll(db)
        }
    }

    func test_flush_successfulDispatch_logsOutboxSuccessAttempt() async throws {
        let pool = try await makePool(with: makeRecord())
        let flusher = OutboxFlusher(
            pool: pool,
            dispatcher: JournalSucceedingDispatcher(),
            isNetworkReachable: { true }
        )

        await flusher.flush()

        let logged = try await attempts(in: pool, localId: "cid_journal")
        XCTAssertEqual(logged.count, 1)
        XCTAssertEqual(logged[0].transport, "outbox")
        XCTAssertEqual(logged[0].outcome, "success")
        XCTAssertNil(logged[0].errorMessage)
    }

    func test_flush_failedDispatch_logsOutboxFailureAttempt() async throws {
        let pool = try await makePool(with: makeRecord())
        let flusher = OutboxFlusher(
            pool: pool,
            dispatcher: JournalFailingDispatcher(),
            isNetworkReachable: { true }
        )

        await flusher.flush()

        let logged = try await attempts(in: pool, localId: "cid_journal")
        XCTAssertEqual(logged.count, 1)
        XCTAssertEqual(logged[0].transport, "outbox")
        XCTAssertEqual(logged[0].outcome, "failure")
        XCTAssertNotNil(logged[0].errorMessage)
    }

    func test_flush_nonMessageKind_doesNotLogAttempt() async throws {
        let pool = try await makePool(with: makeRecord(kind: .sendReaction, clientMessageId: "cid_react"))
        let flusher = OutboxFlusher(
            pool: pool,
            dispatcher: JournalSucceedingDispatcher(),
            isNetworkReachable: { true }
        )

        await flusher.flush()

        let logged = try await attempts(in: pool, localId: "cid_react")
        XCTAssertTrue(logged.isEmpty, "Seuls les records .sendMessage alimentent l'historique d'envoi")
    }
}

private actor JournalSucceedingDispatcher: OutboxDispatching {
    func dispatch(_ record: OutboxRecord) async throws {}
}

private actor JournalFailingDispatcher: OutboxDispatching {
    struct Boom: Error {}
    func dispatch(_ record: OutboxRecord) async throws { throw Boom() }
}
