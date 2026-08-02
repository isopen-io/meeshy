import XCTest
@testable import Meeshy

/// Le stripper partagé des gardes de source — chaque cas ci-dessous est un
/// mode d'échec RÉEL d'un des anciens strippers locaux qu'il remplace.
final class AppSourceGuardTests: XCTestCase {

    func test_trailingLineComment_isRemoved() {
        // Les `codeLines` ne filtraient que les lignes COMMENÇANT par `//` :
        // un commentaire de fin de ligne citant le symbole cherché suffisait
        // à faire passer une garde sur du code qui ne l'applique pas.
        let stripped = AppSourceGuard.stripComments("let x = 1 // symboleRecherché\n")
        XCTAssertFalse(stripped.contains("symboleRecherché"))
        XCTAssertTrue(stripped.contains("let x = 1"))
    }

    func test_urlInStringLiteral_survives() {
        // Le stripper de StoryOverlayWidthPinGuardTests coupait au premier
        // `//` SANS conscience des littéraux : une URL tronquait la ligne et
        // faisait DISPARAÎTRE le code que la garde inspectait.
        let stripped = AppSourceGuard.stripComments(#"let url = "https://gate.meeshy.me" .zIndex(3)"#)
        XCTAssertTrue(stripped.contains(#""https://gate.meeshy.me""#))
        XCTAssertTrue(stripped.contains(".zIndex(3)"))
    }

    func test_multiLineBlockComment_isRemoved() {
        let source = """
        let a = 1
        /* bloc
           citant symboleRecherché
        */ let b = 2
        """
        let stripped = AppSourceGuard.stripComments(source)
        XCTAssertFalse(stripped.contains("symboleRecherché"))
        XCTAssertTrue(stripped.contains("let a = 1"))
        XCTAssertTrue(stripped.contains("let b = 2"))
    }

    func test_escapedQuoteInString_doesNotLeakIntoCodeMode() {
        let stripped = AppSourceGuard.stripComments(#"let s = "guillemet \" // pas un commentaire" + reste"#)
        XCTAssertTrue(stripped.contains("pas un commentaire"))
        XCTAssertTrue(stripped.contains("+ reste"))
    }

    func test_divisionOperator_isNotEatenAsComment() {
        let stripped = AppSourceGuard.stripComments("let ratio = width / height\n")
        XCTAssertTrue(stripped.contains("width / height"))
    }

    func test_lineStructure_isPreserved_forLineOrientedGuards() {
        let source = "let a = 1 // fin\nlet b = 2\n/* bloc\nbloc */\nlet c = 3"
        let lines = AppSourceGuard.strippedLines(source)
        XCTAssertEqual(lines.count, 5, "Les sauts de ligne survivent — les gardes ligne à ligne comptent dessus")
        XCTAssertTrue(lines[4].contains("let c = 3"))
    }
}
