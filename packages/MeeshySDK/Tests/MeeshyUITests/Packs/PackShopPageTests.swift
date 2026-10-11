import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Une Boutique : la Boutique, puis un onglet par pack installé** (#10150).
/// Installer ajoute l'onglet, retirer l'enlève, et chaque cadre dit à quoi il
/// sert (loi d'usage, #10146).
@MainActor
final class PackShopPageTests: XCTestCase {

    func test_installingAPack_addsItsTab() {
        XCTAssertEqual(PackShopPage.offered(installed: []), [.shop])
        XCTAssertEqual(PackShopPage.offered(installed: ["exemple-savane"]), [.shop, .pack("exemple-savane")])
    }

    func test_removingAPack_whileItsTabIsOpen_fallsBackToTheShop() {
        let offered = PackShopPage.offered(installed: [])
        XCTAssertEqual(PackShopPage.resolved(.pack("exemple-savane"), among: offered), .shop)
        XCTAssertEqual(PackShopPage.resolved(.pack("a"), among: PackShopPage.offered(installed: ["a"])), .pack("a"))
    }

    func test_theUsageLabel_namesTheRankAndKeepsTheRomanDivision() {
        let label = FrameUsageLaw.describeFrameUsage(.rank(.ambassadeur, division: .iv))
        let text = FrameUsageText.text(label, name: { _, value in value.capitalized },
                                       format: { $0 == FrameUsageLaw.LabelKey.rankDivisionOnly ? "Rang %1$@ %2$@ uniquement" : "?" })
        XCTAssertEqual(text, "Rang Ambassadeur IV uniquement")
    }

    func test_aLabelWithoutParameters_isItsFormat() {
        let text = FrameUsageText.text(FrameUsageLaw.describeFrameUsage(.prestige), name: { _, _ in "x" },
                                       format: { _ in "Prestige uniquement" })
        XCTAssertEqual(text, "Prestige uniquement")
    }

    func test_aBuiltinStickerPack_isDrawnByMee_aCommunityPack_byItsServedImage() {
        let mee = StickerPackShopView.row(StickerPack(slug: "mee", name: "Mee", installed: true))
        let community = StickerPackShopView.row(StickerPack(slug: "exemple-meeshy", name: "Exemple",
                                                            coverUrl: "/api/v1/attachments/file/c.webp"))
        XCTAssertEqual(mee.cover, .mee(slug: "mee"))
        XCTAssertEqual(community.cover, .remote("/api/v1/attachments/file/c.webp"))
        XCTAssertFalse(community.installed)
    }
}
