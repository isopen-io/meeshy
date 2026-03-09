import XCTest
@testable import Meeshy
import MeeshySDK

// MARK: - DeepLinkParser Tests

final class DeepLinkParserTests: XCTestCase {

    // MARK: - Custom Scheme (meeshy://)

    func test_parse_customScheme_me_returnsOwnProfile() {
        let url = URL(string: "meeshy://me")!
        let result = DeepLinkParser.parse(url)
        guard case .ownProfile = result else {
            XCTFail("Expected .ownProfile, got \(result)")
            return
        }
    }

    func test_parse_customScheme_links_returnsUserLinks() {
        let url = URL(string: "meeshy://links")!
        let result = DeepLinkParser.parse(url)
        guard case .userLinks = result else {
            XCTFail("Expected .userLinks, got \(result)")
            return
        }
    }

    func test_parse_customScheme_userProfile_returnsUsername() {
        let url = URL(string: "meeshy://u/atabeth")!
        let result = DeepLinkParser.parse(url)
        guard case .userProfile(let username) = result else {
            XCTFail("Expected .userProfile, got \(result)")
            return
        }
        XCTAssertEqual(username, "atabeth")
    }

    func test_parse_customScheme_conversation_returnsId() {
        let url = URL(string: "meeshy://c/abc123def456")!
        let result = DeepLinkParser.parse(url)
        guard case .conversation(let id) = result else {
            XCTFail("Expected .conversation, got \(result)")
            return
        }
        XCTAssertEqual(id, "abc123def456")
    }

    func test_parse_customScheme_share_withTextAndUrl() {
        let url = URL(string: "meeshy://share?text=Hello%20World&url=https://example.com")!
        let result = DeepLinkParser.parse(url)
        guard case .share(let text, let urlString) = result else {
            XCTFail("Expected .share, got \(result)")
            return
        }
        XCTAssertEqual(text, "Hello World")
        XCTAssertEqual(urlString, "https://example.com")
    }

    func test_parse_customScheme_share_withTextOnly() {
        let url = URL(string: "meeshy://share?text=OnlyText")!
        let result = DeepLinkParser.parse(url)
        guard case .share(let text, let urlString) = result else {
            XCTFail("Expected .share, got \(result)")
            return
        }
        XCTAssertEqual(text, "OnlyText")
        XCTAssertNil(urlString)
    }

    func test_parse_customScheme_magicLink_returnsToken() {
        let url = URL(string: "meeshy://auth/magic-link?token=abc123xyz")!
        let result = DeepLinkParser.parse(url)
        guard case .magicLink(let token) = result else {
            XCTFail("Expected .magicLink, got \(result)")
            return
        }
        XCTAssertEqual(token, "abc123xyz")
    }

    func test_parse_customScheme_unknownPath_returnsExternal() {
        let url = URL(string: "meeshy://unknown/path")!
        let result = DeepLinkParser.parse(url)
        guard case .external = result else {
            XCTFail("Expected .external, got \(result)")
            return
        }
    }

    // MARK: - Web URLs (https://meeshy.me)

    func test_parse_webUrl_me_returnsOwnProfile() {
        let url = URL(string: "https://meeshy.me/me")!
        let result = DeepLinkParser.parse(url)
        guard case .ownProfile = result else {
            XCTFail("Expected .ownProfile, got \(result)")
            return
        }
    }

    func test_parse_webUrl_links_returnsUserLinks() {
        let url = URL(string: "https://meeshy.me/links")!
        let result = DeepLinkParser.parse(url)
        guard case .userLinks = result else {
            XCTFail("Expected .userLinks, got \(result)")
            return
        }
    }

    func test_parse_webUrl_userProfile_returnsUsername() {
        let url = URL(string: "https://meeshy.me/u/jcharlesnm")!
        let result = DeepLinkParser.parse(url)
        guard case .userProfile(let username) = result else {
            XCTFail("Expected .userProfile, got \(result)")
            return
        }
        XCTAssertEqual(username, "jcharlesnm")
    }

    func test_parse_webUrl_conversation_returnsId() {
        let url = URL(string: "https://meeshy.me/c/conv789")!
        let result = DeepLinkParser.parse(url)
        guard case .conversation(let id) = result else {
            XCTFail("Expected .conversation, got \(result)")
            return
        }
        XCTAssertEqual(id, "conv789")
    }

    func test_parse_webUrl_magicLink_returnsToken() {
        let url = URL(string: "https://meeshy.me/auth/magic-link?token=mltoken456")!
        let result = DeepLinkParser.parse(url)
        guard case .magicLink(let token) = result else {
            XCTFail("Expected .magicLink, got \(result)")
            return
        }
        XCTAssertEqual(token, "mltoken456")
    }

    func test_parse_webUrl_share_returnsShareData() {
        let url = URL(string: "https://meeshy.me/share?text=Check%20this&url=https://x.com/post")!
        let result = DeepLinkParser.parse(url)
        guard case .share(let text, let urlString) = result else {
            XCTFail("Expected .share, got \(result)")
            return
        }
        XCTAssertEqual(text, "Check this")
        XCTAssertEqual(urlString, "https://x.com/post")
    }

    func test_parse_webUrl_wwwSubdomain_works() {
        let url = URL(string: "https://www.meeshy.me/u/testuser")!
        let result = DeepLinkParser.parse(url)
        guard case .userProfile(let username) = result else {
            XCTFail("Expected .userProfile, got \(result)")
            return
        }
        XCTAssertEqual(username, "testuser")
    }

    func test_parse_webUrl_unknownPath_returnsExternal() {
        let url = URL(string: "https://meeshy.me/l/some-token")!
        let result = DeepLinkParser.parse(url)
        guard case .external = result else {
            XCTFail("Expected .external, got \(result)")
            return
        }
    }

    // MARK: - External URLs

    func test_parse_externalUrl_returnsExternal() {
        let url = URL(string: "https://google.com/search?q=meeshy")!
        let result = DeepLinkParser.parse(url)
        guard case .external(let externalURL) = result else {
            XCTFail("Expected .external, got \(result)")
            return
        }
        XCTAssertEqual(externalURL.host, "google.com")
    }

    // MARK: - Edge Cases

    func test_parse_magicLink_withoutToken_returnsExternal() {
        let url = URL(string: "meeshy://auth/magic-link")!
        let result = DeepLinkParser.parse(url)
        guard case .external = result else {
            XCTFail("Expected .external (no token), got \(result)")
            return
        }
    }

    func test_parse_webUrl_magicLink_withoutToken_returnsExternal() {
        let url = URL(string: "https://meeshy.me/auth/magic-link")!
        let result = DeepLinkParser.parse(url)
        guard case .external = result else {
            XCTFail("Expected .external (no token), got \(result)")
            return
        }
    }

    func test_parse_webUrl_rootPath_returnsExternal() {
        let url = URL(string: "https://meeshy.me/")!
        let result = DeepLinkParser.parse(url)
        guard case .external = result else {
            XCTFail("Expected .external for root path, got \(result)")
            return
        }
    }
}

// MARK: - DeepLinkRouter Tests

@MainActor
final class DeepLinkRouterTests: XCTestCase {

    private var sut: DeepLinkRouter { DeepLinkRouter.shared }

    override func setUp() {
        super.setUp()
        _ = sut.consumePendingDeepLink()
    }

    // MARK: - Universal Link handling

    func test_handle_joinLink_setsPendingDeepLink() {
        let url = URL(string: "https://meeshy.me/join/inv123")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .joinLink(identifier: "inv123"))
    }

    func test_handle_joinLink_shortPath_setsPendingDeepLink() {
        let url = URL(string: "https://meeshy.me/l/shortcode")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .joinLink(identifier: "shortcode"))
    }

    func test_handle_conversationLink_setsPendingDeepLink() {
        let url = URL(string: "https://meeshy.me/c/conv456")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "conv456"))
    }

    func test_handle_conversationFullPath_setsPendingDeepLink() {
        let url = URL(string: "https://meeshy.me/conversation/conv789")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "conv789"))
    }

    func test_handle_unknownMeeshyPath_returnsFalse() {
        let url = URL(string: "https://meeshy.me/settings")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
        XCTAssertNil(sut.pendingDeepLink)
    }

    func test_handle_externalUrl_returnsFalse() {
        let url = URL(string: "https://google.com/search")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
    }

    func test_handle_emptyPath_returnsFalse() {
        let url = URL(string: "https://meeshy.me/")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
    }

    func test_handle_joinWithoutIdentifier_returnsFalse() {
        let url = URL(string: "https://meeshy.me/join")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
    }

    func test_handle_appMeeshyMe_recognized() {
        let url = URL(string: "https://app.meeshy.me/c/conv111")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "conv111"))
    }

    // MARK: - Custom Scheme via router

    func test_handle_customScheme_join_setsPendingDeepLink() {
        let url = URL(string: "meeshy://join/inv999")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .joinLink(identifier: "inv999"))
    }

    func test_handle_customScheme_conversation_setsPendingDeepLink() {
        let url = URL(string: "meeshy://conversation/conv222")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "conv222"))
    }

    func test_handle_customScheme_auth_magicLink_setsPendingDeepLink() {
        let url = URL(string: "meeshy://auth/magic-link?token=tok999")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .magicLink(token: "tok999"))
    }

    func test_handle_customScheme_auth_noToken_returnsFalse() {
        let url = URL(string: "meeshy://auth/magic-link")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
    }

    func test_handle_customScheme_unknown_returnsFalse() {
        let url = URL(string: "meeshy://settings")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
    }

    // MARK: - Consume

    func test_consumePendingDeepLink_returnsAndClears() {
        let url = URL(string: "https://meeshy.me/join/abc")!
        _ = sut.handle(url: url)

        let consumed = sut.consumePendingDeepLink()

        XCTAssertEqual(consumed, .joinLink(identifier: "abc"))
        XCTAssertNil(sut.pendingDeepLink)
    }

    func test_consumePendingDeepLink_whenNoPending_returnsNil() {
        let consumed = sut.consumePendingDeepLink()

        XCTAssertNil(consumed)
    }

    func test_handle_overwritesPreviousPendingLink() {
        _ = sut.handle(url: URL(string: "https://meeshy.me/join/first")!)
        _ = sut.handle(url: URL(string: "https://meeshy.me/c/second")!)

        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "second"))
    }
}

// MARK: - DeepLinkRouter chatLink Tests

@MainActor
final class DeepLinkRouterChatLinkTests: XCTestCase {

    private var sut: DeepLinkRouter { DeepLinkRouter.shared }

    override func setUp() {
        super.setUp()
        _ = sut.consumePendingDeepLink()
    }

    func test_handle_chatPath_setsChatLink() {
        let url = URL(string: "https://meeshy.me/chat/mshy_support")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        guard case .chatLink(let id) = sut.pendingDeepLink else {
            XCTFail("Expected chatLink, got \(String(describing: sut.pendingDeepLink))")
            return
        }
        XCTAssertEqual(id, "mshy_support")
    }

    func test_handle_chatCustomScheme_setsChatLink() {
        let url = URL(string: "meeshy://chat/mshy_abc123")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        guard case .chatLink(let id) = sut.pendingDeepLink else {
            XCTFail("Expected chatLink, got \(String(describing: sut.pendingDeepLink))")
            return
        }
        XCTAssertEqual(id, "mshy_abc123")
    }

    func test_handle_joinPath_setsJoinLink() {
        let url = URL(string: "https://meeshy.me/join/mshy_xyz")!

        _ = sut.handle(url: url)

        guard case .joinLink(let id) = sut.pendingDeepLink else {
            XCTFail("Expected joinLink, got \(String(describing: sut.pendingDeepLink))")
            return
        }
        XCTAssertEqual(id, "mshy_xyz")
    }

    func test_handle_lShortPath_setsJoinLink() {
        let url = URL(string: "https://meeshy.me/l/mshy_xyz")!

        _ = sut.handle(url: url)

        guard case .joinLink = sut.pendingDeepLink else {
            XCTFail("Expected joinLink, got \(String(describing: sut.pendingDeepLink))")
            return
        }
    }
}

// MARK: - DeepLink Equatable Tests

final class DeepLinkEquatableTests: XCTestCase {

    func test_joinLink_equality() {
        XCTAssertEqual(DeepLink.joinLink(identifier: "a"), DeepLink.joinLink(identifier: "a"))
        XCTAssertNotEqual(DeepLink.joinLink(identifier: "a"), DeepLink.joinLink(identifier: "b"))
    }

    func test_chatLink_equality() {
        XCTAssertEqual(DeepLink.chatLink(identifier: "a"), DeepLink.chatLink(identifier: "a"))
        XCTAssertNotEqual(DeepLink.chatLink(identifier: "a"), DeepLink.chatLink(identifier: "b"))
    }

    func test_magicLink_equality() {
        XCTAssertEqual(DeepLink.magicLink(token: "t1"), DeepLink.magicLink(token: "t1"))
        XCTAssertNotEqual(DeepLink.magicLink(token: "t1"), DeepLink.magicLink(token: "t2"))
    }

    func test_conversation_equality() {
        XCTAssertEqual(DeepLink.conversation(id: "c1"), DeepLink.conversation(id: "c1"))
        XCTAssertNotEqual(DeepLink.conversation(id: "c1"), DeepLink.conversation(id: "c2"))
    }

    func test_differentCases_notEqual() {
        XCTAssertNotEqual(DeepLink.joinLink(identifier: "x"), DeepLink.conversation(id: "x"))
        XCTAssertNotEqual(DeepLink.magicLink(token: "x"), DeepLink.joinLink(identifier: "x"))
        XCTAssertNotEqual(DeepLink.chatLink(identifier: "x"), DeepLink.joinLink(identifier: "x"))
    }
}
