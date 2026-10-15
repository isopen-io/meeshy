import XCTest
@testable import MeeshyUI

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
