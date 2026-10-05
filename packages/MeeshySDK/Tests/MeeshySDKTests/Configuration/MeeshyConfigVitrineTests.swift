import XCTest
@testable import MeeshySDK

/// La vitrine (#8855) tourne face à un hôte injoignable, mais l'accueil d'un lien doit montrer
/// l'adresse PUBLIQUE : l'origine web fixée remplace celle que l'hôte local dériverait.
final class MeeshyConfigVitrineTests: XCTestCase {
    private var apiPrecedente = ""

    override func setUp() {
        super.setUp()
        apiPrecedente = MeeshyConfig.shared.apiBaseURL
    }

    override func tearDown() {
        MeeshyConfig.debugWebOriginOverride = nil
        MeeshyConfig.shared.configure(apiURL: apiPrecedente)
        super.tearDown()
    }

    func test_webOrigin_withVitrineOverride_showsThePublicAddressDespiteALoopbackServer() {
        MeeshyConfig.shared.configure(apiURL: "http://127.0.0.1:9/api/v1")
        XCTAssertEqual(MeeshyConfig.shared.webOrigin, "http://127.0.0.1:3100")

        MeeshyConfig.debugWebOriginOverride = "https://meeshy.me"

        XCTAssertEqual(MeeshyConfig.shared.webOrigin, "https://meeshy.me")
        XCTAssertEqual(ShareLinkAddress(linkId: "lisboa-2026").displayString, "meeshy.me/chat/lisboa-2026")
    }
}
