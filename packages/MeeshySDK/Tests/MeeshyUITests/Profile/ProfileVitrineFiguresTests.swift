import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #18870 — planche `Autre-Vitrine` § « En chiffres » : les quatre nombres de la Vitrine sont la bande K34
/// (Messages, Traductions, Langues, Jours), déjà écrits par la langue courante, et jamais un zéro inventé.
@MainActor
final class ProfileVitrineFiguresTests: XCTestCase {

    private let french = Locale(identifier: "fr_FR")

    func test_items_rangeLesQuatreChiffresDansLOrdreDeLaPlanche() {
        let stats = UserStats(totalMessages: 8902, totalTranslations: 5120, languagesUsed: 3, memberDays: 214)

        let items = ProfileVitrineFigures.items(of: stats, locale: french)

        XCTAssertEqual(items.map(\.unit), [
            ProfileVitrineFigures.messagesUnit,
            ProfileVitrineFigures.translationsUnit,
            ProfileVitrineFigures.languagesUnit,
            ProfileVitrineFigures.daysUnit
        ])
    }

    func test_items_ecritLesValeursSelonLaLangue() {
        let stats = UserStats(totalMessages: 8902, totalTranslations: 5120, languagesUsed: 3, memberDays: 214)

        let values = ProfileVitrineFigures.items(of: stats, locale: french).map(\.value)

        XCTAssertEqual(values, [
            8902.formatted(.number.locale(french)),
            5120.formatted(.number.locale(french)),
            "3",
            "214"
        ])
    }

    func test_items_sansStatistiquesServies_neDonneAucuneValeur() {
        let values = ProfileVitrineFigures.items(of: nil, locale: french).map(\.value)

        XCTAssertEqual(values.count, 4)
        XCTAssertTrue(values.allSatisfy { $0 == nil }, "sans valeur servie, le kit dessine le squelette ou le tiret")
    }

    func test_isVisible_cacheLaBandeSansValeurNiChargement() {
        let stats = UserStats(totalMessages: 1)

        XCTAssertTrue(ProfileVitrineFigures.isVisible(stats: stats, isLoading: false))
        XCTAssertTrue(ProfileVitrineFigures.isVisible(stats: nil, isLoading: true))
        XCTAssertFalse(ProfileVitrineFigures.isVisible(stats: nil, isLoading: false))
    }
}
