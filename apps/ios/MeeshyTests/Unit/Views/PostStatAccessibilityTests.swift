import XCTest
@testable import Meeshy

/// Tests de la logique pure de labellisation VoiceOver des compteurs
/// like / comment / repost partagés par `TextPostCell` et `MediaPostCell`.
///
/// Contrat : le titre visible du bouton n'affiche que le nombre nu ("5") ;
/// l'accessibilityLabel doit exposer le SENS du compteur avec accord
/// singulier/pluriel résolu explicitement — sinon VoiceOver annonce
/// "5, bouton" sans indiquer de quoi il s'agit. (L'AGA inline
/// `^[…](inflect: true)` est proscrit ici : sans entrée String Catalog,
/// le markup fuit en brut sur iOS 18.x — cf. `ExplicitPluralLabelTests`.)
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

    func test_repliesLabel_includesCount() {
        XCTAssertTrue(PostStatAccessibility.repliesLabel(9).contains("9"))
    }

    // MARK: - Accord singulier / pluriel, langue par langue
    //
    // La langue que résout `String(localized:)` vient du BUNDLE, donc de la
    // langue du simulateur : comparer à une chaîne littérale sans fixer le
    // bundle donne un test vert en local (simu français) et rouge en CI (simu
    // anglais). D'où l'injection explicite de `en.lproj` / `fr.lproj` — la
    // suite juge alors l'accord réel, sur la machine de n'importe qui.
    //
    // Noter que « j'aime » est invariable en français : le pluriel ne calque
    // pas l'anglais, et c'est bien ce que doit lire VoiceOver.

    /// Table de traduction ET règle de pluriel : les DEUX sont nécessaires.
    /// Le bundle seul ne suffit pas — table anglaise + simulateur français
    /// rend « 0 like », le français rangeant 0 dans le singulier.
    private func label(_ make: (Int, Bundle, Locale) -> String,
                       _ count: Int,
                       in code: String) throws -> String {
        let path = try XCTUnwrap(
            Bundle.main.path(forResource: code, ofType: "lproj"),
            "localisation « \(code) » absente du bundle — régression de packaging"
        )
        return make(count, try XCTUnwrap(Bundle(path: path)), Locale(identifier: code))
    }

    func test_likesLabel_singularForOne() throws {
        let likes = PostStatAccessibility.likesLabel
        XCTAssertEqual(try label(likes, 1, in: "en"), "1 like")
        XCTAssertEqual(try label(likes, 1, in: "fr"), "1 j'aime")
    }

    func test_likesLabel_pluralForMany() throws {
        let likes = PostStatAccessibility.likesLabel
        XCTAssertEqual(try label(likes, 5, in: "en"), "5 likes")
        XCTAssertEqual(try label(likes, 5, in: "fr"), "5 j'aime")
    }

    func test_likesLabel_pluralForZero() throws {
        let likes = PostStatAccessibility.likesLabel
        XCTAssertEqual(try label(likes, 0, in: "en"), "0 likes")
        XCTAssertEqual(try label(likes, 0, in: "fr"), "0 j'aime")
    }

    func test_commentsLabel_singularForOne() throws {
        let comments = PostStatAccessibility.commentsLabel
        XCTAssertEqual(try label(comments, 1, in: "en"), "1 comment")
        XCTAssertEqual(try label(comments, 1, in: "fr"), "1 commentaire")
    }

    func test_commentsLabel_pluralForMany() throws {
        let comments = PostStatAccessibility.commentsLabel
        XCTAssertEqual(try label(comments, 12, in: "en"), "12 comments")
        XCTAssertEqual(try label(comments, 12, in: "fr"), "12 commentaires")
    }

    func test_repostsLabel_singularForOne() throws {
        let reposts = PostStatAccessibility.repostsLabel
        XCTAssertEqual(try label(reposts, 1, in: "en"), "1 repost")
        XCTAssertEqual(try label(reposts, 1, in: "fr"), "1 repartage")
    }

    func test_repostsLabel_pluralForMany() throws {
        let reposts = PostStatAccessibility.repostsLabel
        XCTAssertEqual(try label(reposts, 4, in: "en"), "4 reposts")
        XCTAssertEqual(try label(reposts, 4, in: "fr"), "4 repartages")
    }

    // MARK: - `replies` : le nom compté ajouté en 240i
    //
    // Le défaut d'origine était VISIBLE à l'écran : `feed.post.comment.replies_count`
    // (plate) rendait « 1 réponses » sur `FeedPostCard`, et « 1 replies » en
    // anglais. C'est l'accord singulier — le cas que la clé plate ne pouvait pas
    // faire — qui doit être juste dans les deux langues.

    func test_repliesLabel_singularForOne() throws {
        let replies = PostStatAccessibility.repliesLabel
        XCTAssertEqual(try label(replies, 1, in: "en"), "1 reply")
        XCTAssertEqual(try label(replies, 1, in: "fr"), "1 réponse")
    }

    func test_repliesLabel_pluralForMany() throws {
        let replies = PostStatAccessibility.repliesLabel
        XCTAssertEqual(try label(replies, 8, in: "en"), "8 replies")
        XCTAssertEqual(try label(replies, 8, in: "fr"), "8 réponses")
    }

    func test_repliesLabel_pluralForZero() throws {
        let replies = PostStatAccessibility.repliesLabel
        XCTAssertEqual(try label(replies, 0, in: "en"), "0 replies")
        XCTAssertEqual(try label(replies, 0, in: "fr"), "0 réponse")
    }

    // MARK: - Chaque compteur nomme sa propre sémantique (pas de confusion)

    func test_labels_areDistinctPerStatType() {
        let likes = PostStatAccessibility.likesLabel(2)
        let comments = PostStatAccessibility.commentsLabel(2)
        let reposts = PostStatAccessibility.repostsLabel(2)
        let replies = PostStatAccessibility.repliesLabel(2)
        XCTAssertNotEqual(likes, comments)
        XCTAssertNotEqual(comments, reposts)
        XCTAssertNotEqual(likes, reposts)
        XCTAssertNotEqual(replies, comments)
        XCTAssertNotEqual(replies, reposts)
        XCTAssertNotEqual(replies, likes)
    }
}
