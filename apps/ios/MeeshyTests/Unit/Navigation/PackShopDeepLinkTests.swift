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
}
