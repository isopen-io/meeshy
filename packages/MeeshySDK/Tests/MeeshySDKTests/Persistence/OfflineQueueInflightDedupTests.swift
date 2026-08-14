import XCTest
import GRDB
@testable import MeeshySDK

/// Garde du flash orange (cause racine 2026-08-14).
///
/// `OutboxFlusher` réclame une row en la basculant `pending → inflight` le
/// temps de son envoi. Tant que la déduplication d'enfilage ne filtrait que
/// sur `.pending`, la row devenait INVISIBLE à cette déduplication pendant
/// tout son vol : un ré-enfilage concurrent du même `clientMessageId`
/// (retour en avant-plan qui rejoue `share_pending_sends`, retry manuel,
/// catch du repli REST) insérait une jumelle. Les deux rows vivaient alors
/// indépendamment sous le flusher — la première à épuiser son budget émettait
/// `retryExhausted`, faisant passer la bulle `.queued → .failed` (bandeau
/// orange) pendant que la jumelle était ENCORE EN VOL, jusqu'à ce que son
/// `serverAck` guérisse l'état.
///
/// Contrat de la spec 2026-07-08 règle 3 : `.failed` est TERMINAL, jamais un
/// état traversé pendant que des tentatives restent en cours.
final class OfflineQueueInflightDedupTests: XCTestCase {

    private var pool: DatabaseQueue!

    override func setUp() async throws {
        pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        await OfflineQueue.shared.clearAll()
    }

    override func tearDown() async throws {
        await OfflineQueue.shared.clearAll()
        pool = nil
    }

    // MARK: - Helpers

    private func sendRowCount(clientMessageId: String) throws -> Int {
        try pool.read { db in
            try OutboxRecord
                .filter(Column("clientMessageId") == clientMessageId)
                .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
                .fetchCount(db)
        }
    }

    private func setStatus(_ status: OutboxStatus, clientMessageId: String) throws {
        try pool.write { db in
            try db.execute(
                sql: "UPDATE outbox SET status = ? WHERE clientMessageId = ?",
                arguments: [status.rawValue, clientMessageId]
            )
        }
    }

    private func payload(clientMessageId: String) throws -> Data? {
        try pool.read { db in
            try OutboxRecord
                .filter(Column("clientMessageId") == clientMessageId)
                .fetchOne(db)?
                .payload
        }
    }

    // MARK: - Tests

    func test_enqueue_whenExistingRowIsInflight_reusesRowInsteadOfInsertingTwin() async throws {
        let clientMessageId = "cmid-inflight-1"
        let first = OfflineQueueItem(
            conversationId: "conv-1",
            content: "Bonjour",
            clientMessageId: clientMessageId
        )
        try await OfflineQueue.shared.enqueue(first)
        XCTAssertEqual(try sendRowCount(clientMessageId: clientMessageId), 1)

        // Le flusher réclame la row.
        try setStatus(.inflight, clientMessageId: clientMessageId)

        // Ré-enfilage concurrent du MÊME message pendant son vol.
        let second = OfflineQueueItem(
            conversationId: "conv-1",
            content: "Bonjour",
            clientMessageId: clientMessageId
        )
        try await OfflineQueue.shared.enqueue(second)

        XCTAssertEqual(
            try sendRowCount(clientMessageId: clientMessageId), 1,
            "Une row en vol doit être RÉUTILISÉE : une jumelle ferait émettre retryExhausted par la première à épuiser son budget, d'où le flash orange."
        )
    }

    func test_enqueue_whenExistingRowIsInflight_leavesPayloadUntouched() async throws {
        let clientMessageId = "cmid-inflight-2"
        try await OfflineQueue.shared.enqueue(
            OfflineQueueItem(
                conversationId: "conv-1",
                content: "Original",
                clientMessageId: clientMessageId
            )
        )
        try setStatus(.inflight, clientMessageId: clientMessageId)
        let before = try payload(clientMessageId: clientMessageId)

        try await OfflineQueue.shared.enqueue(
            OfflineQueueItem(
                conversationId: "conv-1",
                content: "Réécrit",
                clientMessageId: clientMessageId
            )
        )

        XCTAssertEqual(
            try payload(clientMessageId: clientMessageId), before,
            "Réécrire une row que le flusher a déjà réclamée courserait sa tentative en vol."
        )
    }

    func test_enqueue_whenExistingRowIsPending_refreshesPayloadInPlace() async throws {
        let clientMessageId = "cmid-pending-1"
        try await OfflineQueue.shared.enqueue(
            OfflineQueueItem(
                conversationId: "conv-1",
                content: "Original",
                clientMessageId: clientMessageId
            )
        )
        let before = try payload(clientMessageId: clientMessageId)

        try await OfflineQueue.shared.enqueue(
            OfflineQueueItem(
                conversationId: "conv-1",
                content: "Rafraîchi",
                clientMessageId: clientMessageId
            )
        )

        XCTAssertEqual(try sendRowCount(clientMessageId: clientMessageId), 1)
        XCTAssertNotEqual(
            try payload(clientMessageId: clientMessageId), before,
            "Une row encore pending n'est pas réclamée : son payload doit rester rafraîchissable."
        )
    }

    func test_enqueue_whenExistingRowIsExhausted_insertsFreshRow() async throws {
        let clientMessageId = "cmid-exhausted-1"
        try await OfflineQueue.shared.enqueue(
            OfflineQueueItem(
                conversationId: "conv-1",
                content: "Bonjour",
                clientMessageId: clientMessageId
            )
        )
        try setStatus(.exhausted, clientMessageId: clientMessageId)

        try await OfflineQueue.shared.enqueue(
            OfflineQueueItem(
                conversationId: "conv-1",
                content: "Bonjour",
                clientMessageId: clientMessageId
            )
        )

        XCTAssertEqual(
            try sendRowCount(clientMessageId: clientMessageId), 2,
            "`.exhausted` est TERMINAL : un nouvel enfilage est un retry manuel légitime qui repart sur une row neuve."
        )
    }
}
