import XCTest
@testable import Meeshy

/// Le seul morceau de logique pure de la barre rapide de langues : décider
/// quelle pastille est « active » (surlignée). La comparaison doit être
/// insensible à la casse et tolérer les variantes BCP-47 (`pt-BR` ↔ `pt`),
/// sinon la langue effectivement affichée n'est jamais mise en évidence.
final class StoryLanguageQuickBarTests: XCTestCase {

    func test_isActive_exactMatch_true() {
        XCTAssertTrue(StoryLanguageQuickBar.isActive("fr", active: "fr"))
    }

    func test_isActive_caseInsensitive_true() {
        XCTAssertTrue(StoryLanguageQuickBar.isActive("EN", active: "en"))
    }

    func test_isActive_bcp47VariantSharesBase_true() {
        XCTAssertTrue(StoryLanguageQuickBar.isActive("pt-BR", active: "pt"))
        XCTAssertTrue(StoryLanguageQuickBar.isActive("pt", active: "pt-BR"))
    }

    func test_isActive_nilActive_false() {
        XCTAssertFalse(StoryLanguageQuickBar.isActive("fr", active: nil))
    }

    func test_isActive_differentLanguage_false() {
        XCTAssertFalse(StoryLanguageQuickBar.isActive("fr", active: "en"))
    }
}
