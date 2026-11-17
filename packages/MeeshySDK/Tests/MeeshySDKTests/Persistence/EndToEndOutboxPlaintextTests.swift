import XCTest
import GRDB
@testable import MeeshySDK

/// **Le clair d'un message enfilé hors ligne ne survit pas au scellement de sa
/// conversation** (#16747, constat IOSX-01 de la revue E2EE du 2026-11-17).
///
/// Un message tapé hors ligne dans une conversation en clair, dont le pair
/// active le chiffrement de bout en bout avant le retour du réseau : la garde
/// de la file le refuse avant tout transport, mais sa ligne gardait le texte en
/// clair dans `outbox.payload` — base des messages, non chiffrée — jusqu'à 7
/// jours. La loi se juge sur TOUTES les colonnes de la base, pas sur une table.
final class EndToEndOutboxPlaintextTests: XCTestCase {
    private let secret = "le code du coffre est 4712"

    private func makeActor() throws -> (MessagePersistenceActor, DatabaseQueue) {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return (MessagePersistenceActor(dbWriter: queue, currentUserId: "user_me"), queue)
    }

    private func queued(_ kind: OutboxKind, id: String, conversationId: String = "conv_default", clientMessageId: String,
                        text: String, status: OutboxStatus = .pending) -> OutboxRecord {
        OutboxRecord(
            id: id, kind: kind, conversationId: conversationId, messageLocalId: clientMessageId,
            clientMessageId: clientMessageId,
            payload: Data(#"{"conversationId":"\#(conversationId)","content":"\#(text)"}"#.utf8), status: status
        )
    }

    /// Chaque valeur de chaque colonne de chaque table : la garde de la loi balaie
    /// les colonnes, jamais un seul nom de table.
    private func everyStoredValue(in queue: DatabaseQueue) throws -> [String] {
        try queue.read { db in
            let tables = try String.fetchAll(db, sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
            return try tables.flatMap { table in
                try Row.fetchAll(db, sql: "SELECT * FROM \"\(table)\"").flatMap { row in
                    row.databaseValues.compactMap { value -> String? in
                        switch value.storage {
                        case .string(let text): text
                        case .blob(let data): String(decoding: data, as: UTF8.self)
                        default: nil
                        }
                    }
                }
            }
        }
    }

    // MARK: - La file efface ce qu'elle refuse

    func test_aMessageRefusedBecauseItsConversationSeals_leavesNoRowInTheOutbox() async throws {
        let (_, queue) = try makeActor()
        let row = queued(.sendMessage, id: "o1", clientMessageId: "cid_1", text: secret)
        try await queue.write { db in try row.insert(db) }

        await OutboxFlusher(pool: queue, dispatcher: RefusingDispatcher(refusal: EndToEndSendRefusal.sealedOnlyInConversation)).flush()

        let left = try await queue.read { db in try OutboxRecord.fetchCount(db) }
        XCTAssertEqual(left, 0, "refusée avant tout transport, elle ne se rejouera jamais : sa ligne s'efface")
        XCTAssertFalse(try everyStoredValue(in: queue).contains { $0.contains(secret) })
    }

    func test_anEditRefusedForTheSameReason_leavesNoRowEither() async throws {
        let (_, queue) = try makeActor()
        let row = queued(.editMessage, id: "o2", clientMessageId: "cid_2", text: secret)
        try await queue.write { db in try row.insert(db) }

        await OutboxFlusher(pool: queue, dispatcher: RefusingDispatcher(refusal: EndToEndSendRefusal.editUnsealable)).flush()

        XCTAssertFalse(try everyStoredValue(in: queue).contains { $0.contains(secret) })
    }

    func test_aPlaintextRefusedByTheGateway_leavesNoRowEither() async throws {
        let (_, queue) = try makeActor()
        let row = queued(.sendMessage, id: "o3", clientMessageId: "cid_3", text: secret)
        try await queue.write { db in try row.insert(db) }
        let refusal = MeeshyError.rejected(APIRejection(statusCode: 409, code: EndToEndSendGate.serverPlaintextRefusalCode, message: "refused"))

        await OutboxFlusher(pool: queue, dispatcher: RefusingDispatcher(refusal: refusal)).flush()

        XCTAssertFalse(try everyStoredValue(in: queue).contains { $0.contains(secret) })
    }

    /// Le miroir : un refus qui ne tient pas au chiffrement garde sa ligne épuisée.
    func test_anOrdinaryPermanentRefusal_keepsItsExhaustedRow() async throws {
        let (_, queue) = try makeActor()
        let row = queued(.sendMessage, id: "o4", clientMessageId: "cid_4", text: "texte ordinaire")
        try await queue.write { db in try row.insert(db) }

        await OutboxFlusher(pool: queue, dispatcher: RefusingDispatcher(refusal: MeeshyError.server(statusCode: 404, message: "gone"))).flush()

        let kept = try await queue.read { db in try OutboxRecord.fetchOne(db, key: "o4") }
        XCTAssertEqual(kept?.status, .exhausted)
    }

    // MARK: - Le rescellement efface le texte refusé de la conversation qu'il scelle

    func test_resealing_erasesTheRefusedQueuedText_ofTheConversationsItSeals() async throws {
        let (actor, queue) = try makeActor()
        let bubble = MessageRecordFactory.make(localId: "cid_9", content: secret, state: .failed)
        let refused = queued(.sendMessage, id: "o9", clientMessageId: "cid_9", text: secret, status: .exhausted)
        let refusedEdit = queued(.editMessage, id: "o10", clientMessageId: "cid_8", text: secret, status: .failed)
        let elsewhere = queued(.sendMessage, id: "o11", conversationId: "conv_other", clientMessageId: "cid_11",
                               text: "ailleurs", status: .exhausted)
        let stillQueued = queued(.sendMessage, id: "o12", clientMessageId: "cid_12", text: "en attente")
        let rows = [refused, refusedEdit, elsewhere, stillQueued]
        try await queue.write { db in
            try bubble.insert(db)
            try rows.forEach { try $0.insert(db) }
        }

        _ = try await actor.endToEndRowSealer.seal(messageKeys: ["cid_9"])

        let remaining = try await queue.read { db in try String.fetchAll(db, sql: "SELECT id FROM outbox ORDER BY id") }
        XCTAssertEqual(remaining, ["o11", "o12"], "une autre conversation garde sa ligne ; une ligne encore en file passe par la garde")
        XCTAssertFalse(try everyStoredValue(in: queue).contains { $0.contains(secret) })
    }
}

/// Un envoi que la garde refuse avant tout transport.
private struct RefusingDispatcher: OutboxDispatching {
    let refusal: Error

    func dispatch(_ record: OutboxRecord) async throws {
        throw refusal
    }
}
