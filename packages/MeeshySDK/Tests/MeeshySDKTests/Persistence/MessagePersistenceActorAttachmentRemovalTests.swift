import XCTest
import GRDB
@testable import MeeshySDK

final class MessagePersistenceActorAttachmentRemovalTests: XCTestCase {

    private var actor: MessagePersistenceActor!

    override func setUp() async throws {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        actor = MessagePersistenceActor(dbWriter: queue)
    }

    private func insert(
        id: String = "m1", conversationId: String = "c1", content: String?, pieces: [String], encrypted: Bool = false
    ) async throws {
        var record = MessageRecordFactory.make(localId: id, conversationId: conversationId, content: content)
        record.isEncrypted = encrypted
        record.attachmentsJson = try JSONEncoder().encode(pieces.map { MeeshyMessageAttachment(id: $0, mimeType: "image/jpeg") })
        try await actor.insertOptimistic(record)
    }

    private func remove(_ attachmentId: String, from messageId: String, in conversationId: String, at date: Date) async throws -> AttachmentRemovalOutcome {
        try await MessageAttachmentRemovalStore.remove(
            attachmentId: attachmentId, fromMessage: messageId, inConversation: conversationId, at: date, using: actor)
    }

    private func row(_ conversationId: String = "c1") throws -> MessageRecord {
        try XCTUnwrap(try actor.messages(for: conversationId, limit: 10).first)
    }

    private func attachmentIds(_ record: MessageRecord) throws -> [String] {
        let data = try XCTUnwrap(record.attachmentsJson)
        return try JSONDecoder().decode([MeeshyMessageAttachment].self, from: data).map(\.id)
    }

    func test_removeAttachment_dropsThePieceAndKeepsTheText() async throws {
        try await insert(content: "légende", pieces: ["a", "b"])

        let outcome = try await remove("a", from: "m1", in: "c1", at: Date())

        XCTAssertEqual(outcome, .removed)
        XCTAssertEqual(try attachmentIds(try row()), ["b"])
        XCTAssertNil(try row().deletedAt)
    }

    func test_removeAttachment_lastPieceOfACaptionedMessage_keepsTheBubble() async throws {
        try await insert(content: "légende", pieces: ["a"])

        let outcome = try await remove("a", from: "m1", in: "c1", at: Date())

        XCTAssertEqual(outcome, .removed)
        XCTAssertEqual(try attachmentIds(try row()), [])
        XCTAssertNil(try row().deletedAt)
    }

    func test_removeAttachment_lastPieceWithoutText_becomesATombstoneLikeALocalDeletion() async throws {
        try await insert(content: "  ", pieces: ["a"])
        let at = Date(timeIntervalSince1970: 1_800_000_000)

        let outcome = try await remove("a", from: "m1", in: "c1", at: at)

        XCTAssertEqual(outcome, .tombstoned)
        XCTAssertEqual(try row().deletedAt, at)
        XCTAssertNil(try row().content)
    }

    func test_removeAttachment_isIdempotent() async throws {
        try await insert(content: "x", pieces: ["a", "b"])
        _ = try await remove("a", from: "m1", in: "c1", at: Date())
        let version = try row().changeVersion

        let again = try await remove("a", from: "m1", in: "c1", at: Date())

        XCTAssertEqual(again, .unchanged)
        XCTAssertEqual(try row().changeVersion, version, "un rejeu n'écrit pas")
    }

    func test_removeAttachment_forgedConversation_neverErasesAMessageOfAnother() async throws {
        try await insert(conversationId: "c1", content: nil, pieces: ["a"])

        let outcome = try await remove("a", from: "m1", in: "autre", at: Date())

        XCTAssertEqual(outcome, .unchanged)
        XCTAssertEqual(try attachmentIds(try row()), ["a"])
        XCTAssertNil(try row().deletedAt)
    }

    func test_removeAttachment_unknownMessage_doesNothing() async throws {
        let outcome = try await remove("a", from: "ghost", in: "c1", at: Date())
        XCTAssertEqual(outcome, .unchanged)
    }

    func test_removeAttachment_encryptedMessage_neverBecomesATombstone() async throws {
        try await insert(content: nil, pieces: ["a"], encrypted: true)

        let outcome = try await remove("a", from: "m1", in: "c1", at: Date())

        XCTAssertEqual(outcome, .removed)
        XCTAssertNil(try row().deletedAt, "le texte d'un message chiffré est au coffre, pas dans la ligne")
    }
}
