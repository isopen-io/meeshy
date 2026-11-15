import XCTest
import GRDB
@testable import MeeshySDK

/// #13824 — ce qu'un envoi a gravé sur sa ligne PENDANT qu'il tournait (les
/// médias déjà téléversés d'une publication) survit à l'échec de cet envoi.
/// L'instantané d'avant l'envoi réécrivait la charge entière : chaque nouvelle
/// tentative re-téléversait les mêmes octets et laissait un `PostMedia`
/// orphelin de plus sur la passerelle.
final class OutboxFlusherPayloadPreservationTests: XCTestCase {

    func test_flush_genericFailureAfterPayloadWrittenDuringDispatch_keepsTheWrittenPayload() async throws {
        let written = try await payloadAfterFailedDispatch(failure: NSError(domain: "test", code: -1))

        XCTAssertEqual(written.payload, Self.payloadWrittenDuringDispatch)
        XCTAssertEqual(written.status, .pending)
        XCTAssertEqual(written.attempts, 1)
    }

    func test_flush_transportFailureAfterPayloadWrittenDuringDispatch_keepsTheWrittenPayload() async throws {
        let written = try await payloadAfterFailedDispatch(failure: URLError(.networkConnectionLost))

        XCTAssertEqual(written.payload, Self.payloadWrittenDuringDispatch)
        XCTAssertEqual(written.status, .pending)
        XCTAssertEqual(written.attempts, 0)
    }

    func test_flush_permanentRejectionAfterPayloadWrittenDuringDispatch_keepsTheWrittenPayload() async throws {
        let written = try await payloadAfterFailedDispatch(failure: MeeshyError.server(statusCode: 413, message: "too large"))

        XCTAssertEqual(written.payload, Self.payloadWrittenDuringDispatch)
        XCTAssertEqual(written.status, .exhausted)
    }

    // MARK: - Fabrique

    private static let payloadBeforeDispatch = Data(#"{"uploadedMedia":[]}"#.utf8)
    private static let payloadWrittenDuringDispatch = Data(#"{"uploadedMedia":[{"sourceIndex":0}]}"#.utf8)

    private func payloadAfterFailedDispatch(failure: Error) async throws -> OutboxRecord {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "post", kind: .createPost, conversationId: "",
                clientMessageId: "cmid_post",
                payload: Self.payloadBeforeDispatch, status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }
        let dispatcher = PayloadWritingDispatcher(
            pool: pool, payload: Self.payloadWrittenDuringDispatch, failure: failure
        )
        await OutboxFlusher(pool: pool, dispatcher: dispatcher).flush()
        return try await pool.read { db in try XCTUnwrap(OutboxRecord.fetchOne(db, key: "post")) }
    }
}

/// Grave une nouvelle charge sur la ligne pendant l'envoi — comme
/// `OfflineQueue.recordUploadedPostMedia` après chaque média monté — puis échoue.
private struct PayloadWritingDispatcher: OutboxDispatching {
    let pool: DatabaseQueue
    let payload: Data
    let failure: Error

    func dispatch(_ record: OutboxRecord) async throws {
        let id = record.id
        let payload = self.payload
        try await pool.write { db in
            try db.execute(sql: "UPDATE outbox SET payload = ? WHERE id = ?", arguments: [payload, id])
        }
        throw failure
    }
}
