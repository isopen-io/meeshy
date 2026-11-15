import XCTest
import MeeshySDK
@testable import Meeshy

/// Le libellé d'usage d'un cadre nomme ses paramètres avec les mots du jeu, dans la
/// langue de l'interface — jamais la valeur brute de la loi (« epic », « level-100 »).
@MainActor
final class FrameUsageCopyTests: XCTestCase {

    func test_name_ofEveryRarity_isTheGameRarityName() {
        for rarity in GameGlory.AchievementRarity.allCases {
            XCTAssertEqual(FrameUsageCopy.name("rarity", rarity.rawValue), GameText.rarityName(rarity), "\(rarity)")
        }
    }

    func test_name_ofEveryMomentFamily_isTranslated_neverTheRawValue() {
        for family in FrameMomentFamily.allCases {
            let name = FrameUsageCopy.name("family", family.rawValue)
            XCTAssertFalse(name.isEmpty, "\(family)")
            XCTAssertNotEqual(name, family.rawValue, "\(family) : la valeur brute de la loi est affichée")
        }
    }

    func test_text_ofAMomentFrame_carriesTheFamilyName() {
        let text = FrameUsageCopy.text(.moment(.level100))
        XCTAssertTrue(text.contains(FrameUsageCopy.momentFamilyName(.level100)), text)
        XCTAssertFalse(text.contains("level-100"), text)
    }

    func test_text_ofAnAchievementRarityFrame_carriesTheRarityName() {
        let text = FrameUsageCopy.text(.achievement(rarity: .legendary))
        XCTAssertTrue(text.contains(GameText.rarityName(.legendary)), text)
        XCTAssertFalse(text.contains("legendary"), text)
    }

    func test_everyMomentFamily_hasItsKeyInTheCatalogInTheSevenLanguages() throws {
        let strings = try Self.catalogStrings()
        for family in FrameMomentFamily.allCases {
            let key = FrameUsageCopy.momentFamilyKey(family)
            let localizations = try XCTUnwrap((strings[key] as? [String: Any])?["localizations"] as? [String: Any], "\(key) absente")
            for locale in ["fr", "en", "es", "pt-BR", "de", "it", "ar"] {
                XCTAssertNotNil(localizations[locale], "\(key) sans \(locale)")
            }
        }
    }

    /// `apps/ios/MeeshyTests/Unit/Stores/…` : 4 composants à retirer pour atteindre `apps/ios/`.
    private static func catalogStrings() throws -> [String: Any] {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { url.deleteLastPathComponent() }
        let data = try Data(contentsOf: url.appendingPathComponent("Meeshy/Localizable.xcstrings"))
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        return try XCTUnwrap(root["strings"] as? [String: Any])
    }
}
