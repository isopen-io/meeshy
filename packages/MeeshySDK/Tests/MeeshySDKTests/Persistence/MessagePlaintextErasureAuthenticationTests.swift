import XCTest
import GRDB
@testable import MeeshySDK

/// **Une annonce du serveur ne vide jamais le coffre** (#13060). Un serveur
/// compromis peut annoncer qu'un message chiffré est supprimé pour tous, que sa
/// vue unique est consommée ou qu'il a été retiré pour moi depuis un autre
/// appareil, par la socket ou par une page REST : la ligne se masque, le clair
/// reste au coffre. Seuls un geste de cet appareil ou un signal authentifié de
/// l'auteur (ou de MES appareils pour la vue unique) le retirent.
final class MessagePlaintextErasureAuthenticationTests: XCTestCase {
    private let conversationId = "6ab16c0b67c87be0efa9a50e"

    private func makeActor() throws -> (MessagePersistenceActor, DatabaseQueue) {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return (MessagePersistenceActor(dbWriter: queue, currentUserId: "u-me"), queue)
    }

    private func sealedRow(_ id: String, maxViewOnce: Int? = nil) -> MessageRecord {
        var record = MessageRecordFactory.make(localId: id, conversationId: conversationId, senderId: "u-peer", content: "[Encrypted]", state: .sent)
        record.serverId = id
        record.isEncrypted = true
        record.encryptionMode = "e2ee"
        record.maxViewOnceCount = maxViewOnce
        return record
    }

    private func insert(_ record: MessageRecord, into queue: DatabaseQueue) throws {
        try queue.write { db in try record.insert(db) }
    }

    private func served(_ json: String) throws -> APIMessage {
        try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: Data(json.utf8))
    }

    private func erasable(_ actor: MessagePersistenceActor) async throws -> [String] {
        try await actor.plaintextErasures.pending()
    }

    func test_aForgedDeletionBySocket_masksTheMessage_andErasesNothing() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow("srv_1"), into: queue)

        try await actor.markDeleted(localId: "srv_1", deletedAt: Date(), sparingOpenedViewOnce: true)

        let row = try await queue.read { db in try MessageRecord.fetchOne(db, key: "srv_1") }
        XCTAssertNotNil(row?.deletedAt, "la bulle se masque")
        let queued = try await erasable(actor)
        XCTAssertEqual(queued, [])
        let erased = try await actor.plaintextErasures.isErased("srv_1")
        XCTAssertFalse(erased, "une enveloppe rouverte plus tard garde son clair")
    }

    func test_aForgedDeletionByARestPage_erasesNothing() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow("srv_2"), into: queue)

        try await actor.upsertFromAPIMessages([served("""
        {"id":"srv_2","conversationId":"\(conversationId)","senderId":"u-peer","content":"","isEncrypted":true,
         "encryptionMode":"e2ee","messageType":"text","messageSource":"user",
         "createdAt":"2026-10-25T12:00:00.000Z","deletedAt":"2026-10-25T12:01:00.000Z"}
        """)])

        let queued = try await erasable(actor)
        XCTAssertEqual(queued, [])
    }

    func test_aForgedViewOnceConsumption_erasesNothing_bySocketNorByRest() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow("srv_3", maxViewOnce: 1), into: queue)
        try insert(sealedRow("srv_4", maxViewOnce: 1), into: queue)

        try await actor.markViewOnceOpened(localId: "srv_3")
        try await actor.upsertFromAPIMessages([served("""
        {"id":"srv_4","conversationId":"\(conversationId)","senderId":"u-peer","content":"","isEncrypted":true,
         "encryptionMode":"e2ee","messageType":"text","messageSource":"user","consumedByMe":true,
         "createdAt":"2026-10-25T12:00:00.000Z"}
        """)])

        let queued = try await erasable(actor)
        XCTAssertEqual(queued, [], "le serveur ne consomme pas une vue unique avant que le destinataire l'ait vue")
    }

    func test_aForgedRemovalForMeFromAnotherDevice_erasesNothing() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow("srv_5"), into: queue)

        try await actor.purgeMessages(ids: ["srv_5"])

        let queued = try await erasable(actor)
        XCTAssertEqual(queued, [])
    }

    func test_aForgedExpiryBySocket_erasesNothing() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow("srv_11"), into: queue)

        try await actor.markDeleted(localId: "srv_11", deletedAt: Date(), expired: true)

        let queued = try await erasable(actor)
        XCTAssertEqual(queued, [], "un serveur ne fait pas effacer un clair en le déclarant échu")
    }

    func test_aForgedExpiryDateSweptLocally_erasesNothing() async throws {
        let (actor, queue) = try makeActor()
        var row = sealedRow("srv_12")
        row.expiresAt = Date().addingTimeInterval(-60)
        try insert(row, into: queue)

        try await actor.deleteExpiredEphemeral(before: Date())

        let queued = try await erasable(actor)
        XCTAssertEqual(queued, [], "une échéance servie par la passerelle n'authentifie pas l'effacement (#13103)")
    }

    func test_aForgedConfirmationOfNothing_erasesNothing() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow("srv_6"), into: queue)
        try await actor.markDeleted(localId: "srv_6", deletedAt: Date())

        try await actor.confirmDeletion(localId: "srv_6")

        let queued = try await erasable(actor)
        XCTAssertEqual(queued, [], "confirmer une annonce n'en fait pas un geste")
    }

    func test_myOwnGesture_erases() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow("srv_7"), into: queue)
        try insert(sealedRow("srv_8", maxViewOnce: 1), into: queue)

        try await actor.markDeletedAwaitingConfirmation(localId: "srv_7", deletedAt: Date())
        try await actor.confirmDeletion(localId: "srv_7")
        try await actor.markViewOnceOpened(localId: "srv_8", origin: .authenticated)

        let queued = Set(try await erasable(actor))
        XCTAssertEqual(queued, ["srv_7", "srv_8"])
    }

    func test_anAuthenticatedSignalAfterAForgedAnnouncement_erases() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow("srv_9"), into: queue)
        try await actor.markDeleted(localId: "srv_9", deletedAt: Date())

        try await actor.markDeleted(localId: "srv_9", deletedAt: Date(), origin: .authenticated)

        let queued = try await erasable(actor)
        XCTAssertEqual(queued, ["srv_9"], "la suppression signée de l'auteur, elle, vide le coffre")
    }

    func test_aDeletionAnnouncedBeforeItsRow_staysAnnounced_whenTheRowArrives() async throws {
        let (actor, queue) = try makeActor()
        try await actor.markDeleted(localId: "srv_10", deletedAt: Date())

        try insert(sealedRow("srv_10"), into: queue)
        await actor.replayPendingRowEvents(for: ["srv_10"])

        let queued = try await erasable(actor)
        XCTAssertEqual(queued, [])
    }

    func test_theMigration_keepsInQueueADeletionNotYetErased_unauthenticated() throws {
        let queue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        migrator.register(Array(MessageDatabaseMigrations.all.dropLast()))
        try migrator.migrate(queue)
        try queue.write { db in
            try db.execute(sql: "INSERT INTO e2ee_plaintext_erasures(messageKey, cause) VALUES ('srv_a', 'deleted'), ('srv_b', 'expired')")
            try db.execute(sql: "INSERT INTO e2ee_plaintext_erasures(messageKey, cause, acknowledgedAt) VALUES ('srv_c', 'deleted', '2026-10-20 10:00:00.000')")
        }

        try MessageDatabaseMigrations.runAll(on: queue)

        let authenticated = try queue.read { db in
            try String.fetchAll(db, sql: "SELECT messageKey FROM e2ee_plaintext_erasures WHERE authenticated = 1 ORDER BY messageKey")
        }
        XCTAssertEqual(authenticated, ["srv_c"], "une suppression ou une échéance encore en file avant ce lot pouvait venir du serveur : son clair reste")
    }
}
