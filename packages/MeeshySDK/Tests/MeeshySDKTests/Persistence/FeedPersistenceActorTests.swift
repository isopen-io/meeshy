import XCTest
import GRDB
@testable import MeeshySDK

final class FeedPersistenceActorTests: XCTestCase {

    private var actor: FeedPersistenceActor!
    private var dbQueue: DatabaseQueue!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try FeedDatabaseMigrations.runAll(on: dbQueue)
        actor = FeedPersistenceActor(dbWriter: dbQueue)
    }

    func test_insertPost_persists() async throws {
        let post = PostRecordFactory.make(id: "post_1", content: "Hello")
        try await actor.insertPost(post)
        let fetched = try actor.posts(limit: 10)
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched[0].content, "Hello")
    }

    func test_insertPosts_bulk() async throws {
        let posts = (0..<10).map { PostRecordFactory.make(id: "post_\($0)") }
        try await actor.insertPosts(posts)
        let fetched = try actor.posts(limit: 20)
        XCTAssertEqual(fetched.count, 10)
    }

    func test_updateLikeCount() async throws {
        try await actor.insertPost(PostRecordFactory.make(id: "post_like"))
        try await actor.updateLikeCount(postId: "post_like", count: 5, isLikedByMe: true)
        let fetched = try actor.posts(limit: 10)
        XCTAssertEqual(fetched[0].likeCount, 5)
        XCTAssertTrue(fetched[0].isLikedByMe)
    }

    func test_updatePostReactionSummary_setsAndMergesEmojiCounts() async throws {
        try await actor.insertPost(PostRecordFactory.make(id: "post_rx"))

        try await actor.updatePostReactionSummary(postId: "post_rx", emoji: "👍", count: 3)
        try await actor.updatePostReactionSummary(postId: "post_rx", emoji: "🔥", count: 2)

        let summary = try reactionSummary(forPostId: "post_rx")
        XCTAssertEqual(summary["👍"], 3)
        XCTAssertEqual(summary["🔥"], 2)
    }

    func test_updatePostReactionSummary_isIdempotentUnderDuplicateDelivery() async throws {
        try await actor.insertPost(PostRecordFactory.make(id: "post_rx_dup"))

        // Same absolute count delivered twice (feed room + post room) must not double.
        try await actor.updatePostReactionSummary(postId: "post_rx_dup", emoji: "👍", count: 4)
        try await actor.updatePostReactionSummary(postId: "post_rx_dup", emoji: "👍", count: 4)

        let summary = try reactionSummary(forPostId: "post_rx_dup")
        XCTAssertEqual(summary["👍"], 4)
    }

    func test_updatePostReactionSummary_zeroCountRemovesEmoji() async throws {
        try await actor.insertPost(PostRecordFactory.make(id: "post_rx_zero"))
        try await actor.updatePostReactionSummary(postId: "post_rx_zero", emoji: "👍", count: 1)

        // Last reactor removes their reaction → count drops to 0 → key removed.
        try await actor.updatePostReactionSummary(postId: "post_rx_zero", emoji: "👍", count: 0)

        let summary = try reactionSummary(forPostId: "post_rx_zero")
        XCTAssertNil(summary["👍"])
    }

    private func reactionSummary(forPostId postId: String) throws -> [String: Int] {
        let post = try actor.posts(limit: 50).first { $0.id == postId }
        guard let data = post?.reactionSummaryJson else { return [:] }
        return (try? JSONDecoder().decode([String: Int].self, from: data)) ?? [:]
    }

    func test_deletePost() async throws {
        try await actor.insertPost(PostRecordFactory.make(id: "post_del"))
        try await actor.deletePost(id: "post_del")
        let fetched = try actor.posts(limit: 10)
        XCTAssertEqual(fetched.count, 0)
    }

    func test_insertComment_topLevel() async throws {
        let comment = CommentRecordFactory.make(id: "c_1", postId: "post_1", parentId: nil)
        try await actor.insertComment(comment)
        let fetched = try actor.comments(forPostId: "post_1", limit: 10)
        XCTAssertEqual(fetched.count, 1)
    }

    func test_insertComment_nested() async throws {
        let parent = CommentRecordFactory.make(id: "c_parent", postId: "post_1")
        let reply = CommentRecordFactory.make(id: "c_reply", postId: "post_1", parentId: "c_parent")
        try await actor.insertComment(parent)
        try await actor.insertComment(reply)

        let topLevel = try actor.comments(forPostId: "post_1", parentId: nil, limit: 10)
        XCTAssertEqual(topLevel.count, 1)

        let replies = try actor.comments(forPostId: "post_1", parentId: "c_parent", limit: 10)
        XCTAssertEqual(replies.count, 1)
    }

    func test_updateCommentCount() async throws {
        try await actor.insertPost(PostRecordFactory.make(id: "post_cc"))
        try await actor.updateCommentCount(postId: "post_cc", count: 7)
        let fetched = try actor.posts(limit: 10)
        XCTAssertEqual(fetched[0].commentCount, 7)
    }

    func test_deleteComment() async throws {
        try await actor.insertComment(CommentRecordFactory.make(id: "c_del", postId: "post_1"))
        try await actor.deleteComment(id: "c_del")
        let fetched = try actor.comments(forPostId: "post_1", limit: 10)
        XCTAssertEqual(fetched.count, 0)
    }

    func test_cursorPagination() async throws {
        for i in 0..<30 {
            var post = PostRecordFactory.make(id: "post_\(i)")
            post.createdAt = Date().addingTimeInterval(Double(i))
            try await actor.insertPost(post)
        }

        let page1 = try actor.posts(limit: 10)
        XCTAssertEqual(page1.count, 10)

        let page2 = try actor.posts(cursor: page1.last!.createdAt, limit: 10)
        XCTAssertEqual(page2.count, 10)
        XCTAssertTrue(page2[0].createdAt < page1.last!.createdAt)
    }
}
