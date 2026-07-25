import XCTest
@testable import MeeshyUI

/// Le strip de drapeaux du viewer est remplacé par cette feuille (directive user
/// 2026-07-25). Elle doit donc porter ce que le strip apportait : voir d'un coup
/// d'œil quelles langues sont DÉJÀ traduites — donc instantanées — et lesquelles
/// déclencheront une demande de traduction de toute la story.
@MainActor
final class LanguagePickerAvailabilityTests: XCTestCase {

    private func languages(_ ids: [String]) -> [TranslationLanguage] {
        ids.map { TranslationLanguage(id: $0, flag: "🏳️", name: $0, group: $0) }
    }

    func test_ordered_putsAvailableLanguagesFirst() {
        let all = languages(["fr", "en", "es", "de"])
        let ordered = LanguagePickerSheet.ordered(all, available: ["es", "de"])

        XCTAssertEqual(ordered.map(\.id), ["es", "de", "fr", "en"])
    }

    /// Sans langue disponible, l'ordre canonique est préservé — pas de tri
    /// surprise sur une story qui n'a encore aucune traduction.
    func test_ordered_withoutAvailable_keepsCanonicalOrder() {
        let all = languages(["fr", "en", "es"])
        XCTAssertEqual(LanguagePickerSheet.ordered(all, available: []).map(\.id),
                       ["fr", "en", "es"])
    }

    /// L'ordre relatif à l'intérieur de chaque groupe est conservé : la liste
    /// canonique classe déjà les langues par famille, on ne la mélange pas.
    func test_ordered_preservesRelativeOrderWithinGroups() {
        let all = languages(["fr", "en", "es", "de", "it"])
        let ordered = LanguagePickerSheet.ordered(all, available: ["de", "fr"])

        XCTAssertEqual(ordered.map(\.id), ["fr", "de", "en", "es", "it"])
    }

    /// Une langue disponible absente du catalogue ne doit rien casser.
    func test_ordered_ignoresUnknownAvailableIds() {
        let all = languages(["fr", "en"])
        XCTAssertEqual(LanguagePickerSheet.ordered(all, available: ["zz"]).map(\.id),
                       ["fr", "en"])
    }
}
