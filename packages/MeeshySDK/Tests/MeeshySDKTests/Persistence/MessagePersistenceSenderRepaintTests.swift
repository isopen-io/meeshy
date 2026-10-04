import XCTest
import GRDB
@testable import MeeshySDK

/// #9307 — le fil ouvert ET le fil en cache lisent la table `messages` : un
/// pair renommé doit y être réécrit pour que la réouverture serve son nouveau
/// nom sans réseau.
final class MessagePersistenceSenderRepaintTests: XCTestCase {

    private func makeActor() throws -> (MessagePersistenceActor, DatabaseQueue) {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return (MessagePersistenceActor(dbWriter: queue, currentUserId: "u-me"), queue)
    }

    private func insert(_ actor: MessagePersistenceActor, id: String, conv: String, sender: String) async throws {
        var record = MessageRecordFactory.make(localId: id, conversationId: conv, senderId: sender, state: .sent)
        record.serverId = id
        record.senderName = sender == "u-bob" ? "Bob" : "Alice"
        record.senderUsername = sender == "u-bob" ? "bob" : "alice"
        record.senderAvatarURL = "https://cdn/\(sender).png"
        try await actor.insertOptimistic(record)
    }

    private func row(_ queue: DatabaseQueue, _ id: String) throws -> MessageRecord? {
        try queue.read { db in try MessageRecord.filter(Column("localId") == id).fetchOne(db) }
    }

    private func event(_ changes: String) throws -> UserUpdatedEvent {
        try JSONDecoder().decode(UserUpdatedEvent.self, from: Data(#"{"userId":"u-bob","changes":\#(changes)}"#.utf8))
    }

    func test_repaintSender_renamesThePeerInEveryConversation() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "m1", conv: "c-group", sender: "u-bob")
        try await insert(actor, id: "m2", conv: "c-other", sender: "u-bob")

        let touched = try await actor.repaintSender(try event(
            #"{"displayName":"Bobby","firstName":null,"lastName":null,"username":"bobby","avatar":"https://cdn/new.png"}"#
        ))

        XCTAssertEqual(touched, ["c-group", "c-other"])
        XCTAssertEqual(try row(queue, "m1")?.senderName, "Bobby")
        XCTAssertEqual(try row(queue, "m1")?.senderUsername, "bobby")
        XCTAssertEqual(try row(queue, "m2")?.senderAvatarURL, "https://cdn/new.png")
    }

    func test_repaintSender_leavesOtherSendersUntouched() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "m1", conv: "c-group", sender: "u-bob")
        try await insert(actor, id: "m2", conv: "c-group", sender: "u-alice")
        let aliceVersion = try row(queue, "m2")?.changeVersion

        _ = try await actor.repaintSender(try event(#"{"displayName":"Bobby","username":"bobby"}"#))

        XCTAssertEqual(try row(queue, "m2")?.senderName, "Alice")
        XCTAssertEqual(try row(queue, "m2")?.changeVersion, aliceVersion, "une bulle intacte ne se re-rend pas")
    }

    func test_repaintSender_bumpsChangeVersionOfTouchedRows() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "m1", conv: "c-group", sender: "u-bob")
        let before = try XCTUnwrap(try row(queue, "m1")?.changeVersion)

        _ = try await actor.repaintSender(try event(#"{"avatar":"https://cdn/new.png"}"#))

        XCTAssertGreaterThan(try XCTUnwrap(try row(queue, "m1")?.changeVersion), before)
    }

    func test_repaintSender_nothingChanges_touchesNoConversation() async throws {
        let (actor, _) = try makeActor()
        try await insert(actor, id: "m1", conv: "c-group", sender: "u-bob")

        let touched = try await actor.repaintSender(try event(#"{"avatar":"https://cdn/u-bob.png"}"#))

        XCTAssertTrue(touched.isEmpty)
    }
}
