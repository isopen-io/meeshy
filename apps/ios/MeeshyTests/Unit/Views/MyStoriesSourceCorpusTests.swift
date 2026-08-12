import XCTest
@testable import Meeshy

/// Le corpus est l'outil dont dépendent cinq suites de gardes : s'il ment, il
/// les rend toutes tautologiques sans que rien ne le signale.
final class MyStoriesSourceCorpusTests: XCTestCase {

    func test_corpus_containsTheMainViewSource() {
        XCTAssertTrue(MyStoriesSourceCorpus.text().contains("struct MyStoriesView"),
                      "Le corpus doit au minimum contenir la vue principale")
    }

    func test_corpus_ignoresFilesThatDoNotExistYet() {
        // La liste anticipe la décomposition : un fichier pas encore créé ne
        // doit pas faire échouer les gardes.
        XCTAssertFalse(MyStoriesSourceCorpus.text().isEmpty)
    }

    func test_missingFile_throwsWhenTargetedExplicitly() {
        XCTAssertThrowsError(
            try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/DoesNotExist.swift"),
            "Viser un fichier précis qui n'existe pas est une erreur de garde, pas un silence")
    }

    // MARK: - Retrait des commentaires

    func test_stripping_removesLineComments() {
        let stripped = MyStoriesSourceCorpus.strippingComments("let a = 1 // interdit()\n")
        XCTAssertTrue(stripped.contains("let a = 1"))
        XCTAssertFalse(stripped.contains("interdit()"),
                       "Une garde ne doit pas passer au vert grâce à un commentaire")
    }

    func test_stripping_removesBlockComments_acrossLines() {
        let stripped = MyStoriesSourceCorpus.strippingComments("""
        let a = 1
        /* interdit()
           encore interdit() */
        let b = 2
        """)
        XCTAssertTrue(stripped.contains("let a = 1"))
        XCTAssertTrue(stripped.contains("let b = 2"))
        XCTAssertFalse(stripped.contains("interdit()"))
    }

    /// Un `//` dans un littéral n'ouvre pas de commentaire : tronquer la ligne
    /// ferait disparaître du VRAI code, et la garde virerait au rouge sur une
    /// URL parfaitement innocente.
    func test_stripping_keepsDoubleSlashInsideAStringLiteral() {
        let stripped = MyStoriesSourceCorpus.strippingComments(
            "let url = \"https://meeshy.me\"; onCreateStory()\n")
        XCTAssertTrue(stripped.contains("onCreateStory()"),
                      "obtenu : \(stripped)")
    }

    func test_stripping_handlesEscapedQuotes() {
        let stripped = MyStoriesSourceCorpus.strippingComments(
            "let s = \"il a dit \\\"salut\\\"\"; garder()\n")
        XCTAssertTrue(stripped.contains("garder()"), "obtenu : \(stripped)")
    }
}
