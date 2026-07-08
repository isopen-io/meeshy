import XCTest
import GRDB
@testable import MeeshySDK

/// Journal local des tentatives d'envoi — spec 2026-07-08
/// message-send-failure-retry-flow.
final class SendAttemptRecordTests: XCTestCase {

    private func makeDatabase() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        return dbQueue
    }

    // MARK: - Record / migration

    func test_log_insertsRowWithMonotonicAttemptNumber() throws {
        let dbQueue = try makeDatabase()

        try dbQueue.write { db in
            _ = try SendAttemptRecord.log(
                db, localId: "cid_a", transport: .socketFirst,
                startedAt: Date(), outcome: .failure, errorMessage: "no ACK")
            _ = try SendAttemptRecord.log(
                db, localId: "cid_a", transport: .rest,
                startedAt: Date(), outcome: .failure, errorMessage: "timeout")
            _ = try SendAttemptRecord.log(
                db, localId: "cid_a", transport: .outbox,
                startedAt: Date(), outcome: .success)
        }

        let attempts = try dbQueue.read { db in
            try SendAttemptRecord
                .filter(Column("localId") == "cid_a")
                .order(Column("attemptNumber").asc)
                .fetchAll(db)
        }
        XCTAssertEqual(attempts.map(\.attemptNumber), [1, 2, 3])
        XCTAssertEqual(attempts.map(\.transport), ["socket-first", "rest", "outbox"])
        XCTAssertEqual(attempts.map(\.outcome), ["failure", "failure", "success"])
        XCTAssertEqual(attempts[0].errorMessage, "no ACK")
        XCTAssertNil(attempts[2].errorMessage)
    }

    func test_log_attemptNumbersAreIndependentPerMessage() throws {
        let dbQueue = try makeDatabase()

        try dbQueue.write { db in
            _ = try SendAttemptRecord.log(
                db, localId: "cid_a", transport: .rest,
                startedAt: Date(), outcome: .failure, errorMessage: "500")
            _ = try SendAttemptRecord.log(
                db, localId: "cid_b", transport: .rest,
                startedAt: Date(), outcome: .success)
        }

        let bAttempts = try dbQueue.read { db in
            try SendAttemptRecord.filter(Column("localId") == "cid_b").fetchAll(db)
        }
        XCTAssertEqual(bAttempts.count, 1)
        XCTAssertEqual(bAttempts[0].attemptNumber, 1)
    }

    // MARK: - MessagePersistenceActor API

    func test_recordSendAttempt_thenSendAttempts_byLocalId() async throws {
        let dbQueue = try makeDatabase()
        let actor = MessagePersistenceActor(dbWriter: dbQueue)

        try await actor.recordSendAttempt(
            localId: "cid_x", transport: .socketFirst,
            startedAt: Date(), outcome: .failure, errorMessage: "no ACK")
        try await actor.recordSendAttempt(
            localId: "cid_x", transport: .rest,
            startedAt: Date(), outcome: .success)

        let attempts = try await actor.sendAttempts(messageId: "cid_x")
        XCTAssertEqual(attempts.count, 2)
        XCTAssertEqual(attempts.map(\.attemptNumber), [1, 2])
        XCTAssertEqual(attempts.last?.outcome, "success")
    }

    /// La vue détails ne connaît que `message.id`, qui devient l'id SERVEUR
    /// après réconciliation — `sendAttempts` doit résoudre serverId → localId.
    func test_sendAttempts_resolvesServerIdToLocalId() async throws {
        let dbQueue = try makeDatabase()
        let actor = MessagePersistenceActor(dbWriter: dbQueue)

        let record = MessageRecordFactory.make(localId: "cid_srv", conversationId: "conv_1")
        try await actor.insertOptimistic(record)
        try await actor.recordSendAttempt(
            localId: "cid_srv", transport: .rest,
            startedAt: Date(), outcome: .failure, errorMessage: "timeout")
        _ = try await actor.applyEvent(
            localId: "cid_srv",
            event: .serverAck(serverId: "6863f00000000000000000aa", at: Date()))
        try await actor.recordSendAttempt(
            localId: "cid_srv", transport: .socketFallback,
            startedAt: Date(), outcome: .success)

        let attempts = try await actor.sendAttempts(messageId: "6863f00000000000000000aa")
        XCTAssertEqual(attempts.count, 2)
        XCTAssertEqual(attempts.map(\.transport), ["rest", "socket-fallback"])
    }

    /// Règle spec : les détails du premier envoi sont CONSERVÉS après le
    /// succès — le `serverAck` ne purge jamais l'historique.
    func test_sendAttempts_surviveServerAck() async throws {
        let dbQueue = try makeDatabase()
        let actor = MessagePersistenceActor(dbWriter: dbQueue)

        let record = MessageRecordFactory.make(localId: "cid_keep", conversationId: "conv_1")
        try await actor.insertOptimistic(record)
        try await actor.recordSendAttempt(
            localId: "cid_keep", transport: .socketFirst,
            startedAt: Date(), outcome: .failure, errorMessage: "no ACK")
        _ = try await actor.applyEvent(
            localId: "cid_keep",
            event: .serverAck(serverId: "6863f00000000000000000bb", at: Date()))

        let attempts = try await actor.sendAttempts(messageId: "cid_keep")
        XCTAssertEqual(attempts.count, 1)
        XCTAssertEqual(attempts[0].errorMessage, "no ACK")
    }

    func test_sendAttempts_unknownMessage_returnsEmpty() async throws {
        let dbQueue = try makeDatabase()
        let actor = MessagePersistenceActor(dbWriter: dbQueue)

        let attempts = try await actor.sendAttempts(messageId: "cid_none")
        XCTAssertTrue(attempts.isEmpty)
    }
}
