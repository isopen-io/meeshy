import XCTest
import GRDB
@testable import MeeshySDK

/// #7969 — la story citée retirée par son auteur : chaque citation gravée
/// dans `replyToJson` de la conversation devient « Story indisponible », en
/// une écriture, sans toucher les autres conversations ni les autres posts.
final class MessagePersistenceCitedPostTests: XCTestCase {

    private func makeActor() throws -> (MessagePersistenceActor, DatabaseQueue) {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return (MessagePersistenceActor(dbWriter: queue, currentUserId: "user_me"), queue)
    }

    private static func storyQuote(_ postId: String) -> ReplyReference {
        ReplyReference(messageId: postId, authorName: "", previewText: "Plage à Dakar", isStoryReply: true,
                       storyReactionCount: 3, storyThumbnailUrl: "https://cdn/story-t.jpg")
    }

    private func insert(
        _ actor: MessagePersistenceActor, id: String, conv: String,
        storyReplyToId: String?, quote: ReplyReference?
    ) async throws {
        var record = MessageRecordFactory.make(localId: id, conversationId: conv, content: "réponse", state: .sent)
        record.serverId = id
        record.storyReplyToId = storyReplyToId
        record.replyToJson = try quote.map { try JSONEncoder().encode($0) }
        try await actor.insertOptimistic(record)
    }

    private func row(_ queue: DatabaseQueue, _ id: String) throws -> MessageRecord? {
        try queue.read { db in try MessageRecord.filter(Column("localId") == id).fetchOne(db) }
    }

    private func quote(_ queue: DatabaseQueue, _ id: String) throws -> ReplyReference? {
        try row(queue, id)?.replyToJson.flatMap { try JSONDecoder().decode(ReplyReference.self, from: $0) }
    }

    func test_markCitedPostWithdrawn_rendersTheCitationUnavailableAndBumpsVersion() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "reply", conv: "c-dm", storyReplyToId: "post-1", quote: Self.storyQuote("post-1"))
        let before = try row(queue, "reply")?.changeVersion ?? 0

        try await actor.markCitedPostWithdrawn(postId: "post-1", conversationId: "c-dm")

        let sealed = try XCTUnwrap(try quote(queue, "reply"))
        XCTAssertTrue(sealed.isUnavailableStory)
        XCTAssertNil(sealed.storyThumbnailUrl, "rien du contenu retiré ne reste gravé")
        XCTAssertEqual(sealed.previewText, "")
        XCTAssertEqual(try row(queue, "reply")?.changeVersion, before + 1)
    }

    /// Une citation gravée avant que `storyReplyToId` soit servi : reconnue par
    /// son identifiant de story.
    func test_markCitedPostWithdrawn_findsACitationWithoutTheColumn() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "legacy", conv: "c-dm", storyReplyToId: nil, quote: Self.storyQuote("post-1"))

        try await actor.markCitedPostWithdrawn(postId: "post-1", conversationId: "c-dm")

        XCTAssertEqual(try quote(queue, "legacy")?.isUnavailableStory, true)
    }

    func test_markCitedPostWithdrawn_leavesOtherPostsAndOtherConversationsIntact() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "other-post", conv: "c-dm", storyReplyToId: "post-2", quote: Self.storyQuote("post-2"))
        try await insert(actor, id: "other-conv", conv: "c-else", storyReplyToId: "post-1", quote: Self.storyQuote("post-1"))
        let otherPostVersion = try row(queue, "other-post")?.changeVersion
        let otherConvVersion = try row(queue, "other-conv")?.changeVersion

        try await actor.markCitedPostWithdrawn(postId: "post-1", conversationId: "c-dm")

        XCTAssertEqual(try quote(queue, "other-post"), Self.storyQuote("post-2"))
        XCTAssertEqual(try quote(queue, "other-conv"), Self.storyQuote("post-1"))
        XCTAssertEqual(try row(queue, "other-post")?.changeVersion, otherPostVersion)
        XCTAssertEqual(try row(queue, "other-conv")?.changeVersion, otherConvVersion)
    }

    func test_markCitedPostWithdrawn_isIdempotent() async throws {
        let (actor, queue) = try makeActor()
        try await insert(actor, id: "reply", conv: "c-dm", storyReplyToId: "post-1", quote: Self.storyQuote("post-1"))

        try await actor.markCitedPostWithdrawn(postId: "post-1", conversationId: "c-dm")
        let once = try row(queue, "reply")?.changeVersion
        try await actor.markCitedPostWithdrawn(postId: "post-1", conversationId: "c-dm")

        XCTAssertEqual(try row(queue, "reply")?.changeVersion, once, "rejouer l'événement ne redessine rien")
    }
}
