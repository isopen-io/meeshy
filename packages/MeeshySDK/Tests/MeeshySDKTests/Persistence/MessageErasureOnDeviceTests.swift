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

    // MARK: - La loi et l'app jugent l'échéance par la même fonction

    func test_upsert_ephemeralExpiredByTheLocalDuration_erasesLikeTheAppRemovesIt() async throws {
        let id = "m-eph-duree"
        let extra = #","ephemeralDuration":7200"#
        let alive = APIMessageUpsert.Context(
            currentUserId: nil, preferredLanguages: [],
            ephemeralLedger: ErasureTestLedger(receptions: [id: Date().addingTimeInterval(-3_600)])
        )
        let dead = APIMessageUpsert.Context(
            currentUserId: nil, preferredLanguages: [],
            ephemeralLedger: ErasureTestLedger(receptions: [id: Date().addingTimeInterval(-10_800)])
        )
        let api = try served(id: id, extra: extra)
        let first = try dbQueue.write { db in try APIMessageUpsert.upsertOutcome([api], context: alive, in: db) }
        XCTAssertEqual(try actor.translations(for: id).count, 1, "une heure sur deux : il vit, il garde sa traduction")
        XCTAssertTrue(first.erasures.isEmpty, "rien à effacer tant qu'il vit")
        try seedNeighbours(of: id)

        let later = try dbQueue.write { db in try APIMessageUpsert.upsertOutcome([api], context: dead, in: db) }

        try assertNothingReadableRemains(of: id, "éphémère échu par la durée locale, sans échéance servie")
        XCTAssertEqual(later.erasures.map(\.messageId), [id], "les caches qui le doublaient sont prévenus")
        XCTAssertEqual(later.changedConversationIds, [Self.conversationId], "le fil se rafraîchit")
    }

    func test_upsert_deletedElsewhere_announcesTheErasureForTheCaches() async throws {
        let id = "m-annonce"
        try await actor.upsertFromAPIMessages([try served(id: id)])
        let api = try served(id: id, extra: #","deletedAt":"2026-11-17T11:00:00.000Z""#)
        let context = APIMessageUpsert.Context(currentUserId: nil, preferredLanguages: [])

        let outcome = try dbQueue.write { db in try APIMessageUpsert.upsertOutcome([api], context: context, in: db) }

        XCTAssertEqual(outcome.erasures.count, 1)
        XCTAssertEqual(outcome.erasures.first?.messageId, id)
        XCTAssertEqual(outcome.erasures.first?.conversationId, Self.conversationId)
        XCTAssertNotNil(outcome.erasures.first?.deletedAt)
    }

    // MARK: - Le balayage unique

    func test_sweep_purgesWhatSealedRowsStillKeep_andLeavesOrdinaryRowsAlone() async throws {
        try await actor.upsertFromAPIMessages([try served(id: "m-balai-ordinaire"), try served(id: "m-balai-supprime")])
        try seedNeighbours(of: "m-balai-ordinaire")
        try seedNeighbours(of: "m-balai-supprime")
        try dbQueue.write { db in
            try db.execute(sql: "UPDATE messages SET deletedAt = ? WHERE localId = ?", arguments: [Date(), "m-balai-supprime"])
        }

        let changed = try dbQueue.write { db in try MessageEnrichmentLaw.sweep(in: db, ledger: ErasureTestLedger(), now: Date()) }

        XCTAssertEqual(changed, 1, "une seule ligne était scellée")
        try assertNothingReadableRemains(of: "m-balai-supprime", "ligne supprimée avant la mise à jour")
        XCTAssertEqual(try actor.translations(for: "m-balai-ordinaire").count, 1)
        XCTAssertNotNil(try row("m-balai-ordinaire").attachmentsJson)
        let again = try dbQueue.write { db in try MessageEnrichmentLaw.sweep(in: db, ledger: ErasureTestLedger(), now: Date()) }
        XCTAssertEqual(again, 0, "un second balayage n'a plus rien à faire")
    }

    func test_theSweepRunsOnceAsAMigration_atTheFirstLaunchAfterTheUpdate() async throws {
        let legacy = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        MessageDatabaseMigrations.registerAll(in: &migrator)
        try migrator.migrate(legacy, upTo: "conversation_contiguity")
        let before = MessagePersistenceActor(dbWriter: legacy)
        try await before.upsertFromAPIMessages([try served(id: "m-legacy")])
        try legacy.write { db in
            try db.execute(sql: "UPDATE messages SET deletedAt = ?, locationJson = ? WHERE localId = ?", arguments: [Date(), "{}", "m-legacy"])
        }
        XCTAssertEqual(try before.translations(for: "m-legacy").count, 1, "l'appareil d'avant la mise à jour")

        try MessageDatabaseMigrations.runAll(on: legacy)

        XCTAssertTrue(try before.translations(for: "m-legacy").isEmpty)
        XCTAssertNil(try legacy.read { db in try MessageRecord.fetchOne(db, key: "m-legacy") }?.locationJson)
    }
}
