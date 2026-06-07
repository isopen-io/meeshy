import XCTest
@testable import MeeshySDK

/// Couvre la citation d'une réponse à un mood/statut : le `ReplyContext.status`
/// doit porter le contenu entier, l'emoji et la date, et router l'envoi comme une
/// réponse à un post (`isStoryReply`).
final class MoodReplyContextTests: XCTestCase {

    func test_statusReplyContext_authorId() {
        let ctx = ReplyContext.status(statusId: "s1", authorId: "u42", authorName: "alice",
                                      emoji: "🎉", content: "fête", publishedAt: Date())
        XCTAssertEqual(ctx.authorId, "u42")
    }

    func test_statusReplyContext_toReplyReference_carriesEmojiContentAndDate() {
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        let ctx = ReplyContext.status(statusId: "s1", authorId: "u42", authorName: "alice",
                                      emoji: "🔥", content: "en forme", publishedAt: date)

        let ref = ctx.toReplyReference

        XCTAssertEqual(ref.moodEmoji, "🔥")
        XCTAssertEqual(ref.previewText, "en forme")
        XCTAssertEqual(ref.storyPublishedAt, date)
        XCTAssertEqual(ref.messageId, "s1")
        XCTAssertEqual(ref.authorName, "alice")
        // Routé comme une réponse à un post (storyReplyToId côté envoi).
        XCTAssertTrue(ref.isStoryReply)
    }

    func test_statusReplyContext_emptyContent_stillCarriesEmoji() {
        let ctx = ReplyContext.status(statusId: "s1", authorId: "u42", authorName: "alice",
                                      emoji: "😴", content: nil)
        let ref = ctx.toReplyReference

        XCTAssertEqual(ref.moodEmoji, "😴")
        XCTAssertEqual(ref.previewText, "")
        XCTAssertNil(ref.storyPublishedAt)
    }

    func test_storyReplyContext_hasNoMoodEmoji() {
        let ctx = ReplyContext.story(storyId: "st1", authorId: "u1", authorName: "bob",
                                     preview: "photo")
        XCTAssertNil(ctx.toReplyReference.moodEmoji)
        XCTAssertTrue(ctx.toReplyReference.isStoryReply)
    }

    func test_replyReference_moodEmoji_roundTripsThroughCodable() throws {
        let ref = ReplyReference(messageId: "s1", authorName: "alice", previewText: "salut",
                                 isStoryReply: true, storyPublishedAt: Date(timeIntervalSince1970: 1),
                                 moodEmoji: "❤️")
        let data = try JSONEncoder().encode(ref)
        let decoded = try JSONDecoder().decode(ReplyReference.self, from: data)
        XCTAssertEqual(decoded.moodEmoji, "❤️")
        XCTAssertEqual(decoded.previewText, "salut")
    }
}
