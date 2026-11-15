import XCTest
import GRDB
@testable import MeeshySDK

/// #7927 — ce qui doit se voir EN DIRECT dans le fil, écrit dans GRDB :
/// ma réaction d'un autre appareil, le retrait d'un tiers sur des lignes
/// rechargées, et les citations d'un message modifié ou supprimé.
final class MessagePersistenceRealtimeFollowTests: XCTestCase {

    private static let me = "user_me"

    private func makeActor() throws -> (MessagePersistenceActor, DatabaseQueue) {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return (MessagePersistenceActor(dbWriter: queue, currentUserId: Self.me), queue)
    }

    private func insert(
        _ actor: MessagePersistenceActor, id: String, conv: String = "conv_follow",
        content: String? = "Test", replyTo: ReplyReference? = nil, reactions: [MeeshyReaction] = []
    ) async throws {
        var record = MessageRecordFactory.make(localId: id, conversationId: conv, content: content, state: .sent)
        record.serverId = id
        record.replyToId = replyTo?.messageId
        record.replyToJson = try replyTo.map { try JSONEncoder().encode($0) }
        record.reactionsJson = reactions.isEmpty ? nil : try JSONEncoder().encode(reactions)
        record.reactionCount = reactions.count
        try await actor.insertOptimistic(record)
    }

    private func row(_ queue: DatabaseQueue, _ id: String) throws -> MessageRecord? {
        try queue.read { db in try MessageRecord.filter(Column("localId") == id).fetchOne(db) }
    }

    private func reactions(_ queue: DatabaseQueue, _ id: String) throws -> [MeeshyReaction] {
        try row(queue, id)?.reactionsJson
            .flatMap { try JSONDecoder().decode([MeeshyReaction].self, from: $0) } ?? []
    }

    private func quote(_ queue: DatabaseQueue, _ id: String) throws -> ReplyReference? {
        try row(queue, id)?.replyToJson.flatMap { try JSONDecoder().decode(ReplyReference.self, from: $0) }
    }

    private static func citation(of parent: String, text: String = "le code est 4271") -> ReplyReference {
        ReplyReference(messageId: parent, authorName: "Bob", previewText: text,
                       attachmentType: "image", attachmentThumbnailUrl: "https://cdn/p-t.jpg")
    }

    // MARK: - Réactions

    func test_appendReaction_mineFromOtherDevice_isKeyedByCurrentUserId() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "m1")

        try await actor.appendReaction(localId: "m1", reactionId: "r1", messageId: "m1",
            participantId: "participant_me", emoji: "👍", maxCount: 1, ownerUserId: Self.me)

        XCTAssertEqual(try reactions(queue, "m1").map(\.participantId), [Self.me])
    }

    func test_removeReaction_byOther_onReloadedUnattributedRows_calibratesCount() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "m2", reactions: [
            MeeshyReaction(messageId: "m2", participantId: nil, emoji: "👍"),
            MeeshyReaction(messageId: "m2", participantId: nil, emoji: "👍"),
        ])

        try await actor.removeReaction(localId: "m2", emoji: "👍", participantId: "participant_bob",
            ownerUserId: "user_bob", aggregateCount: 1, aggregateParticipantIds: nil)

        XCTAssertEqual(try reactions(queue, "m2").count, 1)
        XCTAssertEqual(try row(queue, "m2")?.reactionCount, 1)
    }

    func test_removeReaction_byOther_neverTouchesMine() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "m3", reactions: [
            MeeshyReaction(messageId: "m3", participantId: Self.me, emoji: "👍"),
        ])

        try await actor.removeReaction(localId: "m3", emoji: "👍", participantId: "participant_bob",
            ownerUserId: "user_bob", aggregateCount: 0, aggregateParticipantIds: [])

        XCTAssertEqual(try reactions(queue, "m3").map(\.participantId), [Self.me])
    }

    /// #7936 — la page REST sert `currentUserReactions` (camelCase) : dès le
    /// chargement, ma réaction s'écrit sous `currentUserId`, et mon propre
    /// retrait (le geste local) l'enlève sans toucher celle de l'autre.
    func test_upsert_servedCurrentUserReactions_areMineAndRemovableFromLoad() async throws {
        let (actor, queue) = try makeActor()
        let json = """
        {"id":"m4","conversationId":"conv_follow","senderId":"p-bob","content":"salut",
         "createdAt":"2026-09-25T10:00:00Z","updatedAt":"2026-09-25T10:00:00Z",
         "reactionSummary":{"👍":2},"reactionCount":2,"currentUserReactions":["👍"]}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        try await actor.upsertFromAPIMessages([try decoder.decode(APIMessage.self, from: Data(json.utf8))])

        XCTAssertEqual(try reactions(queue, "m4").filter { $0.participantId == Self.me }.count, 1)

        try await actor.removeReaction(localId: "m4", emoji: "👍", participantId: Self.me)

        let left = try reactions(queue, "m4")
        XCTAssertEqual(left.count, 1)
        XCTAssertNil(left.first?.participantId)
    }

    // MARK: - Citations

    func test_markDeleted_sealsEveryQuoteOfTheParent() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "parent")
        try await insert(actor, id: "reply", replyTo: Self.citation(of: "parent"))
        let before = try row(queue, "reply")?.changeVersion ?? 0

        try await actor.markDeleted(localId: "parent", deletedAt: Date(), sparingOpenedViewOnce: true)

        let sealed = try XCTUnwrap(try quote(queue, "reply"))
        XCTAssertTrue(sealed.isQuotedMessageDeleted)
        XCTAssertEqual(sealed.previewText, "")
        XCTAssertNil(sealed.attachmentThumbnailUrl)
        XCTAssertGreaterThan(try row(queue, "reply")?.changeVersion ?? 0, before,
            "la cellule citante doit se redessiner")
    }

    func test_markDeleted_leavesOtherQuotesUntouched() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "parent")
        try await insert(actor, id: "other")
        try await insert(actor, id: "reply", replyTo: Self.citation(of: "other", text: "intact"))

        try await actor.markDeleted(localId: "parent", deletedAt: Date())

        XCTAssertEqual(try quote(queue, "reply")?.previewText, "intact")
    }

    func test_markEdited_updatesQuotesOfTheParent() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "parent")
        try await insert(actor, id: "reply", replyTo: Self.citation(of: "parent", text: "avant"))
        let before = try row(queue, "reply")?.changeVersion ?? 0

        try await actor.markEdited(localId: "parent", newContent: "après", editedAt: Date())

        let edited = try XCTUnwrap(try quote(queue, "reply"))
        XCTAssertEqual(edited.previewText, "après")
        XCTAssertEqual(edited.attachmentThumbnailUrl, "https://cdn/p-t.jpg")
        XCTAssertGreaterThan(try row(queue, "reply")?.changeVersion ?? 0, before)
    }

    func test_markEdited_neverRevealsAProtectedQuote() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "parent")
        let protected = ReplyReference(messageId: "parent", authorName: "Bob",
                                       previewText: "👁️ 💬", attachmentIsProtected: true)
        try await insert(actor, id: "reply", replyTo: protected)

        try await actor.markEdited(localId: "parent", newContent: "le secret", editedAt: Date())

        XCTAssertEqual(try quote(queue, "reply")?.previewText, "👁️ 💬")
    }

    func test_upsert_replyToAlreadyDeletedParent_neverShowsParentText() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "parent")
        try await actor.markDeleted(localId: "parent", deletedAt: Date())

        let json = """
        {"id":"reply","conversationId":"conv_follow","senderId":"p-bob","content":"ma réponse",
         "createdAt":"2026-09-25T10:00:00Z","updatedAt":"2026-09-25T10:00:00Z","replyToId":"parent",
         "replyTo":{"id":"parent","content":"le code est 4271","sender":{"id":"p-bob","displayName":"Bob"}}}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let api = try decoder.decode(APIMessage.self, from: Data(json.utf8))
        try await actor.upsertFromAPIMessages([api])

        let sealed = try XCTUnwrap(try quote(queue, "reply"))
        XCTAssertTrue(sealed.isQuotedMessageDeleted)
        XCTAssertFalse(sealed.previewText.contains("4271"))
    }
}
