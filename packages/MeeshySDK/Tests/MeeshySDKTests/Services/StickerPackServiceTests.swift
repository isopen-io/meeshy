import XCTest
@testable import MeeshySDK

/// **Les quatre appels de la feuille et de la boutique** (#9190) — les routes
/// de `services/gateway/src/routes/sticker-packs.ts`, par `StickerPacksEndpoint`
/// (généré). Installer est une APPARTENANCE : `PUT` pour entrer, `DELETE` pour
/// sortir, sur la même adresse.
final class StickerPackServiceTests: XCTestCase {

    private func pack(_ slug: String, installed: Bool = true) -> StickerPack {
        StickerPack(slug: slug, name: slug, installed: installed)
    }

    func test_installed_readsTheInstalledPacks() async throws {
        let mock = MockAPIClient()
        mock.stub("/sticker-packs/installed",
                  result: APIResponse<[StickerPack]>(success: true, data: [pack("mee"), pack("chats")], error: nil))
        let service = StickerPackService(api: mock)

        let packs = try await service.installed()

        XCTAssertEqual(packs.map(\.slug), ["mee", "chats"])
        XCTAssertEqual(mock.lastRequest?.endpoint, "/sticker-packs/installed")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func test_catalogue_readsTheShop() async throws {
        let mock = MockAPIClient()
        mock.stub("/sticker-packs",
                  result: APIResponse<[StickerPack]>(success: true, data: [pack("mee"), pack("chats", installed: false)], error: nil))
        let service = StickerPackService(api: mock)

        let packs = try await service.catalogue()

        XCTAssertEqual(packs.map(\.installed), [true, false])
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func test_install_putsOnTheInstallAddress() async throws {
        let mock = MockAPIClient()
        mock.stub("/sticker-packs/chats/install",
                  result: APIResponse<StickerPack>(success: true, data: pack("chats"), error: nil))
        let service = StickerPackService(api: mock)

        let installed = try await service.setInstalled(true, slug: "chats")

        XCTAssertTrue(installed.installed)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/sticker-packs/chats/install")
        XCTAssertEqual(mock.lastRequest?.method, "PUT")
    }

    func test_uninstall_deletesTheSameAddress() async throws {
        let mock = MockAPIClient()
        mock.stub("/sticker-packs/chats/install",
                  result: APIResponse<StickerPack>(success: true, data: pack("chats", installed: false), error: nil))
        let service = StickerPackService(api: mock)

        let removed = try await service.setInstalled(false, slug: "chats")

        XCTAssertFalse(removed.installed)
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    func test_aRefusal_propagates() async {
        let mock = MockAPIClient()
        mock.errorToThrow = URLError(.notConnectedToInternet)
        let service = StickerPackService(api: mock)

        do {
            _ = try await service.setInstalled(true, slug: "chats")
            XCTFail("un refus doit remonter : c'est lui qui déclenche le retour en arrière")
        } catch {
            XCTAssertEqual((error as? URLError)?.code, .notConnectedToInternet)
        }
    }
}
