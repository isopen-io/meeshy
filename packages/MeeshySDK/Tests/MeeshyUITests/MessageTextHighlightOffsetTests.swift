import XCTest
import SwiftUI
@testable import MeeshyUI

/// La recherche dans la conversation surligne en UNITÉS UTF-16 (`NSRange`) ; le rendu comptait ses segments en
/// CARACTÈRES. Chaque émoji avant le terme décalait le surlignage d'un cran — ou le faisait disparaître.
@MainActor
final class MessageTextHighlightOffsetTests: XCTestCase {

    private func highlighted(_ text: String, _ term: String) -> String {
        let rendered = MessageTextRenderer.attributed(text, color: .primary, highlightTerm: term)
        return rendered.runs
            .filter { $0.backgroundColor != nil && $0.link == nil }
            .map { String(rendered[$0.range].characters) }
            .joined()
    }

    func test_plainText_isHighlightedExactly() {
        XCTAssertEqual(highlighted("Bonjour le monde", "monde"), "monde")
    }

    func test_anEmojiBeforeTheTerm_doesNotShiftTheHighlight() {
        XCTAssertEqual(highlighted("😀 bonjour", "bonjour"), "bonjour")
        XCTAssertEqual(highlighted("👨‍👩‍👧 et 🇫🇷 puis salut", "salut"), "salut")
    }

    func test_twoMatchesAroundEmojis_areBothExact() {
        XCTAssertEqual(highlighted("chat 🐱 chat", "chat"), "chatchat")
    }

    /// Les marqueurs Markdown sont retirés à l'affichage : les plages prises sur
    /// le texte brut décalaient le surlignage de leur longueur.
    func test_markdownMarkersBeforeTheTerm_doNotShiftTheHighlight() {
        XCTAssertEqual(highlighted("**a** foo bar", "oo"), "oo")
        XCTAssertEqual(highlighted("_x_ ~~y~~ salut", "salut"), "salut")
    }
}
