import XCTest
import GRDB
@testable import MeeshySDK

/// #19437 — une transition apprise par le REST (vue unique ouverte ailleurs, suppression, échéance) EFFACE
/// ce que la ligne gardait : l'enrichissement qui doublait le contenu, et les champs voisins en clair
/// (légende, localisation, liens suivis, autocollant, nom de fichier). La loi est `MessageEnrichmentLaw`.
///
/// Les témoins passent par la chaîne produit : décodeur réel, acteur réel, base réelle. Les colonnes voisines
/// sont posées en SQL parce que le sujet est ce qui survit à la transition, pas la manière dont la charge les sert.
final class MessageErasureOnDeviceTests: XCTestCase {

    private static let conversationId = "conv_erasure"
    private static let viewOnceFlags = #","isViewOnce":true,"effectFlags":4"#
    private static let futureExpiry = #","expiresAt":"2999-01-01T00:00:00.000Z""#

    private var dbQueue: DatabaseQueue!
    private var actor: MessagePersistenceActor!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    override func tearDown() async throws {
        actor = nil
        dbQueue = nil
    }

    private func served(id: String, extra: String = "") throws -> APIMessage {
        let json = """
        {"id":"\(id)","conversationId":"\(Self.conversationId)","senderId":"user_other","content":"Bonjour",
         "messageType":"text","messageSource":"user"\(extra),
         "translations":[{"id":"\(id)-en","messageId":"\(id)","sourceLanguage":"fr","targetLanguage":"en","translatedContent":"Hello"}],
         "createdAt":"2026-11-17T10:00:00.000Z","updatedAt":"2026-11-17T10:00:00.000Z"}
        """
        return try MeeshyCoders.decoder(.api).decode(APIMessage.self, from: Data(json.utf8))
    }

    /// Ce que la ligne garde À CÔTÉ de son texte : une pièce avec son nom et sa légende, un lieu, un autocollant, un lien suivi.
    private func seedNeighbours(of id: String) throws {
        try dbQueue.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET attachmentsJson = ?, locationJson = ?, stickerJson = ?, trackedLinksJson = ?
                    WHERE localId = ?
                    """,
                arguments: [
                    Data(#"[{"id":"a1","fileName":"SECRET-nom.pdf","caption":"SECRET-légende"}]"#.utf8),
                    #"{"name":"SECRET-lieu"}"#, #"{"emoji":"SECRET-autocollant"}"#, #"{"https://x.example":"tok"}"#, id,
                ]
            )
        }
    }

    private func row(_ id: String) throws -> MessageRecord {
        try XCTUnwrap(try dbQueue.read { db in try MessageRecord.fetchOne(db, key: id) }, "la ligne doit exister")
    }

    private func assertNothingReadableRemains(of id: String, _ why: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let record = try row(id)
        XCTAssertNil(record.content, "\(why) : le texte", file: file, line: line)
        XCTAssertNil(record.attachmentsJson, "\(why) : nom de fichier, légende, vignette", file: file, line: line)
        XCTAssertNil(record.locationJson, "\(why) : la localisation", file: file, line: line)
        XCTAssertNil(record.stickerJson, "\(why) : l'autocollant", file: file, line: line)
        XCTAssertNil(record.trackedLinksJson, "\(why) : les liens suivis", file: file, line: line)
        XCTAssertTrue(try actor.translations(for: id).isEmpty, "\(why) : les traductions", file: file, line: line)
    }

    // MARK: - Le REST apprend une transition

    func test_upsert_viewOnceOpenedElsewhere_erasesWhatTheUnopenedRowKept() async throws {
        let id = "m-vue-unique"
        try await actor.upsertFromAPIMessages([try served(id: id, extra: Self.viewOnceFlags)])
        XCTAssertEqual(try actor.translations(for: id).count, 1, "une vue unique pas encore ouverte garde ses enrichissements (#19353)")
        try seedNeighbours(of: id)

        try await actor.upsertFromAPIMessages([try served(id: id, extra: Self.viewOnceFlags + #","consumedByMe":true"#)])

        try assertNothingReadableRemains(of: id, "vue unique ouverte sur un autre appareil")
        XCTAssertNotNil(try row(id).viewOnceOpenedAt)
    }

    func test_upsert_deletedElsewhere_erasesWhatTheLiveRowKept() async throws {
        let id = "m-supprime"
        try await actor.upsertFromAPIMessages([try served(id: id)])
        XCTAssertEqual(try actor.translations(for: id).count, 1)
        try seedNeighbours(of: id)

        try await actor.upsertFromAPIMessages([try served(id: id, extra: #","deletedAt":"2026-11-17T11:00:00.000Z""#)])

        try assertNothingReadableRemains(of: id, "suppression apprise par le REST")
        XCTAssertNotNil(try row(id).deletedAt)
    }

    func test_upsert_ordinaryMessage_keepsEverythingItHad() async throws {
        let id = "m-ordinaire"
        try await actor.upsertFromAPIMessages([try served(id: id)])
        try seedNeighbours(of: id)

        try await actor.upsertFromAPIMessages([try served(id: id)])

        let record = try row(id)
        XCTAssertEqual(record.content, "Bonjour")
        XCTAssertNotNil(record.attachmentsJson, "un message ordinaire garde ses pièces")
        XCTAssertNotNil(record.locationJson)
        XCTAssertEqual(try actor.translations(for: id).map(\.translatedContent), ["Hello"], "le Prisme hors ligne tient")
    }

    func test_upsert_unopenedViewOnce_keepsItsTranslationOnEveryRevalidation() async throws {
        let id = "m-vue-unique-fermee"
        try await actor.upsertFromAPIMessages([try served(id: id, extra: Self.viewOnceFlags)])

        try await actor.upsertFromAPIMessages([try served(id: id, extra: Self.viewOnceFlags)])

        XCTAssertEqual(try actor.translations(for: id).map(\.translatedContent), ["Hello"], "décision #19353 : elle garde ses enrichissements")
    }

    // MARK: - La suppression locale et le balayage des éphémères

    func test_markDeleted_erasesTheNeighboursOfTheTombstone() async throws {
        let id = "m-pierre-tombale"
        try await actor.upsertFromAPIMessages([try served(id: id)])
        try seedNeighbours(of: id)

        try await actor.markDeleted(localId: id, deletedAt: Date())

        try assertNothingReadableRemains(of: id, "pierre tombale")
        XCTAssertNotNil(try row(id).deletedAt, "la ligne reste : seule l'enveloppe survit")
    }

    func test_deleteExpiredEphemeral_takesTheChildRowsWithTheMessage() async throws {
        let id = "m-eph-echu"
        try await actor.upsertFromAPIMessages([try served(id: id, extra: Self.futureExpiry)])
        XCTAssertEqual(try actor.translations(for: id).count, 1, "vivant : il garde sa traduction")
        try dbQueue.write { db in
            try db.execute(sql: "UPDATE messages SET expiresAt = ? WHERE localId = ?", arguments: [Date(timeIntervalSince1970: 1_000), id])
        }

        try await actor.deleteExpiredEphemeral(before: Date())

        XCTAssertNil(try dbQueue.read { db in try MessageRecord.fetchOne(db, key: id) }, "la ligne est retirée")
        XCTAssertTrue(try actor.translations(for: id).isEmpty, "ses lignes filles partent avec elle")
    }
}
