import XCTest
import MeeshySDK
@testable import Meeshy

/// #10632 — `meeshy://settings/packs?domaine=…` ouvre la vitrine unique,
/// filtrée sur le domaine nommé ; un domaine absent ou inconnu ouvre la
/// vitrine sans filtre, jamais une erreur.
@MainActor
final class PackShopDeepLinkTests: XCTestCase {

    private func parse(_ raw: String) -> DeepLinkDestination {
        DeepLinkParser.parse(URL(string: raw)!)
    }

    func test_packsLink_withADomain_opensTheFilteredShop() {
        XCTAssertEqual(parse("meeshy://settings/packs?domaine=wallpaper"), .packShop(domain: .wallpaper))
        XCTAssertEqual(parse("meeshy://settings/packs?domaine=avatar-ring"), .packShop(domain: .avatarRing))
        XCTAssertEqual(parse("meeshy://settings/packs?domaine=banner"), .packShop(domain: .banner))
    }

    func test_packsLink_withoutOrWithAnUnknownDomain_opensTheUnfilteredShop() {
        XCTAssertEqual(parse("meeshy://settings/packs"), .packShop(domain: nil))
        XCTAssertEqual(parse("meeshy://settings/packs?domaine=hologramme"), .packShop(domain: nil))
    }

    func test_otherSettingsLinks_stayExternal() {
        guard case .external = parse("meeshy://settings/autre") else {
            return XCTFail("seule la vitrine des packs est une destination de réglages")
        }
    }

    func test_systemLaunch_queuesThePackShopLink() {
        let router = DeepLinkRouter()

        XCTAssertTrue(router.handle(url: URL(string: "meeshy://settings/packs?domaine=banner")!))

        XCTAssertEqual(router.pendingDeepLink, .packShop(domain: .banner))
    }

    func test_launcher_carriesTheDomainOnceToTheSettings() {
        let launcher = PackShopLauncher()

        launcher.request(domain: .wallpaper)

        XCTAssertEqual(launcher.consume()?.domain, .wallpaper)
        XCTAssertNil(launcher.consume(), "la demande se consomme une fois")
    }

    func test_packsSettingsView_opensOnTheRequestedDomain() {
        _ = PacksSettingsView(initialDomain: .banner)
        _ = PacksSettingsView()
    }

    // MARK: - #10703 — `pack=<slug>` met CE pack en avant

    func test_packsLink_withAPack_carriesItsSlug() {
        XCTAssertEqual(parse("meeshy://settings/packs?domaine=sticker&pack=chats-de-paris"),
                       .packShop(domain: .sticker, pack: "chats-de-paris"))
        XCTAssertEqual(parse("meeshy://settings/packs?pack=Chats-De-Paris"),
                       .packShop(domain: nil, pack: "chats-de-paris"))
    }

    func test_packsLink_withAnUnreadableSlug_opensTheShopWithoutFocus() {
        XCTAssertEqual(parse("meeshy://settings/packs?pack=../etc"), .packShop(domain: nil, pack: nil))
        XCTAssertEqual(parse("meeshy://settings/packs?pack="), .packShop(domain: nil, pack: nil))
    }

    func test_launcher_carriesThePackToTheSettings() {
        let launcher = PackShopLauncher()

        launcher.request(domain: .sticker, pack: "chats-de-paris")

        let request = launcher.consume()
        XCTAssertEqual(request?.domain, .sticker)
        XCTAssertEqual(request?.pack, "chats-de-paris")
    }

    func test_vitrineLinkOfAStickerSheet_isTheStickerShopOnThatPack() {
        XCTAssertEqual(StickerSheetLinks.vitrine(templateId: "pack.chats-de-paris.dodo"),
                       .packShop(domain: .sticker, pack: "chats-de-paris"))
    }

    func test_vitrineLinkOfAStickerSheet_isAbsentWithoutAPack() {
        XCTAssertNil(StickerSheetLinks.vitrine(templateId: nil))
        XCTAssertNil(StickerSheetLinks.vitrine(templateId: "since-date"))
    }

    func test_senderLine_saysTheNameOrNothing() {
        XCTAssertNil(StickerSheetLinks.senderLine(nil))
        XCTAssertNil(StickerSheetLinks.senderLine("   "))
        XCTAssertTrue(StickerSheetLinks.senderLine(" Amina Diallo ")?.contains("Amina Diallo") == true)
    }
}
