import XCTest
import MeeshySDK
@testable import Meeshy

/// La langue que le détail d'un post AFFICHE descend le prisme du lecteur dans l'ordre (#9857) : il parcourait les clés
/// du dictionnaire des traductions, dont l'ordre change à chaque lancement — en vitrine, le même post s'affichait en
/// français à 20:42 et en anglais à 23:08 pour un lecteur [fr, en].
final class PostDisplayLanguageTests: XCTestCase {
    private func traductions(_ langues: [String]) -> [String: PostTranslation] {
        Dictionary(uniqueKeysWithValues: langues.map { ($0, PostTranslation(text: "texte \($0)")) })
    }

    func test_code_servesTheFirstRankServed_notTheFirstKey() {
        for ordre in [["en", "fr", "es"], ["fr", "en", "es"], ["es", "en", "fr"]] {
            XCTAssertEqual(
                PostDisplayLanguage.code(originalLanguage: "ja", translations: traductions(ordre), prism: ["de", "fr", "en"]),
                "fr", "rang 2 servi, quel que soit l'ordre des clés \(ordre)"
            )
        }
    }

    func test_code_theOriginalLanguageCompetesAtItsRank() {
        XCTAssertEqual(PostDisplayLanguage.code(originalLanguage: "ja", translations: traductions(["en"]), prism: ["de", "ja", "en"]), "ja")
        XCTAssertEqual(PostDisplayLanguage.code(originalLanguage: "ja", translations: traductions(["en", "ja"]), prism: ["de", "en", "ja"]), "en")
    }

    func test_code_withoutAnyMatch_servesTheOriginal() {
        XCTAssertEqual(PostDisplayLanguage.code(originalLanguage: "ja", translations: traductions(["en", "es"]), prism: ["de"]), "ja")
        XCTAssertEqual(PostDisplayLanguage.code(originalLanguage: "ja", translations: nil, prism: ["fr", "en"]), "ja")
    }
}
