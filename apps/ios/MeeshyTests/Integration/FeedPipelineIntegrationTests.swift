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
    func test_commentReactionAdded_persistsAbsoluteCountViaSocketHandler() async throws {
        let socket = MockSocialSocket()
        let handler = FeedSocketHandler(persistence: feedActor, socialSocket: socket)
        handler.arm()
        defer { handler.disarm() }

        try await feedActor.insertComment(
            CommentRecordFactory.make(id: "c_rx_int", postId: "post_rx"))

        let event = try JSONDecoder().decode(SocketCommentReactionUpdateEvent.self, from: Data("""
        {
            "commentId": "c_rx_int", "postId": "post_rx", "userId": "u2",
            "emoji": "🔥", "action": "added",
            "aggregation": { "emoji": "🔥", "count": 3, "userIds": ["u2"], "hasCurrentUser": false }
        }
        """.utf8))
        socket.commentReactionAdded.send(event)

        try await Task.sleep(for: .milliseconds(150))
        let comment = try feedActor.comments(forPostId: "post_rx", limit: 10).first { $0.id == "c_rx_int" }
        XCTAssertEqual(comment?.reactionSummary["🔥"], 3)
    }

    @MainActor
    func test_commentReactionSync_replacesSummaryViaSocketHandler() async throws {
        let socket = MockSocialSocket()
        let handler = FeedSocketHandler(persistence: feedActor, socialSocket: socket)
        handler.arm()
        defer { handler.disarm() }

        try await feedActor.insertComment(
            CommentRecordFactory.make(id: "c_sync_int", postId: "post_rx"))
        try await feedActor.updateCommentReactionSummary(commentId: "c_sync_int", emoji: "👍", count: 9)

        let event = try JSONDecoder().decode(SocketCommentReactionSyncEvent.self, from: Data("""
        {
            "commentId": "c_sync_int", "postId": "post_rx", "totalCount": 2,
            "userReactions": [],
            "reactions": [ { "emoji": "🔥", "count": 2, "userIds": ["u2", "u3"], "hasCurrentUser": false } ]
        }
        """.utf8))
        socket.commentReactionSync.send(event)

        try await Task.sleep(for: .milliseconds(150))
        let comment = try feedActor.comments(forPostId: "post_rx", limit: 10).first { $0.id == "c_sync_int" }
        XCTAssertEqual(comment?.reactionSummary["🔥"], 2)
        XCTAssertNil(comment?.reactionSummary["👍"], "sync ACK is authoritative — stale emoji dropped")
    }

    @MainActor
    func test_persistComments_seedsInlinePostCommentsIntoGRDB() async throws {
        // A post payload prefetched by the NSE embeds its recent comments (incl.
        // the one that triggered the notification). They must land in feed_comments
        // so a cold-start tap renders the triggering comment from local data.
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { d in
            let s = try d.singleValueContainer().decode(String.self)
            let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = f.date(from: s) { return date }
            let f2 = ISO8601DateFormatter(); f2.formatOptions = [.withInternetDateTime]
            if let date = f2.date(from: s) { return date }
            throw DecodingError.dataCorruptedError(in: try d.singleValueContainer(), debugDescription: "bad date")
        }
        let apiComments = try decoder.decode([APIPostComment].self, from: Data("""
        [
          { "id": "c_trigger", "content": "Nice post!", "createdAt": "2026-06-28T10:00:00.000Z",
            "author": { "id": "u2", "username": "bob", "displayName": "Bob", "avatar": null } },
          { "id": "c_other", "content": "Agreed", "createdAt": "2026-06-28T09:00:00.000Z",
            "author": { "id": "u3", "username": "carol", "displayName": "Carol", "avatar": null } }
        ]
        """.utf8))

        await NSEPendingPostConsumer.persistComments(apiComments, postId: "post_nse", to: feedActor)

        let stored = try feedActor.comments(forPostId: "post_nse", limit: 20)
        XCTAssertEqual(Set(stored.map(\.id)), ["c_trigger", "c_other"])
    }

    @MainActor
    func test_persistComments_emptyList_isNoOp() async throws {
        await NSEPendingPostConsumer.persistComments([], postId: "post_empty", to: feedActor)
        let stored = try feedActor.comments(forPostId: "post_empty", limit: 20)
        XCTAssertTrue(stored.isEmpty)
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
