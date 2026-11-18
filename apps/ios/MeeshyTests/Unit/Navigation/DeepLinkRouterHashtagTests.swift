import XCTest
@testable import Meeshy

@MainActor
final class DeepLinkRouterHashtagTests: XCTestCase {
    func test_parse_universalLink_hashtag() {
        let url = URL(string: "https://meeshy.me/hashtag/paris")!
        guard case .hashtag(let tag) = DeepLinkParser.parse(url) else {
            return XCTFail("expected .hashtag destination")
        }
        XCTAssertEqual(tag, "paris")
    }

    func test_parse_customScheme_hashtag() {
        let url = URL(string: "meeshy://hashtag/paris")!
        guard case .hashtag(let tag) = DeepLinkParser.parse(url) else {
            return XCTFail("expected .hashtag destination")
        }
        XCTAssertEqual(tag, "paris")
    }

    func test_isMeeshyDeepLink_true_forHashtagUniversalLink() {
        XCTAssertTrue(DeepLinkParser.isMeeshyDeepLink(URL(string: "https://meeshy.me/hashtag/paris")!))
    }

    func test_parse_hashtagWithoutTag_isExternal() {
        let url = URL(string: "https://meeshy.me/hashtag/")!
        guard case .external = DeepLinkParser.parse(url) else {
            return XCTFail("expected .external for a hashtag path with no tag")
        }
    }
}

/// L'adresse courte d'une fiche (#18871) : `meeshy.me/@pseudo`, celle que le billet de la face Liens montre, copie et
/// met dans son QR. Scannée ou touchée, elle ouvre la fiche dans l'app au lieu de partir vers Safari.
@MainActor
final class DeepLinkShortProfileAddressTests: XCTestCase {
    func test_parse_shortProfileAddress_opensTheProfile() {
        guard case .userProfile(let username, _) = DeepLinkParser.parse(URL(string: "https://meeshy.me/@aissa")!) else {
            return XCTFail("expected .userProfile for meeshy.me/@pseudo")
        }
        XCTAssertEqual(username, "aissa")
    }

    func test_parse_shortProfileAddress_isClaimedAsAMeeshyLink() {
        XCTAssertTrue(DeepLinkParser.isMeeshyDeepLink(URL(string: "https://meeshy.me/@leo.m")!))
    }

    func test_parse_aLoneAt_isExternal() {
        guard case .external = DeepLinkParser.parse(URL(string: "https://meeshy.me/@")!) else {
            return XCTFail("expected .external for an address without a handle")
        }
    }

    func test_parse_shortProfileAddressOnAnotherHost_isExternal() {
        guard case .external = DeepLinkParser.parse(URL(string: "https://example.com/@aissa")!) else {
            return XCTFail("expected .external off the Meeshy host")
        }
    }
}
