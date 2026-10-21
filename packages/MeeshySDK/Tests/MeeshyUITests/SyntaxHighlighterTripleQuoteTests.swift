import XCTest
@testable import MeeshyUI

/// Une ligne qui se termine sur une chaîne triple (`"""…"""`) ou qui en ouvre une sans la fermer (`let s = """`)
/// faisait lire `line[endIndex]` : le `continue` relançait la boucle `for` des délimiteurs, pas celle de la ligne.
/// Plantage à l'affichage d'une pièce jointe de code Python, Swift ou Kotlin.
@MainActor
final class SyntaxHighlighterTripleQuoteTests: XCTestCase {

    private func joined(_ lines: [[SyntaxToken]]) -> [String] {
        lines.map { $0.map(\.text).joined() }
    }

    func test_aLineEndingOnAClosedTripleString_doesNotTrap() {
        let code = #"doc = """hello""""#
        for language in [CodeLanguage.python, .swift, .kotlin] {
            let lines = SyntaxHighlighter.tokenize(code, language: language)
            XCTAssertEqual(joined(lines), [code], "\(language) : le texte ressort intact")
            XCTAssertTrue(lines[0].contains { $0.text == #""""hello""""# && $0.type == .string })
        }
    }

    func test_anUnterminatedTripleString_doesNotTrap() {
        let code = "let s = \"\"\"\nbody\n\"\"\""
        for language in [CodeLanguage.python, .swift, .kotlin] {
            XCTAssertEqual(joined(SyntaxHighlighter.tokenize(code, language: language)).count, 3, "\(language)")
        }
    }

    func test_codeAfterAClosedTripleString_isStillTokenised() {
        let lines = SyntaxHighlighter.tokenize(#"x = """a""" + 'b'"#, language: .python)
        XCTAssertEqual(joined(lines), [#"x = """a""" + 'b'"#])
        XCTAssertTrue(lines[0].contains { $0.text == "'b'" && $0.type == .string })
    }
}
