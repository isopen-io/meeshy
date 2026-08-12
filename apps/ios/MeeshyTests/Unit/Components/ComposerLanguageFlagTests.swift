import XCTest
@testable import Meeshy

/// Le bouton langue du composer de post replié n'affiche QUE le drapeau
/// (directive 2026-07-30) — le nom de la langue n'apparaît que dans la liste
/// du picker. Ces tests épinglent le rendu du libellé drapeau.
final class ComposerLanguageFlagTests: XCTestCase {

    func test_label_knownCode_returnsFlag() {
        XCTAssertEqual(ComposerLanguageFlag.label(for: "fr"), "\u{1F1EB}\u{1F1F7}")
        XCTAssertEqual(ComposerLanguageFlag.label(for: "en"), "\u{1F1EC}\u{1F1E7}")
    }

    func test_label_regionalCode_normalisesToBaseFlag() {
        XCTAssertEqual(
            ComposerLanguageFlag.label(for: "pt-BR"),
            "\u{1F1E7}\u{1F1F7}",
            "pt-BR doit se réduire à pt et rendre le drapeau portugais"
        )
    }

    func test_label_unknownCode_fallsBackToUppercasedCode() {
        XCTAssertEqual(
            ComposerLanguageFlag.label(for: "xx"), "XX",
            "Un code inconnu ne doit jamais produire un bouton vide"
        )
    }
}
