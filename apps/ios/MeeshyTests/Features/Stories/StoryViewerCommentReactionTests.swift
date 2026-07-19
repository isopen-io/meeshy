import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK
import MeeshyUI

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

    // MARK: - CommentsSheetView.computeLikedIds(from: [FeedComment]) tests
    // C'est l'overload réellement branché pour semer `likedIds` à l'ouverture de la
    // sheet (depuis `post.comments` + réponses, qui portent `currentUserReactions`).

    private func makeFeedComment(id: String, currentUserReactions: [String]?) -> FeedComment {
        FeedComment(id: id, author: "alice", authorId: "a1", content: "stub",
                    currentUserReactions: currentUserReactions)
    }

    func test_commentsSheet_computeLikedIds_feedComment_withHeartReaction_includesId() {
        let comments = [
            makeFeedComment(id: "c1", currentUserReactions: ["\u{2764}\u{FE0F}"]),
            makeFeedComment(id: "c2", currentUserReactions: ["\u{1F525}"]),
            makeFeedComment(id: "c3", currentUserReactions: nil)
        ]

        let result = CommentsSheetView.computeLikedIds(from: comments)

        XCTAssertEqual(result, ["c1"])
    }

    func test_commentsSheet_computeLikedIds_feedComment_multipleHearts_includesAll() {
        let comments = [
            makeFeedComment(id: "c1", currentUserReactions: ["\u{2764}\u{FE0F}"]),
            makeFeedComment(id: "c2", currentUserReactions: ["\u{1F525}", "\u{2764}\u{FE0F}"]),
            makeFeedComment(id: "c3", currentUserReactions: [])
        ]

        let result = CommentsSheetView.computeLikedIds(from: comments)

        XCTAssertEqual(result, ["c1", "c2"])
    }

    func test_commentsSheet_computeLikedIds_feedComment_emptyOrNil_returnsEmptySet() {
        let comments = [
            makeFeedComment(id: "c1", currentUserReactions: nil),
            makeFeedComment(id: "c2", currentUserReactions: [])
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

    // MARK: - computeLikedIds(fromCachedComments:) — cache path

    private func makeCachedComment(id: String, currentUserReactions: [String]?) -> FeedComment {
        return FeedComment(
            id: id,
            author: "Alice",
            authorId: "a1",
            content: "stub",
            currentUserReactions: currentUserReactions
        )
    }

    func test_computeLikedIds_fromCachedComments_extractsHeartReactions() {
        let comments: [FeedComment] = [
            makeCachedComment(id: "c1", currentUserReactions: ["\u{2764}\u{FE0F}"]),
            makeCachedComment(id: "c2", currentUserReactions: ["\u{1F525}"]),
            makeCachedComment(id: "c3", currentUserReactions: nil),
            makeCachedComment(id: "c4", currentUserReactions: ["\u{2764}\u{FE0F}", "\u{1F525}"]),
        ]
        let result = StoryViewerView.computeLikedIds(fromCachedComments: comments)
        XCTAssertEqual(result, ["c1", "c4"])
    }

    func test_computeLikedIds_fromCachedComments_emptyInput_returnsEmptySet() {
        let result = StoryViewerView.computeLikedIds(fromCachedComments: [])
        XCTAssertEqual(result, Set<String>())
    }

    func test_computeLikedIds_fromCachedComments_emptyReactionsArray_excludesId() {
        let comments: [FeedComment] = [
            makeCachedComment(id: "c1", currentUserReactions: [])
        ]
        let result = StoryViewerView.computeLikedIds(fromCachedComments: comments)
        XCTAssertTrue(result.isEmpty)
    }

    // MARK: - StoryCommentRowView.legibleAuthorColor tests
    //
    // Lisibilité des noms d'auteur en overlay sur une story : une couleur
    // d'auteur très sombre doit être éclaircie pour ne pas disparaître sur un
    // fond foncé ; une couleur déjà claire reste intacte.

    func test_legibleAuthorColor_darkAuthorColor_isLightenedForContrast() {
        let darkHex = "#1A1B4B" // proche indigo950 — luminance WCAG < 0.4
        let input = Color(hex: darkHex)
        let result = StoryCommentRowView.legibleAuthorColor(hex: darkHex)
        XCTAssertGreaterThan(
            result.luminance, input.luminance,
            "Une couleur d'auteur sombre doit être éclaircie pour rester lisible sur fond foncé"
        )
    }

    func test_legibleAuthorColor_brightAuthorColor_isUnchanged() {
        let brightHex = "#A5B4FC" // indigo300 — luminance WCAG >= 0.4
        let input = Color(hex: brightHex)
        let result = StoryCommentRowView.legibleAuthorColor(hex: brightHex)
        XCTAssertEqual(
            result.luminance, input.luminance, accuracy: 0.001,
            "Une couleur d'auteur déjà claire ne doit pas être modifiée"
        )
    }

    // MARK: - CommentsSheetView.shouldShowEmptyState tests
    //
    // Le placeholder « aucun commentaire » ne s'affiche QUE lorsqu'un post n'a
    // véritablement aucun commentaire — compteur autoritatif ET rangées chargées
    // à zéro. Le garde sur `commentCount == 0` empêche un flash « aucun
    // commentaire » pendant qu'un post dont les commentaires ne sont pas encore
    // hydratés (count > 0 mais liste vide) se charge.

    func test_shouldShowEmptyState_zeroCountAndZeroRows_returnsTrue() {
        XCTAssertTrue(
            CommentsSheetView.shouldShowEmptyState(commentCount: 0, topLevelCount: 0)
        )
    }

    func test_shouldShowEmptyState_hasRows_returnsFalse() {
        XCTAssertFalse(
            CommentsSheetView.shouldShowEmptyState(commentCount: 3, topLevelCount: 3)
        )
    }

    func test_shouldShowEmptyState_countPositiveButRowsUnhydrated_returnsFalse() {
        XCTAssertFalse(
            CommentsSheetView.shouldShowEmptyState(commentCount: 5, topLevelCount: 0),
            "Un post au compteur > 0 mais liste non hydratée ne doit pas flasher « aucun commentaire »"
        )
    }
}
