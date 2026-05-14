import XCTest
@testable import Meeshy
import MeeshySDK

final class StoryViewerCommentReactionTests: XCTestCase {

    // MARK: - Factory Helpers

    private static func makeComment(
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

    // MARK: - Tests

    func test_computeLikedIds_withHeartReaction_includesCommentId() {
        let comments = [
            Self.makeComment(id: "c1", currentUserReactions: ["\u{2764}\u{FE0F}"]),
            Self.makeComment(id: "c2", currentUserReactions: ["\u{1F525}"]),
            Self.makeComment(id: "c3", currentUserReactions: nil)
        ]

        let result = StoryViewerView.computeLikedIds(from: comments)

        XCTAssertEqual(result, ["c1"])
    }

    func test_computeLikedIds_withNoReactions_returnsEmptySet() {
        let comments = [
            Self.makeComment(id: "c1", currentUserReactions: nil),
            Self.makeComment(id: "c2", currentUserReactions: [])
        ]

        let result = StoryViewerView.computeLikedIds(from: comments)

        XCTAssertTrue(result.isEmpty)
    }

    func test_computeLikedIds_withMultipleHeartComments_includesAllIds() {
        let comments = [
            Self.makeComment(id: "c1", currentUserReactions: ["\u{2764}\u{FE0F}"]),
            Self.makeComment(id: "c2", currentUserReactions: ["\u{2764}\u{FE0F}", "\u{1F525}"]),
            Self.makeComment(id: "c3", currentUserReactions: ["\u{1F525}"])
        ]

        let result = StoryViewerView.computeLikedIds(from: comments)

        XCTAssertEqual(result, ["c1", "c2"])
    }

    func test_computeLikedIds_withEmptyList_returnsEmptySet() {
        let result = StoryViewerView.computeLikedIds(from: [])

        XCTAssertTrue(result.isEmpty)
    }
}
