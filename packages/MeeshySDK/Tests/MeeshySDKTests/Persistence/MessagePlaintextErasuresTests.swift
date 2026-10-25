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
        Set(try await actor.pendingPlaintextErasures(recordedBefore: Date().addingTimeInterval(1)))
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

    func test_aRecentErasure_waitsItsGrace_andAnAcknowledgedOneLeavesTheQueue() async throws {
        let (actor, queue) = try makeActor()
        try insert(sealedRow(localId: "srv_10", serverId: "srv_10"), into: queue)
        try await actor.markDeleted(localId: "srv_10", deletedAt: Date())

        let tooEarly = try await actor.pendingPlaintextErasures(recordedBefore: Date().addingTimeInterval(-30))
        XCTAssertEqual(tooEarly, [])
        let oldest = try await actor.oldestPendingPlaintextErasure()
        XCTAssertNotNil(oldest)

        try await actor.acknowledgePlaintextErasures(["srv_10"])

        let recorded = try await pending(actor)
        XCTAssertEqual(recorded, [])
    }
}
