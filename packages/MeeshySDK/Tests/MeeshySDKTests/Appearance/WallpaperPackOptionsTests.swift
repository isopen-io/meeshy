import XCTest
@testable import MeeshySDK

/// #10708 — le sélecteur de fonds ne propose que les packs possédés ET installés, comme le web.
final class WallpaperPackOptionsTests: XCTestCase {

    private let catalog = AppearanceCatalog.shared

    private func shop(_ slug: String, installed: Bool = true, price: Int? = nil, owned: Bool? = nil) -> ShopPack {
        ShopPack(slug: slug, name: slug, installed: installed, price: price, owned: owned)
    }

    func test_unreadList_offersTheDefaultInstalledPacks() {
        let slugs = WallpaperPackOptions.packs(installed: nil, catalog: catalog).map(\.slug)
        XCTAssertEqual(slugs, catalog.wallpaperPacks.filter(\.installedByDefault).map(\.slug))
        XCTAssertFalse(slugs.isEmpty)
    }

    func test_onlyInstalledAndOwnedPacksAreOffered() throws {
        let all = catalog.wallpaperPacks.map(\.slug)
        let first = try XCTUnwrap(all.first)
        let notInstalled = try XCTUnwrap(all.dropFirst().first)
        let unpaid = try XCTUnwrap(all.dropFirst(2).first)
        let offered = WallpaperPackOptions.packs(installed: [
            shop(first), shop(notInstalled, installed: false), shop(unpaid, price: 50, owned: false),
        ], catalog: catalog).map(\.slug)
        XCTAssertEqual(offered, [first])
    }

    func test_aPaidPackOnceOwnedAndInstalled_isOffered() throws {
        let slug = try XCTUnwrap(catalog.wallpaperPacks.last?.slug)
        let offered = WallpaperPackOptions.packs(installed: [shop(slug, price: 50, owned: true)], catalog: catalog).map(\.slug)
        XCTAssertEqual(offered, [slug])
    }

    func test_anOldServer_404_offersNoPack_andAnOutageChangesNothing() {
        XCTAssertEqual(WallpaperPackOptions.installedList(from: .failure(MeeshyError.server(statusCode: 404, message: "")))?.count, 0)
        XCTAssertNil(WallpaperPackOptions.installedList(from: .failure(MeeshyError.server(statusCode: 503, message: ""))))
        XCTAssertNil(WallpaperPackOptions.installedList(from: .failure(URLError(.notConnectedToInternet))))
        XCTAssertEqual(WallpaperPackOptions.installedList(from: .success([shop("a")]))?.map(\.slug), ["a"])
    }
}
