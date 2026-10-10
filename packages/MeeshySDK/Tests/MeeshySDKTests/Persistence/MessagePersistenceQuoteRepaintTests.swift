import XCTest
import GRDB
@testable import MeeshySDK

/// #9371 — à `user:updated`, `repaintSender` repeint aussi les citations
/// (`replyToJson`) et les références de transfert (`forwardedFromJson`) qui
/// GRAVENT l'id du pair, toutes conversations confondues. Une citation
/// ancienne sans id reste au nom gravé.
final class MessagePersistenceQuoteRepaintTests: XCTestCase {

    private func makeActor() throws -> (MessagePersistenceActor, DatabaseQueue) {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return (MessagePersistenceActor(dbWriter: queue, currentUserId: "u-me"), queue)
    }

    private func ingest(_ actor: MessagePersistenceActor, id: String, conv: String, extra: String) async throws {
        let json = """
        {"id":"\(id)","conversationId":"\(conv)","senderId":"p-alice","content":"ma réponse",
         "sender":{"id":"p-alice","userId":"u-alice","displayName":"Alice"},
         "createdAt":"2026-10-04T10:00:00Z","updatedAt":"2026-10-04T10:00:00Z",\(extra)}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        try await actor.upsertFromAPIMessages([try decoder.decode(APIMessage.self, from: Data(json.utf8))])
    }

    private func reply(sender: String) -> String {
        #""replyToId":"q1","replyTo":{"id":"q1","content":"Salut","sender":\#(sender)}"#
    }

    private static let bob = #"{"id":"p-bob","userId":"u-bob","displayName":"Bob","avatar":"https://cdn/old.png"}"#
    private static let bobWithoutId = #"{"id":"p-bob","displayName":"Bob","avatar":"https://cdn/old.png"}"#

    private func row(_ queue: DatabaseQueue, _ id: String) throws -> MessageRecord? {
        try queue.read { db in try MessageRecord.filter(Column("localId") == id).fetchOne(db) }
    }

    private func quote(_ queue: DatabaseQueue, _ id: String) throws -> ReplyReference? {
        try row(queue, id)?.replyToJson.flatMap { try? JSONDecoder().decode(ReplyReference.self, from: $0) }
    }

    private func forward(_ queue: DatabaseQueue, _ id: String) throws -> ForwardReference? {
        try row(queue, id)?.forwardedFromJson.flatMap { try? JSONDecoder().decode(ForwardReference.self, from: $0) }
    }

    private func renamed() throws -> UserUpdatedEvent {
        try JSONDecoder().decode(UserUpdatedEvent.self, from: Data(
            #"{"userId":"u-bob","changes":{"displayName":"Bobby","firstName":null,"lastName":null,"username":"bobby","avatar":"https://cdn/new.png"}}"#.utf8
        ))
    }

    func test_upsert_gravesTheQuotedAuthorIdInTheBlob() async throws {
        let (actor, queue) = try makeActor()
        try await ingest(actor, id: "m1", conv: "c-group", extra: reply(sender: Self.bob))

        XCTAssertEqual(try quote(queue, "m1")?.authorUserId, "u-bob")
    }

    func test_repaintSender_quoteOfThePeer_followsTheRename() async throws {
        let (actor, queue) = try makeActor()
        try await ingest(actor, id: "m1", conv: "c-group", extra: reply(sender: Self.bob))
        let before = try XCTUnwrap(try row(queue, "m1")?.changeVersion)

        let touched = try await actor.repaintSender(try renamed())

        XCTAssertEqual(touched, ["c-group"])
        XCTAssertEqual(try quote(queue, "m1")?.authorName, "Bobby")
        XCTAssertEqual(try quote(queue, "m1")?.authorAvatarUrl, "https://cdn/new.png")
        XCTAssertEqual(try row(queue, "m1")?.senderName, "Alice", "la citante n'est pas le pair renommé")
        XCTAssertGreaterThan(try XCTUnwrap(try row(queue, "m1")?.changeVersion), before)
    }

    func test_repaintSender_forwardOfThePeer_followsTheRename() async throws {
        let (actor, queue) = try makeActor()
        try await ingest(actor, id: "m1", conv: "c-other",
                         extra: #""forwardedFromId":"f1","forwardedFrom":{"id":"f1","content":"hello","sender":\#(Self.bob)}"#)

        let touched = try await actor.repaintSender(try renamed())

        XCTAssertEqual(touched, ["c-other"])
        XCTAssertEqual(try forward(queue, "m1")?.senderName, "Bobby")
        XCTAssertEqual(try forward(queue, "m1")?.senderAvatar, "https://cdn/new.png")
    }

    func test_repaintSender_legacyQuoteWithoutId_keepsTheGravedName() async throws {
        let (actor, queue) = try makeActor()
        try await ingest(actor, id: "m1", conv: "c-group", extra: reply(sender: Self.bobWithoutId))
        let before = try row(queue, "m1")?.changeVersion

        let touched = try await actor.repaintSender(try renamed())

        XCTAssertTrue(touched.isEmpty)
        XCTAssertEqual(try quote(queue, "m1")?.authorName, "Bob")
        XCTAssertEqual(try row(queue, "m1")?.changeVersion, before, "une bulle intacte ne se re-rend pas")
    }

    func test_repaintSender_quoteOfAnotherPeer_isUntouched() async throws {
        let (actor, queue) = try makeActor()
        try await ingest(actor, id: "m1", conv: "c-group",
                         extra: reply(sender: #"{"id":"p-carol","userId":"u-carol","displayName":"Carol"}"#))

        let touched = try await actor.repaintSender(try renamed())

        XCTAssertTrue(touched.isEmpty)
        XCTAssertEqual(try quote(queue, "m1")?.authorName, "Carol")
    }
}
