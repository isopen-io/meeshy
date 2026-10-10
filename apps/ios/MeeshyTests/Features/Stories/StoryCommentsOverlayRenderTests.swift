import XCTest
import MeeshySDK
@testable import Meeshy

// **#9859 — la barre de progression n'invalide plus les commentaires.**
// Recette du 2026-10-10 : commentaires ouverts sur une story qui boucle, 75 à
// 90 % de processeur, et un figeage à 100 % dans la mise en page de la liste.
// Chaque tick de la barre reconstruisait l'overlay, ses rangées et leurs menus.

final class StoryCommentsOverlayRenderTests: XCTestCase {

    private static func comments() -> [FeedComment] {
        [FeedComment(id: "c1", author: "Ana", content: "Bonjour"),
         FeedComment(id: "c2", author: "Ben", content: "Salut")]
    }

    private static func inputs(
        comments: [FeedComment],
        replies: [String: [FeedComment]] = [:],
        likedIds: Set<String> = []
    ) -> StoryCommentsRenderInputs {
        StoryCommentsRenderInputs(
            comments: comments, commentCount: comments.count, replies: replies,
            expandedThreads: [], loadingReplies: [], repliesHasMore: [:],
            isLoading: false, userLang: "fr", isStoryExpired: false,
            targetCommentId: nil, targetParentCommentId: nil, safeBottom: 34,
            replyingToId: nil, likedIds: likedIds, likeDelta: [:], inFlightIds: []
        )
    }

    /// Un tick de la barre ne touche à aucune donnée des commentaires : les
    /// entrées de deux rendus successifs sont ÉGALES, l'overlay n'est pas
    /// reconstruit.
    func test_aProgressTick_leavesTheOverlayInputsEqual() {
        let comments = Self.comments()
        let replies = ["c1": [FeedComment(id: "r1", author: "Cléo", content: "Oui", parentId: "c1")]]
        XCTAssertEqual(Self.inputs(comments: comments, replies: replies),
                       Self.inputs(comments: comments, replies: replies))
    }

    /// La progression et la boucle ne sont PAS des entrées de la liste.
    func test_theOverlayInputs_ignoreTheStoryClock() {
        let labels = Mirror(reflecting: Self.inputs(comments: [])).children.compactMap(\.label)
        XCTAssertFalse(labels.isEmpty)
        for label in labels {
            XCTAssertFalse(label.lowercased().contains("progress"), label)
            XCTAssertFalse(label.lowercased().contains("loop"), label)
        }
    }

    func test_aNewComment_rebuildsTheOverlay() {
        let comments = Self.comments()
        var arrived = comments
        arrived.append(FeedComment(id: "c3", author: "Dan", content: "Hey"))
        XCTAssertNotEqual(Self.inputs(comments: comments), Self.inputs(comments: arrived))
    }

    /// Une mutation EN PLACE (un j'aime reconfirmé, un texte édité) alloue un
    /// nouveau stockage tant que l'ancien rendu tient le sien.
    func test_anEditedComment_rebuildsTheOverlay() {
        let comments = Self.comments()
        var edited = comments
        edited[0].likes += 1
        XCTAssertNotEqual(Self.inputs(comments: comments), Self.inputs(comments: edited))
    }

    func test_aLike_rebuildsTheOverlay() {
        let comments = Self.comments()
        XCTAssertNotEqual(Self.inputs(comments: comments), Self.inputs(comments: comments, likedIds: ["c1"]))
    }

    func test_aPageOfReplies_rebuildsTheOverlay() {
        let comments = Self.comments()
        let before = ["c1": [FeedComment(id: "r1", author: "Cléo", content: "Oui", parentId: "c1")]]
        var after = before
        after["c1", default: []].append(FeedComment(id: "r2", author: "Dan", content: "Non", parentId: "c1"))
        XCTAssertNotEqual(Self.inputs(comments: comments, replies: before),
                          Self.inputs(comments: comments, replies: after))
    }

    /// Prudence assumée : un contenu égal dans un AUTRE stockage compte pour
    /// différent — un rendu de trop, jamais un rendu manqué.
    func test_equalContentInAnotherStorage_rebuildsRatherThanMisses() {
        XCTAssertNotEqual(Self.inputs(comments: Self.comments()), Self.inputs(comments: Self.comments()))
        XCTAssertTrue(ArrayStorageIdentity.same([FeedComment](), []))
    }

    /// L'overlay est monté derrière sa comparaison.
    func test_theCardMountsTheOverlay_behindItsComparison() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        func read(_ name: String) throws -> String {
            AppSourceGuard.stripComments(try String(
                contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Views/" + name), encoding: .utf8))
        }
        let canvas = try read("StoryViewerView+Canvas.swift")
        XCTAssertTrue(canvas.contains("let makeCommentsOverlay: () -> StoryCommentsOverlayHost"))
        XCTAssertTrue(canvas.contains("makeCommentsOverlay().equatable()"))
        XCTAssertTrue(try read("StoryViewerView.swift").contains("makeCommentsOverlay: { storyCommentsOverlayHost() }"))
    }
}
