import XCTest
import SwiftUI
@testable import MeeshySDK
@testable import Meeshy

/// P2 — realtime asymmetry between `reactionCount` and `commentCount` in the
/// open story viewer (cf. audit-notes-2026-07-20.md § stories):
///  1. `currentStory?.commentCount` changing (via `StoryViewModel`'s
///     `comment:added`/`comment:deleted` socket sinks mutating `storyGroups`)
///     never re-derived the sidebar's `storyCommentCount` @State — only
///     `reactionCount` had that mirror.
///  2. The comments overlay's own `storyComments`/`storyCommentRepliesMap`
///     never received a `comment:added` broadcast's actual content — a
///     viewer with the overlay open had to close and reopen it.
///
/// `applyStoryCommentAdded` is exercised by constructing a real
/// `StoryViewerView` and calling it directly — proven pattern in
/// `StoryViewerView_PrefetchTimerIntegrationTests` (a manually-constructed
/// SwiftUI View struct's `@State` storage is settable/readable outside a
/// live view hierarchy as long as no rendering pass is required).
@MainActor
final class StoryViewerCommentRealtimeTests: XCTestCase {

    // MARK: - Fixtures

    private func makeStoryItem(id: String) -> StoryItem {
        StoryItem(
            id: id,
            content: "story \(id)",
            media: [],
            storyEffects: nil,
            createdAt: Date(),
            expiresAt: nil,
            isViewed: false
        )
    }

    private func makeGroup(id: String = "author-1", stories: [StoryItem]) -> StoryGroup {
        StoryGroup(id: id, username: "alice", avatarColor: "#6366F1", avatarURL: nil, stories: stories)
    }

    private func makeSUT(storyId: String = "story-0") -> StoryViewerView {
        let group = makeGroup(stories: [makeStoryItem(id: storyId)])
        let binding = Binding(get: { true }, set: { _ in })
        let view = StoryViewerView(
            viewModel: StoryViewModel(),
            groups: [group],
            currentGroupIndex: 0,
            isPresented: binding
        )
        view.currentStoryIndex = 0
        return view
    }

    private func makeCommentAddedData(
        postId: String,
        commentId: String = "comment-1",
        parentId: String? = nil,
        commentCount: Int = 4
    ) -> SocketCommentAddedData {
        JSONStub.decode("""
        {
          "postId": "\(postId)",
          "commentCount": \(commentCount),
          "comment": {
            "id": "\(commentId)",
            "content": "Nice story!",
            "originalLanguage": "en",
            "parentId": \(parentId.map { "\"\($0)\"" } ?? "null"),
            "translations": null,
            "likeCount": 0,
            "replyCount": 0,
            "effectFlags": 0,
            "createdAt": "2026-01-15T12:00:00.000Z",
            "author": { "id": "u2", "username": "bob", "displayName": "Bob", "avatar": null },
            "currentUserReactions": null,
            "media": null
          }
        }
        """)
    }

    // MARK: - Overlay content receives the new comment live

    func test_applyStoryCommentAdded_matchingStory_appendsTopLevelCommentAtEnd() {
        let sut = makeSUT(storyId: "story-0")
        sut.storyComments = [
            FeedComment(id: "existing", author: "Alice", authorId: "u1", content: "First!", timestamp: Date())
        ]

        sut.applyStoryCommentAdded(makeCommentAddedData(postId: "story-0", commentId: "comment-new", commentCount: 2))

        XCTAssertEqual(sut.storyComments.map(\.id), ["existing", "comment-new"],
            "New comment must append at the end — storyComments.last drives autoscroll-to-bottom")
        XCTAssertEqual(sut.storyComments.last?.content, "Nice story!")
        XCTAssertEqual(sut.storyComments.last?.authorUsername, "bob")
    }

    func test_applyStoryCommentAdded_reply_incrementsParentReplyCountAndRoutesIntoRepliesMap() {
        let sut = makeSUT(storyId: "story-0")
        sut.storyComments = [
            FeedComment(id: "parent-1", author: "Alice", authorId: "u1", content: "Root comment", timestamp: Date(), replies: 0)
        ]
        sut.storyCommentExpandedThreads = ["parent-1"]

        sut.applyStoryCommentAdded(makeCommentAddedData(postId: "story-0", commentId: "reply-1", parentId: "parent-1", commentCount: 2))

        XCTAssertEqual(sut.storyComments.first?.replies, 1,
            "Parent's visible reply count must bump even though the reply itself lives in the replies map")
        XCTAssertEqual(sut.storyCommentRepliesMap["parent-1"]?.map(\.id), ["reply-1"])
    }

    func test_applyStoryCommentAdded_reply_threadNotExpanded_stillBumpsParentCountOnly() {
        let sut = makeSUT(storyId: "story-0")
        sut.storyComments = [
            FeedComment(id: "parent-1", author: "Alice", authorId: "u1", content: "Root comment", timestamp: Date(), replies: 0)
        ]
        // storyCommentExpandedThreads deliberately left empty — thread collapsed.

        sut.applyStoryCommentAdded(makeCommentAddedData(postId: "story-0", commentId: "reply-1", parentId: "parent-1", commentCount: 2))

        XCTAssertEqual(sut.storyComments.first?.replies, 1)
        XCTAssertNil(sut.storyCommentRepliesMap["parent-1"],
            "A collapsed thread must not eagerly populate its replies map from realtime events")
    }

    func test_applyStoryCommentAdded_duplicateCommentId_isNotAppendedTwice() {
        let sut = makeSUT(storyId: "story-0")
        let data = makeCommentAddedData(postId: "story-0", commentId: "comment-1", commentCount: 3)
        sut.applyStoryCommentAdded(data)
        sut.applyStoryCommentAdded(data)

        XCTAssertEqual(sut.storyComments.filter { $0.id == "comment-1" }.count, 1,
            "A redelivered socket event (reconnect replay) must not duplicate the row")
    }

    func test_applyStoryCommentAdded_differentStory_isIgnored() {
        let sut = makeSUT(storyId: "story-0")
        sut.storyCommentCount = 0

        sut.applyStoryCommentAdded(makeCommentAddedData(postId: "some-other-story", commentCount: 99))

        XCTAssertTrue(sut.storyComments.isEmpty)
        XCTAssertEqual(sut.storyCommentCount, 0,
            "A broadcast for a story the viewer isn't currently looking at must not touch this @State")
    }

    // MARK: - Self-echo reconciliation (P1 — temp_ optimistic twin)

    func test_applyStoryCommentAdded_selfEchoTopLevel_reconcilesOptimisticTempEntryInsteadOfDuplicating() {
        let sut = makeSUT(storyId: "story-0")
        let tempId = "temp_\(UUID().uuidString)"
        sut.storyComments = [
            FeedComment(id: tempId, author: "Bob", authorId: "u2", content: "Nice story!", timestamp: Date())
        ]

        sut.applyStoryCommentAdded(makeCommentAddedData(postId: "story-0", commentId: "comment-real", commentCount: 5))

        XCTAssertEqual(sut.storyComments.count, 1,
            "The server echo for our own comment must reconcile the temp_ placeholder in place, not duplicate it")
        XCTAssertEqual(sut.storyComments.map(\.id), ["comment-real"])
    }

    func test_applyStoryCommentAdded_selfEchoTopLevel_differentAuthor_stillAppendsSeparately() {
        // Sanity check for the isTwin guard: a temp_-prefixed row from a
        // DIFFERENT author/content must never be treated as our own echo.
        let sut = makeSUT(storyId: "story-0")
        let tempId = "temp_\(UUID().uuidString)"
        sut.storyComments = [
            FeedComment(id: tempId, author: "Alice", authorId: "u1", content: "Unrelated draft", timestamp: Date())
        ]

        sut.applyStoryCommentAdded(makeCommentAddedData(postId: "story-0", commentId: "comment-real", commentCount: 5))

        XCTAssertEqual(sut.storyComments.map(\.id), [tempId, "comment-real"])
    }

    func test_applyStoryCommentAdded_selfEchoReply_reconcilesOptimisticTempReplyWithoutDoubleCountingParent() {
        let sut = makeSUT(storyId: "story-0")
        let tempId = "temp_\(UUID().uuidString)"
        sut.storyComments = [
            FeedComment(id: "parent-1", author: "Alice", authorId: "u1", content: "Root comment", timestamp: Date(), replies: 1)
        ]
        sut.storyCommentRepliesMap["parent-1"] = [
            FeedComment(id: tempId, author: "Bob", authorId: "u2", content: "Nice story!", timestamp: Date(), parentId: "parent-1")
        ]

        sut.applyStoryCommentAdded(makeCommentAddedData(postId: "story-0", commentId: "reply-real", parentId: "parent-1", commentCount: 5))

        XCTAssertEqual(sut.storyComments.first?.replies, 1,
            "sendComment already bumped the parent's reply count optimistically — the echo must not bump it again")
        XCTAssertEqual(sut.storyCommentRepliesMap["parent-1"]?.map(\.id), ["reply-real"],
            "The temp_ reply must be replaced by the real one in place, not appended alongside it")
    }

    // MARK: - Counter mirror (asymmetry with reactionCount fix)

    func test_applyStoryCommentAdded_setsAuthoritativeCommentCountFromEvent() {
        let sut = makeSUT(storyId: "story-0")
        sut.storyCommentCount = 1

        sut.applyStoryCommentAdded(makeCommentAddedData(postId: "story-0", commentCount: 7))

        XCTAssertEqual(sut.storyCommentCount, 7,
            "Mirrors StoryViewModel.applyStoryCommentCountDelta: trust the event's count, don't derive +1 locally")
    }
}
