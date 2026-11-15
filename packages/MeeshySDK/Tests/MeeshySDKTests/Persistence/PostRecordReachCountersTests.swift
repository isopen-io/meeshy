import XCTest
import GRDB
@testable import MeeshySDK

/// #10400 — le cache `feed_posts` ne gardait que `viewCount` parmi les
/// compteurs de portée. Le repli hors ligne reconstruisait donc des posts à
/// « N likes · 0 impression » : les likes survivaient au cache, la portée non.
final class PostRecordReachCountersTests: XCTestCase {

    private func makeRecord(
        id: String = "post_reach",
        impressionCount: Int? = nil,
        postOpenCount: Int? = nil,
        playCount: Int? = nil,
        qualifiedViewCount: Int? = nil
    ) -> PostRecord {
        PostRecord(
            id: id, authorId: "user_1", authorUsername: "alice",
            authorDisplayName: "Alice", authorAvatarURL: nil,
            type: "REEL", content: "Hello", originalLanguage: "fr",
            visibility: "PUBLIC", likeCount: 3, commentCount: 0,
            repostCount: 0, viewCount: 7, bookmarkCount: 0, shareCount: 0,
            isLikedByMe: false, isPinned: false, isEdited: false, isQuote: false,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil,
            mediaJson: nil, reactionSummaryJson: nil, repostOfJson: nil,
            mentionedUsersJson: nil, translationsJson: nil,
            createdAt: Date(), updatedAt: nil, changeVersion: 0,
            impressionCount: impressionCount, postOpenCount: postOpenCount,
            playCount: playCount, qualifiedViewCount: qualifiedViewCount
        )
    }

    private func makePersistence() throws -> FeedPersistenceActor {
        let dbQueue = try DatabaseQueue()
        try FeedDatabaseMigrations.runAll(on: dbQueue)
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        return FeedPersistenceActor(dbWriter: dbQueue)
    }

    func test_theReachCounters_surviveTheCache_andReachTheRenderedPost() async throws {
        let persistence = try makePersistence()
        try await persistence.insertPost(
            makeRecord(impressionCount: 42, postOpenCount: 5, playCount: 11, qualifiedViewCount: 9)
        )

        let cached = try XCTUnwrap(try persistence.posts(limit: 10).first)
        let post = cached.toFeedPost()

        XCTAssertEqual(post.likes, 3)
        XCTAssertEqual(post.impressionCount, 42, "un post servi du cache garde ses impressions sous ses likes")
        XCTAssertEqual(post.postOpenCount, 5)
        XCTAssertEqual(post.playCount, 11)
        XCTAssertEqual(post.qualifiedViewCount, 9)
        XCTAssertEqual(post.viewCount, 7)
    }

    func test_aPayloadThatDoesNotServeTheReach_keepsTheCountersTheCacheKnows() async throws {
        let persistence = try makePersistence()
        try await persistence.insertPost(
            makeRecord(impressionCount: 42, postOpenCount: 5, playCount: 11, qualifiedViewCount: 9)
        )

        try await persistence.insertPosts([makeRecord(impressionCount: 43)])

        let cached = try XCTUnwrap(try persistence.posts(limit: 10).first)
        XCTAssertEqual(cached.impressionCount, 43, "un compteur servi remplace l'ancien")
        XCTAssertEqual(cached.postOpenCount, 5, "un compteur NON servi n'est pas remis à zéro")
        XCTAssertEqual(cached.playCount, 11)
        XCTAssertEqual(cached.qualifiedViewCount, 9)
    }

    func test_aRowWrittenBeforeTheColumns_decodesTheReachAsUnknown() async throws {
        let persistence = try makePersistence()
        try await persistence.insertPost(makeRecord())

        let cached = try XCTUnwrap(try persistence.posts(limit: 10).first)

        XCTAssertNil(cached.impressionCount, "jamais reçu ⇒ inconnu, pas zéro")
        XCTAssertNil(cached.playCount)
    }
}
