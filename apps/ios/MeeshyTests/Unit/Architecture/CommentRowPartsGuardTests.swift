import XCTest
@testable import Meeshy

/// A post comment row and a story comment row share their author header and
/// their like (#13133): the like's vocabulary — the ACTION as name, the COUNT
/// as value — lives once, in `CommentLikeButton`, and neither row redeclares it.
final class CommentRowPartsGuardTests: XCTestCase {

    private let rows = ["Views/CommentRowView.swift", "Views/StoryCommentRowView.swift"]

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let text = try String(contentsOf: root.appendingPathComponent("Meeshy/Features/Main/\(relative)"), encoding: .utf8)
        return AppSourceGuard.stripComments(text)
    }

    func test_bothRows_mountTheSharedHeaderAndLike() throws {
        for row in rows {
            let text = try source(row)
            XCTAssertTrue(text.contains("CommentAuthorHeader("), "\(row) must mount the shared author header")
            XCTAssertTrue(text.contains("CommentLikeButton("), "\(row) must mount the shared like")
        }
    }

    func test_theLikeVocabulary_livesOnlyInTheSharedLike() throws {
        for row in rows {
            let text = try source(row)
            XCTAssertFalse(text.contains("a11y.comment.like.hint"), "\(row) redeclares the like's vocabulary")
            XCTAssertFalse(text.contains("EngagementGlyph("), "\(row) redraws the like's heart")
        }
        XCTAssertTrue(try source("Views/CommentRowParts.swift").contains("a11y.comment.like.hint"))
    }
}
