import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Guards that the onboarding language picker (`LanguageSelector`) derives its
/// options from the single translation base (`LanguageData.allLanguages`)
/// instead of a hardcoded list that drifts in spelling/membership.
@MainActor
final class LanguageSelectorDataTests: XCTestCase {

    func test_defaultLanguages_derivedFromCommonFirstBase() {
        XCTAssertEqual(
            LanguageSelector.defaultLanguages.map(\.id),
            LanguageData.allLanguagesCommonFirst.map(\.code)
        )
    }

    func test_defaultLanguages_commonLanguagesComeFirst() {
        let leading = LanguageSelector.defaultLanguages
            .prefix(LanguageData.commonLanguageCodes.count)
            .map(\.id)
        XCTAssertEqual(leading, LanguageData.commonLanguageCodes)
    }

    func test_defaultLanguages_keepsEveryLanguage_noneDropped() {
        XCTAssertEqual(
            Set(LanguageSelector.defaultLanguages.map(\.id)),
            Set(LanguageData.allLanguages.map(\.code))
        )
    }

    func test_defaultLanguages_useNativeNames_noSpellingDrift() {
        // The old hardcoded list had "Francais"/"Espanol"; the base is correct.
        let byId = Dictionary(
            uniqueKeysWithValues: LanguageSelector.defaultLanguages.map { ($0.id, $0.name) }
        )
        XCTAssertEqual(byId["fr"], "Français")
        XCTAssertEqual(byId["es"], "Español")
        XCTAssertEqual(byId["ca"], "Català", "Catalan must survive the migration to the shared base")
    }
}
