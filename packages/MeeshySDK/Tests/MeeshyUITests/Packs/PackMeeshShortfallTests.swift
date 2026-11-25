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
        XCTAssertEqual(UnifiedShopView.row(paid("aurore"), balance: 12).missingMeeshes, 8)
        XCTAssertNil(UnifiedShopView.row(paid("aurore"), balance: 40).missingMeeshes)
        XCTAssertNil(UnifiedShopView.row(paid("aurore")).missingMeeshes, "sans solde, la rangée se tait comme avant")
        XCTAssertNil(UnifiedShopView.row(paid("aurore", owned: true), balance: 0).missingMeeshes)
    }

    func test_shortfall_isSaidOnlyWhereTheGestureIsBuy() {
        let toBuy = PackRow(slug: "a", name: "A", installed: false, price: 20, owned: false, missingMeeshes: 8)
        let locked = PackRow(slug: "b", name: "B", installed: false, price: 20, owned: false, locked: true, missingMeeshes: 8)
        let owned = PackRow(slug: "c", name: "C", installed: false, price: 20, owned: true, missingMeeshes: 8)

        XCTAssertEqual(PackShopView.shortfall(of: toBuy), 8)
        XCTAssertNil(PackShopView.shortfall(of: locked), "un pack à débloquer ne s'achète pas encore : rien ne manque en Meeshes")
        XCTAssertNil(PackShopView.shortfall(of: owned))
    }

    func test_line_saysTheCountAndSeparatesOneFromMany() {
        let one = PackMeeshShortfall.line(missing: 1)
        let many = PackMeeshShortfall.line(missing: 8)

        XCTAssertTrue(one.contains("1"), one)
        XCTAssertTrue(many.contains("8"), many)
        XCTAssertFalse(one.contains("%"), one)
        XCTAssertFalse(many.contains("%"), many)
        XCTAssertNotEqual(one.replacingOccurrences(of: "1", with: "8"), many,
                          "1 Meesh se dit au singulier, jamais « 1 Meeshes »")
    }

    func test_earnLabel_namesTheWayToTheMeeshes() {
        XCTAssertFalse(PackMeeshShortfall.earnLabel.isEmpty)
        XCTAssertNotEqual(PackMeeshShortfall.earnLabel, "shop.short.earn")
    }

    func test_catalogue_saysTheGapAndTheWayInTheSevenLanguages() throws {
        let url = Self.sourceCatalogue
        let racine = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let chaines = try XCTUnwrap(racine["strings"] as? [String: Any])
        for cle in ["shop.short.one", "shop.short.many", "shop.short.earn"] {
            let entree = try XCTUnwrap(chaines[cle] as? [String: Any], cle)
            let langues = try XCTUnwrap(entree["localizations"] as? [String: Any], cle)
            XCTAssertEqual(Set(langues.keys), ["fr", "en", "es", "pt-BR", "it", "de", "ar"], cle)
        }
    }

    private static var sourceCatalogue: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Resources/Localizable.xcstrings")
    }
}
