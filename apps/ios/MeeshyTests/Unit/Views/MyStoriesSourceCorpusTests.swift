import XCTest
@testable import Meeshy

/// Le corpus est l'outil dont dépendent cinq suites de gardes : s'il ment, il
/// les rend toutes tautologiques sans que rien ne le signale.
final class MyStoriesSourceCorpusTests: XCTestCase {

    /// **La racine se REMONTE jusqu'à `MeeshyTests`, elle ne se compte pas.**
    ///
    /// La forme d'origine retirait quatre composants du `#filePath` de
    /// l'APPELANT — ce qui suppose que tout appelant vit exactement à
    /// `MeeshyTests/Unit/Views/`. La première garde rangée un cran plus
    /// profond (`Unit/Views/Bubble/`, #4098) a obtenu `apps/ios/MeeshyTests`
    /// pour racine et dix « no such file » sur des fichiers bien présents.
    ///
    /// Le bruit était le cas HEUREUX : si la mauvaise racine avait contenu un
    /// fichier de même nom, la garde aurait lu le MAUVAIS fichier et serait
    /// passée au vert. D'où ce témoin, sur trois profondeurs.
    func test_appRoot_isTheSameFromAnyDepthUnderMeeshyTests() {
        XCTAssertEqual(
            MyStoriesSourceCorpus.appRoot(file: "/r/apps/ios/MeeshyTests/Unit/Views/A.swift").path,
            "/r/apps/ios")
        XCTAssertEqual(
            MyStoriesSourceCorpus.appRoot(file: "/r/apps/ios/MeeshyTests/Unit/Views/Bubble/B.swift").path,
            "/r/apps/ios")
        XCTAssertEqual(
            MyStoriesSourceCorpus.appRoot(file: "/r/apps/ios/MeeshyTests/C.swift").path,
            "/r/apps/ios")
    }

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
