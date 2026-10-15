import XCTest
@testable import MeeshyUI
import MeeshySDK

@MainActor
final class PackShopFocusTests: XCTestCase {
    private func rows(_ slugs: String...) -> [PackRow] {
        slugs.map { PackRow(slug: $0, name: $0, installed: false) }
    }

    func test_focusTarget_isThePackWhenItIsAmongTheRows() {
        XCTAssertEqual(PackShopView.focusTarget("chats", in: rows("mee", "chats")), "chats")
    }

    func test_focusTarget_isNilForAnUnknownPackOrUnreadRows() {
        XCTAssertNil(PackShopView.focusTarget("absent", in: rows("mee")))
        XCTAssertNil(PackShopView.focusTarget("chats", in: nil))
        XCTAssertNil(PackShopView.focusTarget(nil, in: rows("chats")))
    }

    func test_showsOwned_onlyForAPaidPackIOwn() {
        XCTAssertTrue(PackShopView.showsOwned(PackRow(slug: "a", name: "A", installed: true, price: 40, owned: true)))
        XCTAssertFalse(PackShopView.showsOwned(PackRow(slug: "a", name: "A", installed: false, price: 40, owned: false)))
        XCTAssertFalse(PackShopView.showsOwned(PackRow(slug: "a", name: "A", installed: true)))
    }
}

/// La rangée de la vitrine (#10711) : le nom et la description dans la langue du lecteur, et la loi
/// d'usage d'un cadre déjà traduite par l'app — comme le magasin des cadres qu'elle remplace.
@MainActor
final class UnifiedShopRowLocalizationTests: XCTestCase {
    private let gold = ShopPack(slug: "or", name: "Or", description: "Cadres d'or",
                                names: ["en": PackLocalizedName(name: "Gold", description: "Golden frames")],
                                usage: .prestige)

    func test_row_isNamedInTheReadersLanguage() {
        let row = UnifiedShopView.row(gold, language: "en")

        XCTAssertEqual(row.name, "Gold")
        XCTAssertEqual(row.description, "Golden frames")
    }

    func test_row_saysWhereTheFrameServes_whenTheAppTranslatesTheUsage() {
        let row = UnifiedShopView.row(gold, language: "fr", usageText: { _ in "Prestige uniquement" })

        XCTAssertEqual(row.name, "Or")
        XCTAssertEqual(row.usageText, "Prestige uniquement")
    }

    func test_row_withoutUsage_saysNothing() {
        let row = UnifiedShopView.row(ShopPack(slug: "mee", name: "Mee"), language: "fr", usageText: { _ in "x" })

        XCTAssertNil(row.usageText)
    }
}
