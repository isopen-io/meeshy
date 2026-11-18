import XCTest
import GRDB
@testable import MeeshySDK

/// Témoins de l'audit adversarial du lot #19437 : le transfert, la citation, le retour arrière d'une suppression refusée,
/// les index du balayage, les tables héritées.
final class ErasureAdversarialWitnessTests: XCTestCase {

    private static let conversationId = "conv_witness"
    private static let bob = #"{"id":"p-bob","userId":"u-bob","displayName":"Bob"}"#

    private var dbQueue: DatabaseQueue!
    private var actor: MessagePersistenceActor!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue, currentUserId: "u-me")
    }

    override func tearDown() async throws {
        actor = nil
        dbQueue = nil
    }

    private func served(id: String, content: String = "Bonjour", extra: String = "") throws -> APIMessage {
        let json = """
        {"id":"\(id)","conversationId":"\(Self.conversationId)","senderId":"p-alice","content":"\(content)",
         "sender":{"id":"p-alice","userId":"u-alice","displayName":"Alice"},
         "messageType":"text","messageSource":"user"\(extra),
         "createdAt":"2026-11-17T10:00:00.000Z","updatedAt":"2026-11-17T10:00:00.000Z"}
        """
        return try MeeshyCoders.decoder(.api).decode(APIMessage.self, from: Data(json.utf8))
    }

    private func row(_ id: String) throws -> MessageRecord {
        try XCTUnwrap(try dbQueue.read { db in try MessageRecord.fetchOne(db, key: id) })
    }

    private func blob(_ data: Data?) -> String { data.map { String(decoding: $0, as: UTF8.self) } ?? "" }

    private static let forward = #","forwardedFromId":"f1","forwardedFrom":{"id":"f1","content":"SECRET-transfere","sender":\#(bob),"attachments":[{"id":"fa1","thumbnailUrl":"https://cdn/SECRET-vignette.jpg","mimeType":"image/jpeg"}]}"#

    // MARK: - C1 : le texte d'un transfert survit à la pierre tombale (forwardedFromJson.previewText)

    func test_markDeleted_forwardedSecret_leavesNoTextInTheForwardReference() async throws {
        try await actor.upsertFromAPIMessages([try served(id: "m-fwd", content: "SECRET-transfere", extra: Self.forward)])

        try await actor.markDeleted(localId: "m-fwd", deletedAt: Date())

        let record = try row("m-fwd")
        XCTAssertNil(record.content)
        XCTAssertFalse(blob(record.forwardedFromJson).contains("SECRET"),
                       "la pierre tombale garde le texte et la vignette du transfert : \(blob(record.forwardedFromJson))")
    }

    func test_sweep_forwardedSecretDeletedBeforeTheUpdate_leavesNoText() async throws {
        try await actor.upsertFromAPIMessages([try served(id: "m-fwd-old", content: "SECRET-transfere", extra: Self.forward)])
        try dbQueue.write { db in
            try db.execute(sql: "UPDATE messages SET deletedAt = ? WHERE localId = ?", arguments: [Date(), "m-fwd-old"])
        }

        _ = try dbQueue.write { db in try MessageEnrichmentLaw.sweep(in: db, ledger: ErasureTestLedger(), now: Date()) }

        XCTAssertFalse(blob(try row("m-fwd-old").forwardedFromJson).contains("SECRET"), "le balayage laisse le transfert en clair")
    }

    // MARK: - C2 : régression — une suppression REFUSÉE ne rend plus la pièce, le lieu, l'autocollant

    func test_refusedDeletion_bringsBackThePhotoAndThePlace() async throws {
        let piece = #","attachments":[{"id":"a1","messageId":"m-refus","fileName":"photo.jpg","originalName":"photo.jpg","mimeType":"image/jpeg","fileSize":10,"fileUrl":"https://cdn/a1.jpg"}]"#
        try await actor.upsertFromAPIMessages([try served(id: "m-refus", content: "", extra: piece)])
        try dbQueue.write { db in
            try db.execute(sql: "UPDATE messages SET locationJson = ? WHERE localId = ?", arguments: [#"{"name":"Gare"}"#, "m-refus"])
        }
        XCTAssertNotNil(try row("m-refus").attachmentsJson, "précondition")

        try await actor.markDeletedAwaitingConfirmation(localId: "m-refus", deletedAt: Date())
        try await actor.markUndeleted(localId: "m-refus")

        let record = try row("m-refus")
        XCTAssertNil(record.deletedAt, "le serveur a refusé : le message revient")
        XCTAssertNotNil(record.attachmentsJson, "la photo du message revenu a disparu de l'appareil")
        XCTAssertNotNil(record.locationJson, "le lieu du message revenu a disparu de l'appareil")
    }

    // MARK: - C3 : la citation d'un mort survit dans la réponse (REST et balayage ne suivent pas les citations)

    func test_upsert_ephemeralGoneLocally_itsQuoteInAReply_keepsNoText() async throws {
        let parent = try served(id: "m-eph", content: "SECRET-ephemere", extra: #","ephemeralDuration":60"#)
        let reply = try served(id: "m-rep", content: "ok", extra: #","replyToId":"m-eph","replyTo":{"id":"m-eph","content":"SECRET-ephemere","sender":\#(Self.bob)}"#)
        let alive = APIMessageUpsert.Context(currentUserId: "u-me", preferredLanguages: [], ephemeralLedger: ErasureTestLedger())
        _ = try dbQueue.write { db in try APIMessageUpsert.upsertOutcome([parent, reply], context: alive, in: db) }
        XCTAssertTrue(blob(try row("m-rep").replyToJson).contains("SECRET"), "précondition : la réponse cite le texte")

        let dead = APIMessageUpsert.Context(
            currentUserId: "u-me", preferredLanguages: [],
            ephemeralLedger: ErasureTestLedger(receptions: ["m-eph": Date().addingTimeInterval(-3_600)])
        )
        let tombstonedReply = try served(id: "m-rep", content: "", extra: #","replyToId":"m-eph","replyTo":null,"expiresAt":"2026-11-17T10:01:00.000Z""#)
        _ = try dbQueue.write { db in try APIMessageUpsert.upsertOutcome([parent, tombstonedReply], context: dead, in: db) }

        XCTAssertNil(try row("m-eph").content, "le mort est vidé")
        XCTAssertFalse(blob(try row("m-rep").replyToJson).contains("SECRET"),
                       "le texte du mort survit dans la citation de sa réponse, même quand la passerelle la sert sans citation")
    }

    // MARK: - Le balayage ne lit pas toute la table à chaque ligne scellée

    func test_translationsLookup_byServerId_usesAnIndex() throws {
        let plan = try dbQueue.read { db in
            try Row.fetchAll(db, sql: "EXPLAIN QUERY PLAN DELETE FROM message_translations WHERE messageLocalId = ? OR messageServerId = ?",
                             arguments: ["a", "b"]).map { ($0["detail"] as String?) ?? "" }
        }
        XCTAssertFalse(plan.contains { $0.hasPrefix("SCAN") }, "la recherche par identifiant serveur lit toute la table : \(plan)")
    }

    func test_sweep_legacyEnrichmentTables_keepNoTextOfASealedRow() async throws {
        try await actor.upsertFromAPIMessages([try served(id: "m-legacy-text", content: "SECRET-ancien")])
        try dbQueue.write { db in
            try db.execute(
                sql: "INSERT INTO message_transcriptions (messageLocalId, messageServerId, language, text, receivedAt) VALUES (?, ?, 'fr', 'SECRET-transcrit', ?)",
                arguments: ["m-legacy-text", "m-legacy-text", Date()]
            )
            try db.execute(sql: "UPDATE messages SET deletedAt = ? WHERE localId = ?", arguments: [Date(), "m-legacy-text"])
        }

        _ = try dbQueue.write { db in try MessageEnrichmentLaw.sweep(in: db, ledger: ErasureTestLedger(), now: Date()) }

        let left = try dbQueue.read { db in try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM message_transcriptions") ?? 0 }
        XCTAssertEqual(left, 0, "le balayage laisse la transcription héritée d'une ligne scellée")
    }

    func test_sweep_theQuoteOfASealedMessageInAReply_keepsNoText() async throws {
        let parent = try served(id: "m-del", content: "SECRET-supprime")
        let reply = try served(id: "m-rep2", content: "ok", extra: #","replyToId":"m-del","replyTo":{"id":"m-del","content":"SECRET-supprime","sender":\#(Self.bob)}"#)
        try await actor.upsertFromAPIMessages([parent, reply])
        XCTAssertTrue(blob(try row("m-rep2").replyToJson).contains("SECRET"), "précondition")
        try dbQueue.write { db in
            try db.execute(sql: "UPDATE messages SET deletedAt = ? WHERE localId = ?", arguments: [Date(), "m-del"])
        }

        _ = try dbQueue.write { db in try MessageEnrichmentLaw.sweep(in: db, ledger: ErasureTestLedger(), now: Date()) }

        XCTAssertFalse(blob(try row("m-rep2").replyToJson).contains("SECRET"), "la réponse cite encore le texte du message supprimé")
    }

    func test_confirmedDeletion_afterTheServerAccepts_scrubsThePhotoAndThePlace() async throws {
        let piece = #","attachments":[{"id":"a2","messageId":"m-ok","fileName":"photo.jpg","originalName":"photo.jpg","mimeType":"image/jpeg","fileSize":10,"fileUrl":"https://cdn/a2.jpg"}]"#
        try await actor.upsertFromAPIMessages([try served(id: "m-ok", content: "", extra: piece)])

        try await actor.markDeletedAwaitingConfirmation(localId: "m-ok", deletedAt: Date())
        XCTAssertNotNil(try row("m-ok").attachmentsJson, "tant que le serveur n'a pas accepté, la pièce reste")
        try await actor.confirmDeletion(localId: "m-ok")

        XCTAssertNil(try row("m-ok").attachmentsJson, "le serveur a accepté : plus rien de lisible")
    }

    func test_enforceLocalDeath_anEphemeralTheScreenRetired_leavesNoTextInTheDatabase() async throws {
        try await actor.upsertFromAPIMessages([try served(id: "m-brule", content: "SECRET-brule", extra: #","ephemeralDuration":60"#)])
        let ledger = ErasureTestLedger(receptions: ["m-brule": Date().addingTimeInterval(-3_600)])

        try await actor.enforceLocalDeath(ofMessages: ["m-brule"], ledger: ledger)

        XCTAssertNil(try row("m-brule").content)
    }
}
