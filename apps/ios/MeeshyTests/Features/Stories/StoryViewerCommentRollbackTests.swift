import XCTest
@testable import Meeshy
import MeeshySDK

/// P1 — story comments/replies used to be pure fire-and-forget: a failed
/// media upload silently published the comment WITHOUT its media (the
/// `try?` just dropped the id), and a failed `postComment` (offline, most
/// visibly) left the optimistic `temp_` row on screen forever with no
/// rollback. `StoryViewerView.rollingBackOptimisticComment` is the pure core
/// of the fix — extracted so it's unit-testable without a live SwiftUI view
/// (`sendComment`'s network calls aren't injectable, cf.
/// `StoryViewerReactionFlowTests`'s header comment on the same limitation).
final class StoryViewerCommentRollbackTests: XCTestCase {

    private func makeComment(id: String, parentId: String? = nil, replies: Int = 0) -> FeedComment {
        FeedComment(id: id, author: "Me", authorId: "u1", content: "hi", timestamp: Date(), replies: replies, parentId: parentId)
    }

    // MARK: - Top-level comment

    func test_rollback_topLevelComment_removesItAndDecrementsCount() {
        let comments = [makeComment(id: "keep"), makeComment(id: "temp_1")]

        let result = StoryViewerView.rollingBackOptimisticComment(
            id: "temp_1", parentId: nil,
            comments: comments, repliesMap: [:], commentCount: 5
        )

        XCTAssertEqual(result.comments.map(\.id), ["keep"])
        XCTAssertEqual(result.commentCount, 4)
        XCTAssertTrue(result.repliesMap.isEmpty)
    }

    func test_rollback_topLevelComment_countNeverGoesNegative() {
        let result = StoryViewerView.rollingBackOptimisticComment(
            id: "temp_1", parentId: nil,
            comments: [makeComment(id: "temp_1")], repliesMap: [:], commentCount: 0
        )

        XCTAssertEqual(result.commentCount, 0, "A count that was already 0 (desync) must clamp, not go negative")
    }

    // MARK: - Reply

    func test_rollback_reply_removesFromRepliesMapAndDecrementsParentReplyCount() {
        let parent = makeComment(id: "parent-1", replies: 2)
        let repliesMap = ["parent-1": [makeComment(id: "reply-a", parentId: "parent-1"), makeComment(id: "temp_reply", parentId: "parent-1")]]

        let result = StoryViewerView.rollingBackOptimisticComment(
            id: "temp_reply", parentId: "parent-1",
            comments: [parent], repliesMap: repliesMap, commentCount: 10
        )

        XCTAssertEqual(result.repliesMap["parent-1"]?.map(\.id), ["reply-a"])
        XCTAssertEqual(result.comments.first?.replies, 1)
        XCTAssertEqual(result.commentCount, 9)
    }

    func test_rollback_reply_parentNotInCollapsedRepliesMap_stillDecrementsParentCount() {
        // Thread was never expanded — sendComment still bumped the parent's
        // visible reply count even though the repliesMap has no entry yet.
        let parent = makeComment(id: "parent-1", replies: 1)

        let result = StoryViewerView.rollingBackOptimisticComment(
            id: "temp_reply", parentId: "parent-1",
            comments: [parent], repliesMap: [:], commentCount: 3
        )

        XCTAssertEqual(result.comments.first?.replies, 0)
        XCTAssertTrue(result.repliesMap.isEmpty)
        XCTAssertEqual(result.commentCount, 2)
    }

    func test_rollback_reply_parentReplyCountNeverGoesNegative() {
        let parent = makeComment(id: "parent-1", replies: 0)

        let result = StoryViewerView.rollingBackOptimisticComment(
            id: "temp_reply", parentId: "parent-1",
            comments: [parent], repliesMap: [:], commentCount: 1
        )

        XCTAssertEqual(result.comments.first?.replies, 0)
    }

    // MARK: - No-op safety

    func test_rollback_unknownId_leavesCollectionsUnchangedButStillDecrementsCount() {
        let comments = [makeComment(id: "keep")]

        let result = StoryViewerView.rollingBackOptimisticComment(
            id: "never-existed", parentId: nil,
            comments: comments, repliesMap: [:], commentCount: 2
        )

        XCTAssertEqual(result.comments.map(\.id), ["keep"])
        XCTAssertEqual(result.commentCount, 1)
    }
}
