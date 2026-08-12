import XCTest
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
/// Exercises the pure routing/dedup core `StoryViewerView
/// .applyingStoryCommentAdded(comment:expandedThreads:comments:repliesMap:)`
/// directly (mirrors `StoryViewerCommentRollbackTests`'s
/// `rollingBackOptimisticComment` pattern) — NOT the `applyStoryCommentAdded`
/// instance method. A manually-constructed `StoryViewerView`'s `@State`
/// storage does not reliably retain a post-construction assignment when read
/// back after a method call (confirmed empirically: even a same-scope
/// write-then-read of `storyComments` with zero method calls in between
/// reads back the property's default, not the assigned value) — the
/// `StoryViewerView_PrefetchTimerIntegrationTests` precedent this file
/// previously cited never actually exercises that path; it only ever WRITES
/// `@State` once immediately post-construction and asserts against
/// externally-owned reference objects (`prefetcher`/`timer`), never reading
/// the View's own `@State` back after a mutating call. The wrapper's guard
/// (`data.postId == currentStory?.id`) and its `storyCommentCount =
/// data.commentCount` assignment are simple one-liners left to code review,
/// same scope boundary as `rollbackOptimisticComment`'s wrapper.
final class StoryViewerCommentRealtimeTests: XCTestCase {

    private func makeComment(
        id: String,
        author: String = "Bob",
        authorId: String = "u2",
        content: String = "Nice story!",
        parentId: String? = nil,
        replies: Int = 0
    ) -> FeedComment {
        FeedComment(id: id, author: author, authorId: authorId, content: content, timestamp: Date(), replies: replies, parentId: parentId)
    }

    // MARK: - Overlay content receives the new comment live

    func test_applyingStoryCommentAdded_matchingStory_appendsTopLevelCommentAtEnd() {
        let existing = [makeComment(id: "existing", author: "Alice", authorId: "u1", content: "First!")]
        let newComment = makeComment(id: "comment-new")

        let result = StoryViewerView.applyingStoryCommentAdded(
            comment: newComment, expandedThreads: [], comments: existing, repliesMap: [:]
        )

        XCTAssertEqual(result.comments.map(\.id), ["existing", "comment-new"],
            "New comment must append at the end — storyComments.last drives autoscroll-to-bottom")
        XCTAssertEqual(result.comments.last?.content, "Nice story!")
    }

    func test_applyingStoryCommentAdded_reply_incrementsParentReplyCountAndRoutesIntoRepliesMap() {
        let comments = [makeComment(id: "parent-1", author: "Alice", authorId: "u1", content: "Root comment", replies: 0)]
        let reply = makeComment(id: "reply-1", parentId: "parent-1")

        let result = StoryViewerView.applyingStoryCommentAdded(
            comment: reply, expandedThreads: ["parent-1"], comments: comments, repliesMap: [:]
        )

        XCTAssertEqual(result.comments.first?.replies, 1,
            "Parent's visible reply count must bump even though the reply itself lives in the replies map")
        XCTAssertEqual(result.repliesMap["parent-1"]?.map(\.id), ["reply-1"])
    }

    func test_applyingStoryCommentAdded_reply_threadNotExpanded_stillBumpsParentCountOnly() {
        let comments = [makeComment(id: "parent-1", author: "Alice", authorId: "u1", content: "Root comment", replies: 0)]
        let reply = makeComment(id: "reply-1", parentId: "parent-1")

        // expandedThreads deliberately empty — thread collapsed.
        let result = StoryViewerView.applyingStoryCommentAdded(
            comment: reply, expandedThreads: [], comments: comments, repliesMap: [:]
        )

        XCTAssertEqual(result.comments.first?.replies, 1)
        XCTAssertNil(result.repliesMap["parent-1"],
            "A collapsed thread must not eagerly populate its replies map from realtime events")
    }

    func test_applyingStoryCommentAdded_duplicateCommentId_isNotAppendedTwice() {
        let comment = makeComment(id: "comment-1")
        let firstPass = StoryViewerView.applyingStoryCommentAdded(
            comment: comment, expandedThreads: [], comments: [], repliesMap: [:]
        )

        let secondPass = StoryViewerView.applyingStoryCommentAdded(
            comment: comment, expandedThreads: [], comments: firstPass.comments, repliesMap: firstPass.repliesMap
        )

        XCTAssertEqual(secondPass.comments.filter { $0.id == "comment-1" }.count, 1,
            "A redelivered socket event (reconnect replay) must not duplicate the row")
    }

    // MARK: - Self-echo reconciliation (P1 — temp_ optimistic twin)

    func test_applyingStoryCommentAdded_selfEchoTopLevel_reconcilesOptimisticTempEntryInsteadOfDuplicating() {
        let tempId = "temp_\(UUID().uuidString)"
        let comments = [makeComment(id: tempId, author: "Bob", authorId: "u2", content: "Nice story!")]
        let realEcho = makeComment(id: "comment-real", author: "Bob", authorId: "u2", content: "Nice story!")

        let result = StoryViewerView.applyingStoryCommentAdded(
            comment: realEcho, expandedThreads: [], comments: comments, repliesMap: [:]
        )

        XCTAssertEqual(result.comments.count, 1,
            "The server echo for our own comment must reconcile the temp_ placeholder in place, not duplicate it")
        XCTAssertEqual(result.comments.map(\.id), ["comment-real"])
    }

    func test_applyingStoryCommentAdded_selfEchoTopLevel_differentAuthor_stillAppendsSeparately() {
        // Sanity check for the isTwin guard: a temp_-prefixed row from a
        // DIFFERENT author/content must never be treated as our own echo.
        let tempId = "temp_\(UUID().uuidString)"
        let comments = [makeComment(id: tempId, author: "Alice", authorId: "u1", content: "Unrelated draft")]
        let realEcho = makeComment(id: "comment-real", author: "Bob", authorId: "u2", content: "Nice story!")

        let result = StoryViewerView.applyingStoryCommentAdded(
            comment: realEcho, expandedThreads: [], comments: comments, repliesMap: [:]
        )

        XCTAssertEqual(result.comments.map(\.id), [tempId, "comment-real"])
    }

    func test_applyingStoryCommentAdded_selfEchoReply_reconcilesOptimisticTempReplyWithoutDoubleCountingParent() {
        let tempId = "temp_\(UUID().uuidString)"
        let comments = [makeComment(id: "parent-1", author: "Alice", authorId: "u1", content: "Root comment", replies: 1)]
        let repliesMap = ["parent-1": [makeComment(id: tempId, author: "Bob", authorId: "u2", content: "Nice story!", parentId: "parent-1")]]
        let realEcho = makeComment(id: "reply-real", author: "Bob", authorId: "u2", content: "Nice story!", parentId: "parent-1")

        let result = StoryViewerView.applyingStoryCommentAdded(
            comment: realEcho, expandedThreads: ["parent-1"], comments: comments, repliesMap: repliesMap
        )

        XCTAssertEqual(result.comments.first?.replies, 1,
            "sendComment already bumped the parent's reply count optimistically — the echo must not bump it again")
        XCTAssertEqual(result.repliesMap["parent-1"]?.map(\.id), ["reply-real"],
            "The temp_ reply must be replaced by the real one in place, not appended alongside it")
    }
}
