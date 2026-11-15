import XCTest
import SwiftUI
@testable import Meeshy

/// **Répondre à un commentaire le garde en vue** (#8644) : la liste ramène la
/// cible juste au-dessus du composeur une fois le clavier monté, dans la
/// feuille de commentaires comme dans le détail d'un post.
final class CommentReplyFocusTests: XCTestCase {

    func test_uneReponse_viseLaRangeeDeSaCible() {
        XCTAssertEqual(CommentReplyFocus.scrollTarget(replyingToId: "abc"), "comment-abc")
    }

    func test_uneReponseRefermee_neDefilePas() {
        XCTAssertNil(CommentReplyFocus.scrollTarget(replyingToId: nil))
        XCTAssertNil(CommentReplyFocus.scrollTarget(replyingToId: ""))
    }

    /// Juste au-dessus du composeur, et après que le clavier s'est posé.
    func test_laCible_sePoseEnBasDeLaZoneVisible_apresLeClavier() {
        XCTAssertEqual(CommentReplyFocus.anchor, .bottom)
        XCTAssertGreaterThanOrEqual(CommentReplyFocus.keyboardSettleDelay, 0.25)
        XCTAssertLessThanOrEqual(CommentReplyFocus.keyboardSettleDelay, 0.6)
    }

    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try String(
            contentsOf: AppSourceGuard.unitURLs(chemin)[0], encoding: .utf8))
    }

    /// Les deux hôtes du même geste reçoivent le même correctif.
    func test_lesDeuxHotesDuGesteRepondre_gardentLaCibleEnVue() throws {
        XCTAssertTrue(try source("Meeshy/Features/Main/Views/FeedCommentsSheet.swift")
            .contains(".keepsReplyTargetInView(replyingTo?.id, proxy: commentsProxy)"))
        XCTAssertTrue(try source("Meeshy/Features/Main/Views/PostDetailView.swift")
            .contains(".keepsReplyTargetInView(viewModel.replyingTo?.id, proxy: scrollProxy)"))
    }

    /// Les rangées portent bien l'identifiant que la règle vise — sans lui, le
    /// défilement ne trouverait rien et ne rougirait nulle part.
    func test_lesRangees_portentLIdentifiantVise() throws {
        XCTAssertTrue(try source("Meeshy/Features/Main/Views/FeedCommentsSheet.swift")
            .contains(".id(\"comment-\\(comment.id)\")"))
    }
}
