import XCTest
import GRDB
@testable import MeeshySDK
@testable import Meeshy

@MainActor
final class FeedPipelineIntegrationTests: XCTestCase {

    private var dbQueue: DatabaseQueue!
    private var feedActor: FeedPersistenceActor!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try FeedDatabaseMigrations.runAll(on: dbQueue)
        feedActor = FeedPersistenceActor(dbWriter: dbQueue)
    }

    @MainActor
    func test_postInsert_appearsInFeedStore() async throws {
        let store = FeedStore(persistence: feedActor)
        store.startObserving(dbPool: dbQueue)

        let post = PostRecordFactory.make(id: "feed_int_1", content: "Integration test")
        try await feedActor.insertPost(post)

        try await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(store.posts.count, 1)
        XCTAssertEqual(store.posts[0].content, "Integration test")

        store.stopObserving()
    }

    @MainActor
    func test_likeUpdate_reflectedInStore() async throws {
        let store = FeedStore(persistence: feedActor)
        store.startObserving(dbPool: dbQueue)

        try await feedActor.insertPost(PostRecordFactory.make(id: "feed_like"))
        try await Task.sleep(for: .milliseconds(50))

        try await feedActor.updateLikeCount(postId: "feed_like", count: 42, isLikedByMe: true)
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.posts[0].likeCount, 42)
        XCTAssertTrue(store.posts[0].isLikedByMe)

        store.stopObserving()
    }

    @MainActor
    func test_commentInsert_appearsInCommentStore() async throws {
        let store = CommentStore(postId: "post_int", persistence: feedActor)
        await store.loadInitial()

        try await feedActor.insertComment(
            CommentRecordFactory.make(id: "c_int_1", postId: "post_int", content: "Great post!"))

        try await Task.sleep(for: .milliseconds(100))
        await store.loadInitial()
        XCTAssertEqual(store.topLevelComments.count, 1)
    }

    @MainActor
    func test_nestedThread_expandCollapse() async throws {
        let store = CommentStore(postId: "post_thread", persistence: feedActor)

        var parent = CommentRecordFactory.make(id: "c_p", postId: "post_thread")
        parent.replyCount = 2
        try await feedActor.insertComment(parent)
        try await feedActor.insertComment(
            CommentRecordFactory.make(id: "c_r1", postId: "post_thread", parentId: "c_p"))
        try await feedActor.insertComment(
            CommentRecordFactory.make(id: "c_r2", postId: "post_thread", parentId: "c_p"))

        await store.loadInitial()
        XCTAssertEqual(store.topLevelComments.count, 1)
        XCTAssertTrue(store.replies(for: "c_p").isEmpty)

        await store.toggleThread("c_p")
        XCTAssertEqual(store.replies(for: "c_p").count, 2)
        XCTAssertTrue(store.expandedThreads.contains("c_p"))

        await store.toggleThread("c_p")
        XCTAssertFalse(store.expandedThreads.contains("c_p"))
    }
}

// MARK: - Factories

private enum PostRecordFactory {
    static func make(
        id: String = "post_\(UUID().uuidString)",
        authorId: String = "user_1",
        content: String? = "Test post",
        changeVersion: Int64 = 0
    ) -> PostRecord {
        PostRecord(
            id: id, authorId: authorId, authorUsername: "testuser",
            authorDisplayName: "Test User", authorAvatarURL: nil,
            type: "post", content: content, originalLanguage: "fr",
            visibility: "public", likeCount: 0, commentCount: 0,
            repostCount: 0, viewCount: 0, bookmarkCount: 0, shareCount: 0,
            isLikedByMe: false, isPinned: false, isEdited: false, isQuote: false,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil,
            mediaJson: nil, reactionSummaryJson: nil, repostOfJson: nil,
            mentionedUsersJson: nil, translationsJson: nil,
            createdAt: Date(), updatedAt: nil, changeVersion: changeVersion
        )
    }
}

private enum CommentRecordFactory {
    static func make(
        id: String = "comment_\(UUID().uuidString)",
        postId: String = "post_default",
        parentId: String? = nil,
        content: String = "Test comment",
        changeVersion: Int64 = 0
    ) -> CommentRecord {
        CommentRecord(
            id: id, postId: postId, parentId: parentId,
            authorId: "user_1", authorUsername: "commenter",
            authorDisplayName: "Commenter", authorAvatarURL: nil,
            content: content, originalLanguage: "fr",
            translatedContent: nil, likeCount: 0, replyCount: 0,
            effectFlags: 0, createdAt: Date(), changeVersion: changeVersion
        )
    }
}
