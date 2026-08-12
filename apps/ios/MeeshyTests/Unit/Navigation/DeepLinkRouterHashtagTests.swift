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
