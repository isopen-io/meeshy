import XCTest
@testable import Meeshy

/// Tests de la logique pure de labellisation VoiceOver des compteurs
/// like / comment / repost partagés par `TextPostCell` et `MediaPostCell`.
///
/// Contrat : le titre visible du bouton n'affiche que le nombre nu ("5") ;
/// l'accessibilityLabel doit exposer le SENS du compteur avec accord
/// singulier/pluriel (Automatic Grammar Agreement, `inflect: true`) —
/// sinon VoiceOver annonce "5, bouton" sans indiquer de quoi il s'agit.
///
/// `@MainActor` : `PostStatAccessibility` vit dans le target app, isolé
/// main-actor-par-défaut (Swift 6.2) ; les appels synchrones depuis les tests
/// doivent donc partager cet acteur (même contrat que `MessageDayLabelTests`).
@MainActor
final class PostStatAccessibilityTests: XCTestCase {

    // MARK: - Le compteur est toujours présent dans le label

    func test_likesLabel_includesCount() {
        XCTAssertTrue(PostStatAccessibility.likesLabel(42).contains("42"))
    }

    func test_commentsLabel_includesCount() {
        XCTAssertTrue(PostStatAccessibility.commentsLabel(7).contains("7"))
    }

    func test_repostsLabel_includesCount() {
        XCTAssertTrue(PostStatAccessibility.repostsLabel(3).contains("3"))
    }

    // MARK: - Accord singulier / pluriel (langue de dev = en)

    func test_likesLabel_singularForOne() {
        XCTAssertEqual(PostStatAccessibility.likesLabel(1), "1 like")
    }

    func test_likesLabel_pluralForMany() {
        XCTAssertEqual(PostStatAccessibility.likesLabel(5), "5 likes")
    }

    func test_likesLabel_pluralForZero() {
        XCTAssertEqual(PostStatAccessibility.likesLabel(0), "0 likes")
    }

    func test_commentsLabel_singularForOne() {
        XCTAssertEqual(PostStatAccessibility.commentsLabel(1), "1 comment")
    }

    func test_commentsLabel_pluralForMany() {
        XCTAssertEqual(PostStatAccessibility.commentsLabel(12), "12 comments")
    }

    func test_repostsLabel_singularForOne() {
        XCTAssertEqual(PostStatAccessibility.repostsLabel(1), "1 repost")
    }

    func test_repostsLabel_pluralForMany() {
        XCTAssertEqual(PostStatAccessibility.repostsLabel(4), "4 reposts")
    }

    // MARK: - Chaque compteur nomme sa propre sémantique (pas de confusion)

    func test_labels_areDistinctPerStatType() {
        let likes = PostStatAccessibility.likesLabel(2)
        let comments = PostStatAccessibility.commentsLabel(2)
        let reposts = PostStatAccessibility.repostsLabel(2)
        XCTAssertNotEqual(likes, comments)
        XCTAssertNotEqual(comments, reposts)
        XCTAssertNotEqual(likes, reposts)
    }
}
