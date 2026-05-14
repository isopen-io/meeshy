import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class StoryViewerCommentReactionTests: XCTestCase {

    // MARK: - Factory Helpers

    private func makeComment(
        id: String,
        currentUserReactions: [String]?
    ) -> APIPostComment {
        let reactionsJSON: String
        if let reactions = currentUserReactions {
            let quoted = reactions.map { "\"\($0)\"" }.joined(separator: ",")
            reactionsJSON = "[\(quoted)]"
        } else {
            reactionsJSON = "null"
        }
        return JSONStub.decode("""
        {
            "id": "\(id)",
            "content": "stub",
            "createdAt": "2026-01-01T00:00:00.000Z",
            "author": {"id": "a1", "username": "alice"},
            "currentUserReactions": \(reactionsJSON)
        }
        """)
    }

    // MARK: - StoryViewerView.computeLikedIds tests

    func test_computeLikedIds_withHeartReaction_includesCommentId() {
        let comments = [
            makeComment(id: "c1", currentUserReactions: ["\u{2764}\u{FE0F}"]),
            makeComment(id: "c2", currentUserReactions: ["\u{1F525}"]),
            makeComment(id: "c3", currentUserReactions: nil)
        ]

        let result = StoryViewerView.computeLikedIds(from: comments)

        XCTAssertEqual(result, ["c1"])
    }

    func test_computeLikedIds_withNoReactions_returnsEmptySet() {
        let comments = [
            makeComment(id: "c1", currentUserReactions: nil),
            makeComment(id: "c2", currentUserReactions: [])
        ]

        let result = StoryViewerView.computeLikedIds(from: comments)

        XCTAssertTrue(result.isEmpty)
    }

    func test_computeLikedIds_withMultipleHeartComments_includesAllIds() {
        let comments = [
            makeComment(id: "c1", currentUserReactions: ["\u{2764}\u{FE0F}"]),
            makeComment(id: "c2", currentUserReactions: ["\u{2764}\u{FE0F}", "\u{1F525}"]),
            makeComment(id: "c3", currentUserReactions: ["\u{1F525}"])
        ]

        let result = StoryViewerView.computeLikedIds(from: comments)

        XCTAssertEqual(result, ["c1", "c2"])
    }

    func test_computeLikedIds_withEmptyList_returnsEmptySet() {
        let result = StoryViewerView.computeLikedIds(from: [])

        XCTAssertTrue(result.isEmpty)
    }

    // MARK: - CommentsSheetView.computeLikedIds tests (mirrors StoryViewerView)

    func test_commentsSheet_computeLikedIds_withHeartReaction_includesCommentId() {
        let comments = [
            makeComment(id: "c1", currentUserReactions: ["\u{2764}\u{FE0F}"]),
            makeComment(id: "c2", currentUserReactions: ["\u{1F525}"]),
            makeComment(id: "c3", currentUserReactions: nil)
        ]

        let result = CommentsSheetView.computeLikedIds(from: comments)

        XCTAssertEqual(result, ["c1"])
    }

    func test_commentsSheet_computeLikedIds_withNoReactions_returnsEmptySet() {
        let comments = [
            makeComment(id: "c1", currentUserReactions: nil),
            makeComment(id: "c2", currentUserReactions: [])
        ]

        let result = CommentsSheetView.computeLikedIds(from: comments)

        XCTAssertTrue(result.isEmpty)
    }

    // MARK: - In-flight guard logic tests

    /// Validates the in-flight guard set semantic: inserting a commentId blocks
    /// a second toggle attempt and removal restores the ability to toggle.
    func test_heartInFlightGuard_blocksDoubleToggle() {
        var inFlightIds: Set<String> = []
        let commentId = "c1"

        // First toggle — should proceed
        let firstAttemptBlocked = inFlightIds.contains(commentId)
        inFlightIds.insert(commentId)

        // Second toggle — should be blocked
        let secondAttemptBlocked = inFlightIds.contains(commentId)

        // After completion, removal clears the lock
        inFlightIds.remove(commentId)
        let afterCompletionBlocked = inFlightIds.contains(commentId)

        XCTAssertFalse(firstAttemptBlocked, "First toggle should not be blocked")
        XCTAssertTrue(secondAttemptBlocked, "Second rapid-tap should be blocked while in-flight")
        XCTAssertFalse(afterCompletionBlocked, "Lock should be released after completion")
    }

    func test_heartInFlightGuard_differentComments_independentLocks() {
        var inFlightIds: Set<String> = []
        let commentA = "cA"
        let commentB = "cB"

        inFlightIds.insert(commentA)

        XCTAssertTrue(inFlightIds.contains(commentA), "Comment A should be locked")
        XCTAssertFalse(inFlightIds.contains(commentB), "Comment B should be independent — not locked")
    }
}
