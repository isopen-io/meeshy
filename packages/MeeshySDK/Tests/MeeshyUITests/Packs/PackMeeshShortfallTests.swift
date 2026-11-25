import XCTest
@testable import MeeshyUI
import MeeshySDK

/// **Un pack trop cher dit les Meeshes qui manquent, et mène à la frappe** (#20528, tranche iOS de
/// #17378, miroir du web #20527) : AVANT le geste, au lieu de le découvrir au refus de l'achat.
/// L'écart est celui de `GameSpend.preview`, la loi de tout geste qui dépense ; « Acheter » reste.
@MainActor
final class PackMeeshShortfallTests: XCTestCase {

    private func paid(_ slug: String, price: Int = 20, owned: Bool = false) -> ShopPack {
        ShopPack(slug: slug, name: slug, price: price, owned: owned)
    }

    func test_missing_aPaidPackTheBalanceDoesNotCover_saysTheGap() {
        XCTAssertEqual(PackMeeshShortfall.missing(balance: 12, price: 20, owned: false), 8)
        XCTAssertEqual(PackMeeshShortfall.missing(balance: 0, price: 1, owned: false), 1)
    }

    func test_missing_nothingToSay_whenTheBalanceIsUnknownOwnedFreeOrAffordable() {
        XCTAssertNil(PackMeeshShortfall.missing(balance: nil, price: 20, owned: false), "ancien serveur : solde inconnu")
        XCTAssertNil(PackMeeshShortfall.missing(balance: 0, price: 20, owned: true), "pack possédé")
        XCTAssertNil(PackMeeshShortfall.missing(balance: 0, price: nil, owned: false), "pack gratuit")
        XCTAssertNil(PackMeeshShortfall.missing(balance: 20, price: 20, owned: false), "le solde couvre tout juste")
        XCTAssertNil(PackMeeshShortfall.missing(balance: 50, price: 20, owned: false))
    }

    func test_row_carriesTheGapAtTheServedBalance() {
        XCTAssertEqual(UnifiedShopView.row(paid("aurore"), language: "fr", balance: 12).shortfall?.missing, 8)
        XCTAssertNil(UnifiedShopView.row(paid("aurore"), balance: 40).shortfall)
        XCTAssertNil(UnifiedShopView.row(paid("aurore")).shortfall, "sans solde, la rangée se tait comme avant")
        XCTAssertNil(UnifiedShopView.row(paid("aurore", owned: true), balance: 0).shortfall)
    }

    func test_shortfall_isSaidOnlyWhereTheGestureIsBuy() {
        let gap = PackMeeshShortfall(missing: 8, language: "fr")
        let toBuy = PackRow(slug: "a", name: "A", installed: false, price: 20, owned: false, shortfall: gap)
        let locked = PackRow(slug: "b", name: "B", installed: false, price: 20, owned: false, locked: true, shortfall: gap)
        let owned = PackRow(slug: "c", name: "C", installed: false, price: 20, owned: true, shortfall: gap)

        XCTAssertEqual(PackShopView.shortfall(of: toBuy), gap)
        XCTAssertNil(PackShopView.shortfall(of: locked), "un pack à débloquer ne s'achète pas encore : rien ne manque en Meeshes")
        XCTAssertNil(PackShopView.shortfall(of: owned))
    }

    func test_line_saysTheCountInTheReadersDigits() {
        XCTAssertTrue(PackMeeshShortfall(missing: 8, language: "fr").line.contains("8"))
        XCTAssertTrue(PackMeeshShortfall(missing: 3500, language: "de").line.contains("3.500"))
        XCTAssertFalse(PackMeeshShortfall(missing: 1, language: "fr").line.contains("%"))
        XCTAssertFalse(PackMeeshShortfall(missing: 8, language: "fr").line.contains("%"))
    }

    func test_earnLabel_namesTheWayToTheMeeshes() {
        XCTAssertFalse(PackMeeshShortfall.earnLabel.isEmpty)
        XCTAssertNotEqual(PackMeeshShortfall.earnLabel, "shop.short.earn")
    }

    func test_catalogue_theFrenchSourceSaysOneMeeshInTheSingular() throws {
        let chaines = try Self.catalogueStrings()
        XCTAssertEqual(try Self.value(chaines, "shop.short.one", "fr"), "Il vous manque 1 Meesh")
        XCTAssertEqual(try Self.value(chaines, "shop.short.many", "fr"), "Il vous manque %@ Meeshes")
        XCTAssertEqual(try Self.value(chaines, "shop.short.earn", "fr"), "Frapper des Meeshes")
    }

    func test_catalogue_saysTheGapAndTheWayInTheSevenLanguages() throws {
        let chaines = try Self.catalogueStrings()
        for cle in ["shop.short.one", "shop.short.many", "shop.short.earn"] {
            let entree = try XCTUnwrap(chaines[cle] as? [String: Any], cle)
            let langues = try XCTUnwrap(entree["localizations"] as? [String: Any], cle)
            XCTAssertEqual(Set(langues.keys), ["fr", "en", "es", "pt-BR", "it", "de", "ar"], cle)
        }
    }

    private static func catalogueStrings() throws -> [String: Any] {
        let racine = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: sourceCatalogue)) as? [String: Any])
        return try XCTUnwrap(racine["strings"] as? [String: Any])
    }

    private static func value(_ chaines: [String: Any], _ cle: String, _ langue: String) throws -> String? {
        let entree = try XCTUnwrap(chaines[cle] as? [String: Any], cle)
        let langues = try XCTUnwrap(entree["localizations"] as? [String: Any], cle)
        return ((langues[langue] as? [String: Any])?["stringUnit"] as? [String: Any])?["value"] as? String
    }

    private static var sourceCatalogue: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Resources/Localizable.xcstrings")
    }
}
