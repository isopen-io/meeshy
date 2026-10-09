import XCTest
@testable import MeeshySDK

/// #9727 — ce que chaque personne de la liste des vues a fait, décodé depuis
/// la ligne servie par `GET /posts/:postId/interactions`.
final class PostViewerEngagementTests: XCTestCase {

    private func decode(_ json: String) throws -> PostViewerEngagement {
        try JSONDecoder().decode(PostViewerEngagement.self, from: Data(json.utf8))
    }

    func test_decode_fullRow_readsEveryMark() throws {
        let engagement = try decode("""
        {
            "id": "u1", "username": "noor", "displayName": "Noor", "avatarUrl": null,
            "viewedAt": "2026-10-10T12:00:00.000Z",
            "reaction": "😂", "reactions": ["❤️", "😂"],
            "shareCount": 1, "repostCount": 2, "commentCount": 3, "replyCount": 4
        }
        """)

        XCTAssertEqual(engagement, PostViewerEngagement(
            reactions: ["❤️", "😂"], shareCount: 1, repostCount: 2, commentCount: 3, replyCount: 4
        ))
        XCTAssertEqual(engagement.latestReaction, "😂")
    }

    func test_decode_rowWithoutCounters_isEmpty() throws {
        let engagement = try decode("""
        { "id": "u2", "username": "elan", "reaction": null }
        """)

        XCTAssertEqual(engagement, PostViewerEngagement())
        XCTAssertTrue(engagement.marks.isEmpty)
    }

    func test_decode_legacyServer_keepsTheSingleReaction() throws {
        let engagement = try decode("""
        { "id": "u3", "username": "mika", "reaction": "👍" }
        """)

        XCTAssertEqual(engagement.marks, [.reactions(["👍"])])
    }

    func test_decode_malformedField_neverBreaksTheRow() throws {
        let engagement = try decode("""
        { "id": "u4", "username": "x", "reaction": null, "commentCount": "deux", "bookmarked": "oui", "replyCount": 2 }
        """)

        XCTAssertEqual(engagement.marks, [.replies(2)])
    }

    func test_marks_followTheSheetOrder_andSkipZeros() {
        let engagement = PostViewerEngagement(
            reactions: ["🔥"], shareCount: 0, repostCount: 1, commentCount: 0, replyCount: 2
        )

        XCTAssertEqual(engagement.marks, [.reactions(["🔥"]), .replies(2), .reposts(1)])
    }

    func test_decode_bookmarkServedByAnOlderGateway_isNeverShown() throws {
        let engagement = try decode("""
        { "id": "u5", "username": "lea", "reaction": null, "commentCount": 1, "bookmarked": true }
        """)

        XCTAssertEqual(engagement, PostViewerEngagement(commentCount: 1))
        XCTAssertEqual(engagement.marks, [.comments(1)])
    }
}
