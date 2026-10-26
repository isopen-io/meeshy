import XCTest
import GRDB
@testable import MeeshySDK

/// Dans une conversation chiffrée de bout en bout, la suppression pour tous et
/// les réactions voyagent en signaux chiffrés (#13142) : la passerelle n'en sait
/// rien. Une page REST qu'elle sert ne peut donc ni RESSUSCITER un message que
/// son auteur a supprimé, ni effacer les réactions appliquées sur l'appareil.
final class EndToEndSignalMergeTests: XCTestCase {
    private let conversationId = "6ab16c0b67c87be0efa9a50e"

    private func makeActor() throws -> (MessagePersistenceActor, DatabaseQueue) {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return (MessagePersistenceActor(dbWriter: queue, currentUserId: "u-me"), queue)
    }

    private func sealedRow(_ id: String, mode: String = "e2ee") throws -> MessageRecord {
        var record = MessageRecordFactory.make(localId: id, conversationId: conversationId, senderId: "u-peer", content: "[Encrypted]", state: .sent)
        record.serverId = id
        record.isEncrypted = true
        record.encryptionMode = mode
        return record
    }

    private func page(_ id: String, mode: String = "e2ee") throws -> APIMessage {
        try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: Data("""
        {"id":"\(id)","conversationId":"\(conversationId)","senderId":"u-peer","content":"","isEncrypted":true,
         "encryptionMode":"\(mode)","messageType":"text","messageSource":"user","reactions":[],
         "createdAt":"2026-10-25T12:00:00.000Z","updatedAt":"2026-10-25T12:05:00.000Z"}
        """.utf8))
    }

    func test_aServedPageDoesNotResurrectAMessageItsAuthorDeletedForEveryone() async throws {
        let (actor, queue) = try makeActor()
        let seeded = try sealedRow("srv_1")
        try await queue.write { db in try seeded.insert(db) }
        try await actor.markDeleted(localId: "srv_1", deletedAt: Date(), origin: .authenticated)

        try await actor.upsertFromAPIMessages([page("srv_1")])

        let row = try await queue.read { db in try MessageRecord.fetchOne(db, key: "srv_1") }
        XCTAssertNotNil(row?.deletedAt)
    }

    func test_aServedPageKeepsTheReactionsAppliedFromSignals() async throws {
        let (actor, queue) = try makeActor()
        let seeded = try sealedRow("srv_2")
        try await queue.write { db in try seeded.insert(db) }
        try await actor.appendReaction(
            localId: "srv_2", reactionId: "sig_1", messageId: "srv_2", participantId: nil, emoji: "👍", ownerUserId: "u-peer"
        )

        try await actor.upsertFromAPIMessages([page("srv_2")])

        let row = try await queue.read { db in try MessageRecord.fetchOne(db, key: "srv_2") }
        let reactions = try row?.reactionsJson.map { try JSONDecoder().decode([MeeshyReaction].self, from: $0) } ?? []
        XCTAssertEqual(reactions.map(\.emoji), ["👍"])
    }

    func test_aClearConversation_stillTakesTheServersReactions() async throws {
        let (actor, queue) = try makeActor()
        let seeded = try sealedRow("srv_3", mode: "server")
        try await queue.write { db in try seeded.insert(db) }
        try await actor.appendReaction(
            localId: "srv_3", reactionId: "r1", messageId: "srv_3", participantId: nil, emoji: "👍", ownerUserId: "u-peer"
        )

        try await actor.upsertFromAPIMessages([page("srv_3", mode: "server")])

        let row = try await queue.read { db in try MessageRecord.fetchOne(db, key: "srv_3") }
        let reactions = try row?.reactionsJson.map { try JSONDecoder().decode([MeeshyReaction].self, from: $0) } ?? []
        XCTAssertEqual(reactions.map(\.emoji), [], "hors bout en bout, la passerelle fait foi")
    }
}

final class SignalTargetConversationTests: XCTestCase {
    func test_eachMessageIsLocatedInItsConversation_byLocalOrServerId() async throws {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        let actor = MessagePersistenceActor(dbWriter: queue, currentUserId: "u-me")
        var mine = MessageRecordFactory.make(localId: "cid_1", conversationId: "conv-a", senderId: "u-me", content: "[Encrypted]", state: .sent)
        mine.serverId = "srv_1"
        let sent = mine
        let other = MessageRecordFactory.make(localId: "srv_2", conversationId: "conv-b", senderId: "u-peer", content: "[Encrypted]", state: .sent)
        try await queue.write { db in
            try sent.insert(db)
            try other.insert(db)
        }

        let located = try await actor.conversationIds(of: ["srv_1", "cid_1", "srv_2", "inconnu"])

        XCTAssertEqual(located, ["srv_1": "conv-a", "cid_1": "conv-a", "srv_2": "conv-b"])
    }
}
