import XCTest
import GRDB
@testable import MeeshySDK

/// Un message effacé sur cet appareil inscrit ses identifiants, pour que le
/// coffre E2EE en retire le clair (#13001) ; un retrait qui n'est pas un
/// effacement n'inscrit rien, le coffre étant la seule copie de ce clair.
final class MessagePlaintextErasuresTests: XCTestCase {
    private let conversationId = "6ab16c0b67c87be0efa9a50e"

    private func makeActor() throws -> (MessagePersistenceActor, DatabaseQueue) {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return (MessagePersistenceActor(dbWriter: queue, currentUserId: "u-me"), queue)
    }

    private func sealedRow(localId: String, serverId: String?, expiresAt: Date? = nil, maxViewOnce: Int? = nil) -> MessageRecord {
        var record = MessageRecordFactory.make(localId: localId, conversationId: conversationId, senderId: "u-peer", content: "[Encrypted]", state: .sent)
        record.serverId = serverId
        record.isEncrypted = true
        record.encryptionMode = "e2ee"
        record.expiresAt = expiresAt
        record.maxViewOnceCount = maxViewOnce
        return record
    }

    private func insert(_ records: MessageRecord..., into queue: DatabaseQueue) throws {
        try queue.write { db in try records.forEach { try $0.insert(db) } }
    }

    private func pending(_ actor: MessagePersistenceActor) async throws -> Set<String> {
        Set(try await actor.plaintextErasures.pending())
    }

    func test_aMessageDeletedForEveryone_recordsItsLocalAndServerIds() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow(localId: "cid_1", serverId: "srv_1"), into: queue)

        try await actor.markDeleted(localId: "srv_1", deletedAt: Date())

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, ["cid_1", "srv_1"])
    }

    func test_aDeletionArrivingByAMergedRecord_isRecordedToo() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow(localId: "srv_2", serverId: "srv_2"), into: queue)

        try await queue.write { db in
            var record = try XCTUnwrap(MessageRecord.fetchOne(db, key: "srv_2"))
            record.deletedAt = Date()
            try record.update(db)
        }

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, ["srv_2"])
    }

    func test_anOpenedViewOnce_isRecorded() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow(localId: "srv_3", serverId: "srv_3", maxViewOnce: 1), into: queue)

        try await actor.markViewOnceOpened(localId: "srv_3")

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, ["srv_3"])
    }

    func test_anExpiredEphemeral_isRecorded_andALiveOneIsNot() async throws {
        let (actor, queue) = try makeActor()
        try insert(
            sealedRow(localId: "srv_4", serverId: "srv_4", expiresAt: Date().addingTimeInterval(-5)),
            sealedRow(localId: "srv_5", serverId: "srv_5", expiresAt: Date().addingTimeInterval(3600)),
            into: queue
        )

        try await actor.deleteExpiredEphemeral(before: Date())

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, ["srv_4"])
    }

    func test_aMessageRemovedForMe_isRecorded() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow(localId: "cid_6", serverId: "srv_6"), into: queue)

        try await actor.purgeMessages(ids: ["srv_6"])

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, ["cid_6", "srv_6"])
    }

    func test_theLocalRetention_andAnAccessRevocation_recordNothing() async throws {
        let (actor, queue) = try makeActor()
        var old = sealedRow(localId: "srv_7", serverId: "srv_7")
        old.createdAt = Date().addingTimeInterval(-400 * 86_400)
        try insert(old, sealedRow(localId: "srv_8", serverId: "srv_8"), into: queue)

        try await actor.purgeOldMessages()
        try await actor.deleteAll(conversationId: conversationId)

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, [], "le coffre est la seule copie : seul un effacement le vide")
    }

    func test_aCancelledDeletion_withdrawsItsRecord() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow(localId: "cid_9", serverId: "srv_9"), into: queue)
        try await actor.markDeleted(localId: "srv_9", deletedAt: Date())

        try await actor.markUndeleted(localId: "srv_9")

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, [])
    }

    func test_aLocalDeletion_waitsForTheServer_thenAnAcknowledgedOneLeavesTheQueue() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow(localId: "cid_10", serverId: "srv_10"), into: queue)
        try await actor.markDeletedAwaitingConfirmation(localId: "cid_10", deletedAt: Date())

        let unconfirmed = try await pending(actor)
        XCTAssertEqual(unconfirmed, [], "refusée plus tard, elle se rétablirait sans son clair")

        try await actor.confirmDeletion(localId: "cid_10")
        let confirmed = try await pending(actor)
        XCTAssertEqual(confirmed, ["cid_10", "srv_10"])

        try await actor.plaintextErasures.acknowledge(["cid_10", "srv_10"])
        let left = try await pending(actor)
        XCTAssertEqual(left, [])
    }

    func test_theServersEchoOfALocalDeletion_confirmsIt() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow(localId: "cid_17", serverId: "srv_17"), into: queue)
        try await actor.markDeletedAwaitingConfirmation(localId: "cid_17", deletedAt: Date())

        try await actor.markDeleted(localId: "srv_17", deletedAt: Date())

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, ["cid_17", "srv_17"])
    }

    func test_aServedPageCarryingTheDeletion_confirmsALocalOne() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow(localId: "srv_18", serverId: "srv_18"), into: queue)
        try await actor.markDeletedAwaitingConfirmation(localId: "srv_18", deletedAt: Date())
        let api = try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: Data("""
        {"id":"srv_18","conversationId":"\(conversationId)","senderId":"u-peer","content":"","isEncrypted":true,
         "encryptionMode":"e2ee","messageType":"text","messageSource":"user",
         "createdAt":"2026-10-25T12:00:00.000Z","deletedAt":"2026-10-25T12:01:00.000Z"}
        """.utf8))

        try await actor.upsertFromAPIMessages([api])

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, ["srv_18"])
    }

    func test_theMigration_recordsTheTombstonesAlreadyStored() throws {
        let queue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        migrator.register(Array(MessageDatabaseMigrations.all.dropLast()))
        try migrator.migrate(queue)
        var tombstone = sealedRow(localId: "srv_19", serverId: "srv_19")
        tombstone.deletedAt = Date()
        try insert(tombstone, into: queue)

        try MessageDatabaseMigrations.runAll(on: queue)

        let recorded = try queue.read { db in try String.fetchAll(db, sql: "SELECT messageKey FROM e2ee_plaintext_erasures") }
        XCTAssertEqual(recorded, ["srv_19"])
    }

    func test_aRowInsertedAlreadyDeleted_isRecorded() async throws {
        let (actor, queue) = try makeActor()
        var tombstone = sealedRow(localId: "srv_11", serverId: "srv_11")
        tombstone.deletedAt = Date()

        try insert(tombstone, into: queue)

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, ["srv_11"], "une synchro tardive apporte un message déjà supprimé")
    }

    func test_aRowInsertedAlreadyOpened_isRecorded() async throws {
        let (actor, queue) = try makeActor()
        var opened = sealedRow(localId: "cid_12", serverId: "srv_12", maxViewOnce: 1)
        opened.sealAsOpenedViewOnce(at: Date())

        try insert(opened, into: queue)

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, ["cid_12", "srv_12"])
    }

    func test_aDeletionOrAnOpening_withoutLocalRow_isRecordedByItsId() async throws {
        let (actor, _) = try makeActor()

        try await actor.markDeleted(localId: "srv_13", deletedAt: Date())
        try await actor.markViewOnceOpened(localId: "srv_14")

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, ["srv_13", "srv_14"], "le coffre peut tenir le clair d'un message que la base n'a pas")
    }

    func test_restoringAConsumedViewOnce_keepsItsErasure() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow(localId: "srv_15", serverId: "srv_15", maxViewOnce: 1), into: queue)
        try await actor.markViewOnceOpened(localId: "srv_15")
        try await actor.markDeleted(localId: "srv_15", deletedAt: Date())

        try await actor.markUndeleted(localId: "srv_15")

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, ["srv_15"], "annuler la suppression ne rend pas le clair d'une vue unique consommée")
    }

    func test_restoringAnExpiredEphemeral_keepsItsErasure() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow(localId: "srv_16", serverId: "srv_16", expiresAt: Date().addingTimeInterval(-5)), into: queue)
        try await actor.markDeleted(localId: "srv_16", deletedAt: Date())

        try await actor.markUndeleted(localId: "srv_16")

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, ["srv_16"])
    }

    /// Audit (M-1) — une modification reçue avant sa ligne n'est pas une suppression.
    func test_anEditBeforeItsRow_recordsNothing() async throws {
        let (actor, _) = try makeActor()

        try await actor.markEdited(localId: "srv_20", newContent: "modifié", editedAt: Date())

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, [])
    }

    /// Audit (m-7) — un message en clair supprimé n'encombre pas la file.
    func test_aClearMessageDeleted_recordsNothing() async throws {
        let (actor, queue) = try makeActor()
        try insert(MessageRecordFactory.make(localId: "srv_21", conversationId: conversationId, content: "en clair", state: .sent), into: queue)

        try await actor.markDeleted(localId: "srv_21", deletedAt: Date())

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, [])
    }

    /// Audit (M-2) — un effacement retiré du coffre reste connu pendant la
    /// rétention des enveloppes, puis s'oublie.
    func test_anAcknowledgedErasure_staysKnown_untilItsRetentionEnds() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow(localId: "srv_22", serverId: "srv_22"), into: queue)
        try await actor.markDeleted(localId: "srv_22", deletedAt: Date())
        let now = Date()

        try await actor.plaintextErasures.acknowledge(["srv_22"], now: now)

        let left = try await pending(actor)
        XCTAssertEqual(left, [])
        let known = try await actor.plaintextErasures.isErased("srv_22")
        XCTAssertTrue(known)
        try await actor.plaintextErasures.acknowledge(["other"], now: now.addingTimeInterval(MessagePlaintextErasureQueue.retention + 1))
        let forgotten = try await actor.plaintextErasures.isErased("srv_22")
        XCTAssertFalse(forgotten)
    }
}
