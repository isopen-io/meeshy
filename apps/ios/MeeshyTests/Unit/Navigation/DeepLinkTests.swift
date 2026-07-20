import XCTest
@testable import Meeshy
import MeeshySDK

// MARK: - DeepLinkParser Tests

@MainActor
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

    func test_parse_customScheme_postShort_returnsPostId() {
        let url = URL(string: "meeshy://p/postABC123")!
        let result = DeepLinkParser.parse(url)
        guard case .postDetail(let id) = result else {
            XCTFail("Expected .postDetail, got \(result)")
            return
        }
        XCTAssertEqual(id, "postABC123")
    }

    func test_parse_customScheme_feedsPost_returnsPostId() {
        let url = URL(string: "meeshy://feeds/post/postXYZ789")!
        let result = DeepLinkParser.parse(url)
        guard case .postDetail(let id) = result else {
            XCTFail("Expected .postDetail, got \(result)")
            return
        }
        XCTAssertEqual(id, "postXYZ789")
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

    func test_parse_webUrl_feedsPost_returnsPostId() {
        let url = URL(string: "https://meeshy.me/feeds/post/postWeb123")!
        let result = DeepLinkParser.parse(url)
        guard case .postDetail(let id) = result else {
            XCTFail("Expected .postDetail, got \(result)")
            return
        }
        XCTAssertEqual(id, "postWeb123")
    }

    func test_parse_webUrl_postShort_returnsPostId() {
        let url = URL(string: "https://meeshy.me/p/postShort456")!
        let result = DeepLinkParser.parse(url)
        guard case .postDetail(let id) = result else {
            XCTFail("Expected .postDetail, got \(result)")
            return
        }
        XCTAssertEqual(id, "postShort456")
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
        // `/settings` is not claimed by AASA and has no in-app surface, so it
        // must fall through to Safari. (`/l/<token>` USED to land here, but it
        // is now recognised as a `.joinLink` — see the join-link tests below.)
        let url = URL(string: "https://meeshy.me/settings")!
        let result = DeepLinkParser.parse(url)
        guard case .external = result else {
            XCTFail("Expected .external, got \(result)")
            return
        }
    }

    // MARK: - Invitation / Join links (parser parity with DeepLinkRouter)
    //
    // Regression guard: `DeepLinkParser` used to return `.external` for
    // `/join`, `/l`, `/chat` and the long-form `/conversation`, which made
    // `isMeeshyDeepLink` return `false` and caused `AppDelegate
    // .application(_:continue:)` to bounce cold-launch invitation Universal
    // Links to Safari instead of opening the join flow. These pin the parser
    // in lockstep with `DeepLinkRouter.handle`.

    func test_parse_webUrl_join_returnsJoinLink() {
        let url = URL(string: "https://meeshy.me/join/inv123")!
        guard case .joinLink(let id) = DeepLinkParser.parse(url) else {
            XCTFail("Expected .joinLink")
            return
        }
        XCTAssertEqual(id, "inv123")
    }

    func test_parse_webUrl_trackedShareLink_returnsTrackedLink() {
        // `/l/<token>` is a tracked share link resolved async by targetType
        // (fix collision tracking↔invitation), no longer assumed to be a join.
        let url = URL(string: "https://meeshy.me/l/shortcode")!
        guard case .trackedLink(let token) = DeepLinkParser.parse(url) else {
            XCTFail("Expected .trackedLink")
            return
        }
        XCTAssertEqual(token, "shortcode")
    }

    func test_parse_webUrl_chat_returnsChatLink() {
        let url = URL(string: "https://meeshy.me/chat/mshy_support")!
        guard case .chatLink(let id) = DeepLinkParser.parse(url) else {
            XCTFail("Expected .chatLink")
            return
        }
        XCTAssertEqual(id, "mshy_support")
    }

    func test_parse_webUrl_conversationLongForm_returnsConversation() {
        let url = URL(string: "https://meeshy.me/conversation/conv789")!
        guard case .conversation(let id) = DeepLinkParser.parse(url) else {
            XCTFail("Expected .conversation")
            return
        }
        XCTAssertEqual(id, "conv789")
    }

    func test_parse_webUrl_join_emptyId_returnsExternal() {
        let url = URL(string: "https://meeshy.me/join/")!
        guard case .external = DeepLinkParser.parse(url) else {
            XCTFail("Expected .external for empty join id")
            return
        }
    }

    func test_parse_customScheme_join_returnsJoinLink() {
        let url = URL(string: "meeshy://join/inv999")!
        guard case .joinLink(let id) = DeepLinkParser.parse(url) else {
            XCTFail("Expected .joinLink")
            return
        }
        XCTAssertEqual(id, "inv999")
    }

    func test_parse_customScheme_chat_returnsChatLink() {
        let url = URL(string: "meeshy://chat/mshy_abc123")!
        guard case .chatLink(let id) = DeepLinkParser.parse(url) else {
            XCTFail("Expected .chatLink")
            return
        }
        XCTAssertEqual(id, "mshy_abc123")
    }

    func test_parse_customScheme_conversationLongForm_returnsConversation() {
        let url = URL(string: "meeshy://conversation/conv222")!
        guard case .conversation(let id) = DeepLinkParser.parse(url) else {
            XCTFail("Expected .conversation")
            return
        }
        XCTAssertEqual(id, "conv222")
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

    // MARK: - Edge Cases: Malformed URLs

    func test_parse_customScheme_emptyPath_returnsExternal() {
        let url = URL(string: "meeshy://")!
        let result = DeepLinkParser.parse(url)
        guard case .external = result else {
            XCTFail("Expected .external for empty meeshy:// path, got \(result)")
            return
        }
    }

    func test_parse_customScheme_userProfile_emptyUsername_returnsExternal() {
        let url = URL(string: "meeshy://u/")!
        let result = DeepLinkParser.parse(url)
        guard case .external = result else {
            XCTFail("Expected .external for empty username, got \(result)")
            return
        }
    }

    func test_parse_customScheme_conversation_emptyId_returnsExternal() {
        let url = URL(string: "meeshy://c/")!
        let result = DeepLinkParser.parse(url)
        guard case .external = result else {
            XCTFail("Expected .external for empty conversation id, got \(result)")
            return
        }
    }

    func test_parse_customScheme_share_noParams_returnsShare() {
        let url = URL(string: "meeshy://share")!
        let result = DeepLinkParser.parse(url)
        guard case .share(let text, let urlString) = result else {
            XCTFail("Expected .share, got \(result)")
            return
        }
        XCTAssertNil(text)
        XCTAssertNil(urlString)
    }

    func test_parse_customScheme_specialCharacters_inUsername() {
        let url = URL(string: "meeshy://u/user%20name%40test")!
        let result = DeepLinkParser.parse(url)
        guard case .userProfile(let username) = result else {
            XCTFail("Expected .userProfile, got \(result)")
            return
        }
        XCTAssertEqual(username, "user name@test")
    }

    func test_parse_magicLink_emptyToken_returnsMagicLinkWithEmptyString() {
        let url = URL(string: "meeshy://auth/magic-link?token=")!
        let result = DeepLinkParser.parse(url)
        guard case .magicLink(let token) = result else {
            XCTFail("Expected .magicLink with empty token, got \(result)")
            return
        }
        XCTAssertEqual(token, "")
    }

    // MARK: - Universal Links (https://meeshy.me)

    func test_parse_universalLink_userProfile_returnsUsername() {
        let url = URL(string: "https://meeshy.me/u/testuser123")!
        let result = DeepLinkParser.parse(url)
        guard case .userProfile(let username) = result else {
            XCTFail("Expected .userProfile, got \(result)")
            return
        }
        XCTAssertEqual(username, "testuser123")
    }

    func test_parse_universalLink_conversation_returnsId() {
        let url = URL(string: "https://meeshy.me/c/60d0fe4f5311236168a109ca")!
        let result = DeepLinkParser.parse(url)
        guard case .conversation(let id) = result else {
            XCTFail("Expected .conversation, got \(result)")
            return
        }
        XCTAssertEqual(id, "60d0fe4f5311236168a109ca")
    }

    func test_parse_universalLink_magic_returnsToken() {
        let url = URL(string: "https://meeshy.me/auth/magic-link?token=abcdef123456")!
        let result = DeepLinkParser.parse(url)
        guard case .magicLink(let token) = result else {
            XCTFail("Expected .magicLink, got \(result)")
            return
        }
        XCTAssertEqual(token, "abcdef123456")
    }

    func test_parse_universalLink_appSubdomain_conversation() {
        let url = URL(string: "https://app.meeshy.me/c/conv999")!
        let result = DeepLinkParser.parse(url)
        guard case .conversation(let id) = result else {
            XCTFail("Expected .conversation, got \(result)")
            return
        }
        XCTAssertEqual(id, "conv999")
    }

    func test_parse_universalLink_unknownSubpath_returnsExternal() {
        let url = URL(string: "https://meeshy.me/unknown/deep/path")!
        let result = DeepLinkParser.parse(url)
        guard case .external = result else {
            XCTFail("Expected .external, got \(result)")
            return
        }
    }

    func test_parse_webUrl_share_urlOnly() {
        let url = URL(string: "https://meeshy.me/share?url=https://example.com/page")!
        let result = DeepLinkParser.parse(url)
        guard case .share(let text, let urlString) = result else {
            XCTFail("Expected .share, got \(result)")
            return
        }
        XCTAssertNil(text)
        XCTAssertEqual(urlString, "https://example.com/page")
    }
}

// MARK: - DeepLinkRouter Tests

@MainActor
final class DeepLinkRouterTests: XCTestCase {

    private func makeSUT() -> DeepLinkRouter { DeepLinkRouter() }

    // MARK: - Universal Link handling

    func test_handle_joinLink_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/join/inv123")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .joinLink(identifier: "inv123"))
    }

    func test_handle_trackedShareLink_isClaimedAndResolvedAsync() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/l/shortcode")!

        let handled = sut.handle(url: url)

        // `/l/<token>` is claimed as a Meeshy deep link (so it never bounces to
        // Safari) but its destination is resolved ASYNC by targetType — it is
        // not set synchronously. Typed resolution is covered by
        // DeepLinkRouterTrackedDestinationTests.
        XCTAssertTrue(handled)
        XCTAssertNil(sut.pendingDeepLink)
    }

    func test_handle_conversationLink_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/c/conv456")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "conv456"))
    }

    func test_handle_conversationFullPath_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/conversation/conv789")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "conv789"))
    }

    func test_handle_unknownMeeshyPath_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/settings")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
        XCTAssertNil(sut.pendingDeepLink)
    }

    func test_handle_externalUrl_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "https://google.com/search")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
    }

    func test_handle_emptyPath_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
    }

    func test_handle_joinWithoutIdentifier_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/join")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
    }

    func test_handle_feedsPost_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/feeds/post/postRouter123")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .postDetail(postId: "postRouter123"))
    }

    func test_handle_postShortPath_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/p/postShort789")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .postDetail(postId: "postShort789"))
    }

    func test_handle_customScheme_feedsPost_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://feeds/post/customPost999")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .postDetail(postId: "customPost999"))
    }

    func test_handle_customScheme_postShort_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://p/cs_short_post")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .postDetail(postId: "cs_short_post"))
    }

    func test_handle_feedsWithoutPostId_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/feeds/post/")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
        XCTAssertNil(sut.pendingDeepLink)
    }

    func test_handle_appMeeshyMe_recognized() {
        let sut = makeSUT()
        let url = URL(string: "https://app.meeshy.me/c/conv111")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "conv111"))
    }

    // MARK: - Custom Scheme via router

    func test_handle_customScheme_join_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://join/inv999")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .joinLink(identifier: "inv999"))
    }

    func test_handle_customScheme_conversation_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://conversation/conv222")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "conv222"))
    }

    func test_handle_customScheme_auth_magicLink_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://auth/magic-link?token=tok999")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .magicLink(token: "tok999"))
    }

    func test_handle_customScheme_auth_noToken_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://auth/magic-link")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
    }

    func test_handle_customScheme_unknown_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://settings")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
    }

    // MARK: - Consume

    func test_consumePendingDeepLink_returnsAndClears() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/join/abc")!
        _ = sut.handle(url: url)

        let consumed = sut.consumePendingDeepLink()

        XCTAssertEqual(consumed, .joinLink(identifier: "abc"))
        XCTAssertNil(sut.pendingDeepLink)
    }

    func test_consumePendingDeepLink_whenNoPending_returnsNil() {
        let sut = makeSUT()
        let consumed = sut.consumePendingDeepLink()

        XCTAssertNil(consumed)
    }

    func test_handle_overwritesPreviousPendingLink() {
        let sut = makeSUT()
        _ = sut.handle(url: URL(string: "https://meeshy.me/join/first")!)
        _ = sut.handle(url: URL(string: "https://meeshy.me/c/second")!)

        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "second"))
    }
}

// MARK: - DeepLinkRouter chatLink Tests

@MainActor
final class DeepLinkRouterChatLinkTests: XCTestCase {

    private func makeSUT() -> DeepLinkRouter { DeepLinkRouter() }

    func test_handle_chatPath_setsChatLink() {
        let sut = makeSUT()
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
        let sut = makeSUT()
        let url = URL(string: "meeshy://chat/mshy_abc123")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        guard case .chatLink(let id) = sut.pendingDeepLink else {
            XCTFail("Expected chatLink, got \(String(describing: sut.pendingDeepLink))")
            return
        }
        XCTAssertEqual(id, "mshy_abc123")
    }
}

// MARK: - DeepLink Equatable Tests

@MainActor
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

    func test_postDetail_equality() {
        XCTAssertEqual(DeepLink.postDetail(postId: "p1"), DeepLink.postDetail(postId: "p1"))
        XCTAssertNotEqual(DeepLink.postDetail(postId: "p1"), DeepLink.postDetail(postId: "p2"))
        XCTAssertNotEqual(DeepLink.postDetail(postId: "x"), DeepLink.conversation(id: "x"))
    }

    func test_storyDetail_equality() {
        XCTAssertEqual(DeepLink.storyDetail(postId: "s1"), DeepLink.storyDetail(postId: "s1"))
        XCTAssertNotEqual(DeepLink.storyDetail(postId: "s1"), DeepLink.storyDetail(postId: "s2"))
        // Story and post deep links carry the same identifier shape but are
        // distinct cases — they dispatch to different surfaces (viewer vs
        // detail). Equality must respect that.
        XCTAssertNotEqual(DeepLink.storyDetail(postId: "x"), DeepLink.postDetail(postId: "x"))
    }
}

// MARK: - DeepLinkParser Post Detail Tests

@MainActor
final class DeepLinkParserPostDetailTests: XCTestCase {

    func test_parse_webUrl_feedsPost_returnsPostDetail() {
        let url = URL(string: "https://meeshy.me/feeds/post/abc123def456")!
        let result = DeepLinkParser.parse(url)
        guard case .postDetail(let postId) = result else {
            XCTFail("Expected .postDetail, got \(result)")
            return
        }
        XCTAssertEqual(postId, "abc123def456")
    }

    func test_parse_webUrl_feedsPost_wwwSubdomain() {
        let url = URL(string: "https://www.meeshy.me/feeds/post/post789")!
        let result = DeepLinkParser.parse(url)
        guard case .postDetail(let postId) = result else {
            XCTFail("Expected .postDetail, got \(result)")
            return
        }
        XCTAssertEqual(postId, "post789")
    }

    func test_parse_webUrl_feedsPost_appSubdomain() {
        let url = URL(string: "https://app.meeshy.me/feeds/post/post000")!
        let result = DeepLinkParser.parse(url)
        guard case .postDetail(let postId) = result else {
            XCTFail("Expected .postDetail, got \(result)")
            return
        }
        XCTAssertEqual(postId, "post000")
    }

    func test_parse_webUrl_feedsList_noPostId_returnsExternal() {
        let url = URL(string: "https://meeshy.me/feeds")!
        let result = DeepLinkParser.parse(url)
        guard case .external = result else {
            XCTFail("Expected .external for /feeds without post id, got \(result)")
            return
        }
    }

    func test_parse_customScheme_post_returnsPostDetail() {
        let url = URL(string: "meeshy://post/postXYZ")!
        let result = DeepLinkParser.parse(url)
        guard case .postDetail(let postId) = result else {
            XCTFail("Expected .postDetail, got \(result)")
            return
        }
        XCTAssertEqual(postId, "postXYZ")
    }

    func test_parse_customScheme_feedsPost_returnsPostDetail() {
        let url = URL(string: "meeshy://feeds/post/postABC")!
        let result = DeepLinkParser.parse(url)
        guard case .postDetail(let postId) = result else {
            XCTFail("Expected .postDetail, got \(result)")
            return
        }
        XCTAssertEqual(postId, "postABC")
    }

    // MARK: - Short `p` aliases

    func test_parse_customScheme_pShort_returnsPostDetail() {
        let url = URL(string: "meeshy://p/postSHORT")!
        let result = DeepLinkParser.parse(url)
        guard case .postDetail(let postId) = result else {
            XCTFail("Expected .postDetail, got \(result)")
            return
        }
        XCTAssertEqual(postId, "postSHORT")
    }

    func test_parse_customScheme_feedsPShort_returnsPostDetail() {
        let url = URL(string: "meeshy://feeds/p/postXYZ789")!
        let result = DeepLinkParser.parse(url)
        guard case .postDetail(let postId) = result else {
            XCTFail("Expected .postDetail, got \(result)")
            return
        }
        XCTAssertEqual(postId, "postXYZ789")
    }

    func test_parse_webUrl_feedsPShort_returnsPostDetail() {
        let url = URL(string: "https://meeshy.me/feeds/p/postWEB")!
        let result = DeepLinkParser.parse(url)
        guard case .postDetail(let postId) = result else {
            XCTFail("Expected .postDetail, got \(result)")
            return
        }
        XCTAssertEqual(postId, "postWEB")
    }

    func test_parse_customScheme_pShort_emptyId_returnsExternal() {
        let url = URL(string: "meeshy://p/")!
        let result = DeepLinkParser.parse(url)
        guard case .external = result else {
            XCTFail("Expected .external for empty post id, got \(result)")
            return
        }
    }

    func test_isPostSegment_acceptsCanonicalAndShortAliases() {
        XCTAssertTrue(DeepLinkParser.isPostSegment("post"))
        XCTAssertTrue(DeepLinkParser.isPostSegment("p"))
        XCTAssertFalse(DeepLinkParser.isPostSegment("posts"))
        XCTAssertFalse(DeepLinkParser.isPostSegment("Post"))
        XCTAssertFalse(DeepLinkParser.isPostSegment(""))
    }
}

// MARK: - DeepLinkParser Story Detail Tests

@MainActor
final class DeepLinkParserStoryDetailTests: XCTestCase {

    func test_parse_webUrl_story_returnsStoryDetail() {
        let url = URL(string: "https://meeshy.me/story/storyABC123")!
        let result = DeepLinkParser.parse(url)
        guard case .storyDetail(let postId) = result else {
            XCTFail("Expected .storyDetail, got \(result)")
            return
        }
        XCTAssertEqual(postId, "storyABC123")
    }

    func test_parse_webUrl_storiesPlural_returnsStoryDetail() {
        let url = URL(string: "https://meeshy.me/stories/storyPlural")!
        let result = DeepLinkParser.parse(url)
        guard case .storyDetail(let postId) = result else {
            XCTFail("Expected .storyDetail, got \(result)")
            return
        }
        XCTAssertEqual(postId, "storyPlural")
    }

    func test_parse_webUrl_story_wwwSubdomain() {
        let url = URL(string: "https://www.meeshy.me/story/storyWWW")!
        let result = DeepLinkParser.parse(url)
        guard case .storyDetail(let postId) = result else {
            XCTFail("Expected .storyDetail, got \(result)")
            return
        }
        XCTAssertEqual(postId, "storyWWW")
    }

    func test_parse_customScheme_story_returnsStoryDetail() {
        let url = URL(string: "meeshy://story/storyCustom")!
        let result = DeepLinkParser.parse(url)
        guard case .storyDetail(let postId) = result else {
            XCTFail("Expected .storyDetail, got \(result)")
            return
        }
        XCTAssertEqual(postId, "storyCustom")
    }

    func test_parse_customScheme_storiesPlural_returnsStoryDetail() {
        let url = URL(string: "meeshy://stories/storyCustomPlural")!
        let result = DeepLinkParser.parse(url)
        guard case .storyDetail(let postId) = result else {
            XCTFail("Expected .storyDetail, got \(result)")
            return
        }
        XCTAssertEqual(postId, "storyCustomPlural")
    }

    func test_parse_customScheme_story_emptyId_returnsExternal() {
        let url = URL(string: "meeshy://story/")!
        let result = DeepLinkParser.parse(url)
        guard case .external = result else {
            XCTFail("Expected .external for empty story id, got \(result)")
            return
        }
    }

    func test_isStorySegment_acceptsCanonicalAndPlural() {
        XCTAssertTrue(DeepLinkParser.isStorySegment("story"))
        XCTAssertTrue(DeepLinkParser.isStorySegment("stories"))
        XCTAssertFalse(DeepLinkParser.isStorySegment("Story"))
        XCTAssertFalse(DeepLinkParser.isStorySegment("storie"))
        XCTAssertFalse(DeepLinkParser.isStorySegment(""))
    }
}

// MARK: - DeepLinkRouter Story Detail Tests

@MainActor
final class DeepLinkRouterStoryDetailTests: XCTestCase {

    private func makeSUT() -> DeepLinkRouter { DeepLinkRouter() }

    func test_handle_story_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/story/storyUniversal")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .storyDetail(postId: "storyUniversal"))
    }

    func test_handle_storiesPlural_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/stories/storyUniversalPlural")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .storyDetail(postId: "storyUniversalPlural"))
    }

    func test_handle_story_emptyId_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/story/")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
        XCTAssertNil(sut.pendingDeepLink)
    }

    func test_handle_customScheme_story_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://story/storyCS")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .storyDetail(postId: "storyCS"))
    }

    func test_handle_customScheme_storiesPlural_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://stories/storyCSPlural")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .storyDetail(postId: "storyCSPlural"))
    }

    func test_handle_customScheme_story_emptyId_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://story/")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
        XCTAssertNil(sut.pendingDeepLink)
    }
}

// MARK: - DeepLinkRouter Profile / Self Route Tests (cold launch)
//
// The `handle()` branch (Universal Link cold launch) used to silently
// drop `/me`, `/links`, `/u/<id>`, `/users/<id>` even though AASA claimed
// them — `isMeeshyDeepLink` returned `true`, AppDelegate claimed the URL,
// and the router then no-op'd because the switch had no matching case.
// These tests pin the wiring so a future refactor can't regress.

@MainActor
final class DeepLinkRouterProfileTests: XCTestCase {

    private func makeSUT() -> DeepLinkRouter { DeepLinkRouter() }

    // MARK: /me

    func test_handle_universalLink_me_setsOwnProfile() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/me")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .ownProfile)
    }

    func test_handle_customScheme_me_setsOwnProfile() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://me")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .ownProfile)
    }

    // MARK: /links

    func test_handle_universalLink_links_setsUserLinks() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/links")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .userLinks)
    }

    func test_handle_customScheme_links_setsUserLinks() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://links")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .userLinks)
    }

    // MARK: /u/<username>, /users/<username>

    func test_handle_universalLink_uShort_setsUserProfile() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/u/jcharlesnm")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .userProfile(username: "jcharlesnm"))
    }

    func test_handle_universalLink_usersPlural_setsUserProfile() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/users/atabeth")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .userProfile(username: "atabeth"))
    }

    func test_handle_universalLink_users_emptyId_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/users/")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
        XCTAssertNil(sut.pendingDeepLink)
    }

    func test_handle_customScheme_u_setsUserProfile() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://u/ada")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .userProfile(username: "ada"))
    }

    func test_handle_customScheme_usersPlural_setsUserProfile() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://users/turing")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .userProfile(username: "turing"))
    }
}

// MARK: - DeepLinkRouter Short Post / Story Aliases (cold launch)

@MainActor
final class DeepLinkRouterShortAliasTests: XCTestCase {

    private func makeSUT() -> DeepLinkRouter { DeepLinkRouter() }

    // Short post URLs at root (no /feeds prefix)

    func test_handle_universalLink_postShortRoot_setsPostDetail() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/post/postRootLong")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .postDetail(postId: "postRootLong"))
    }

    func test_handle_universalLink_pShortRoot_setsPostDetail() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/p/postRootShort")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .postDetail(postId: "postRootShort"))
    }

    func test_handle_customScheme_postShort_setsPostDetail() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://post/postCSRoot")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .postDetail(postId: "postCSRoot"))
    }

    // Short story URL

    func test_handle_universalLink_sShort_setsStoryDetail() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/s/storyShortWeb")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .storyDetail(postId: "storyShortWeb"))
    }

    func test_handle_customScheme_sShort_setsStoryDetail() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://s/storyShortCS")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .storyDetail(postId: "storyShortCS"))
    }

    func test_isUserSegment_acceptsCanonicalAndPlural() {
        XCTAssertTrue(DeepLinkParser.isUserSegment("u"))
        XCTAssertTrue(DeepLinkParser.isUserSegment("users"))
        XCTAssertFalse(DeepLinkParser.isUserSegment("user"))
        XCTAssertFalse(DeepLinkParser.isUserSegment("U"))
        XCTAssertFalse(DeepLinkParser.isUserSegment(""))
    }

    func test_isStorySegment_acceptsCanonicalPluralAndShort() {
        XCTAssertTrue(DeepLinkParser.isStorySegment("story"))
        XCTAssertTrue(DeepLinkParser.isStorySegment("stories"))
        XCTAssertTrue(DeepLinkParser.isStorySegment("s"))
        XCTAssertFalse(DeepLinkParser.isStorySegment("Story"))
        XCTAssertFalse(DeepLinkParser.isStorySegment("storie"))
    }
}

// MARK: - DeepLink Equatable — Profile / Self cases

@MainActor
final class DeepLinkProfileEquatableTests: XCTestCase {

    func test_userProfile_equality() {
        XCTAssertEqual(DeepLink.userProfile(username: "ada"), DeepLink.userProfile(username: "ada"))
        XCTAssertNotEqual(DeepLink.userProfile(username: "ada"), DeepLink.userProfile(username: "bob"))
    }

    func test_ownProfile_equality() {
        XCTAssertEqual(DeepLink.ownProfile, DeepLink.ownProfile)
        XCTAssertNotEqual(DeepLink.ownProfile, DeepLink.userLinks)
        XCTAssertNotEqual(DeepLink.ownProfile, DeepLink.userProfile(username: "x"))
    }

    func test_userLinks_equality() {
        XCTAssertEqual(DeepLink.userLinks, DeepLink.userLinks)
        XCTAssertNotEqual(DeepLink.userLinks, DeepLink.ownProfile)
    }
}

// MARK: - DeepLinkRouter Post Detail Tests

@MainActor
final class DeepLinkRouterPostDetailTests: XCTestCase {

    private func makeSUT() -> DeepLinkRouter { DeepLinkRouter() }

    func test_handle_feedsPost_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/feeds/post/postShareToken")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .postDetail(postId: "postShareToken"))
    }

    func test_handle_feedsPost_emptyId_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/feeds/post/")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
        XCTAssertNil(sut.pendingDeepLink)
    }

    func test_handle_feedsWithoutPost_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/feeds/explore/today")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
    }

    func test_handle_customScheme_post_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://post/postCustom")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .postDetail(postId: "postCustom"))
    }

    func test_handle_customScheme_feedsPost_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://feeds/post/postMirror")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .postDetail(postId: "postMirror"))
    }

    func test_handle_customScheme_pShort_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://p/postShort1")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .postDetail(postId: "postShort1"))
    }

    func test_handle_universalLink_feedsPShort_setsPendingDeepLink() {
        // The Universal Link branch of `handle()` mirrors the parser by
        // accepting both `/feeds/post/<id>` and `/feeds/p/<id>` via the
        // shared `isPostSegment` helper. AASA only claims `/feeds/post/*`
        // today, so this path is exercised by in-app fallbacks rather than
        // cold-launch — the test locks in the parity so the two stay in
        // lockstep if AASA is later extended.
        let sut = makeSUT()
        let url = URL(string: "https://meeshy.me/feeds/p/postShortWeb")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .postDetail(postId: "postShortWeb"))
    }

    func test_handle_customScheme_feedsPShort_setsPendingDeepLink() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://feeds/p/postShort2")!

        let handled = sut.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .postDetail(postId: "postShort2"))
    }

    func test_handle_customScheme_pShort_emptyId_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://p/")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
        XCTAssertNil(sut.pendingDeepLink)
    }

    func test_handle_customScheme_feedsPShort_emptyId_returnsFalse() {
        let sut = makeSUT()
        let url = URL(string: "meeshy://feeds/p/")!

        let handled = sut.handle(url: url)

        XCTAssertFalse(handled)
        XCTAssertNil(sut.pendingDeepLink)
    }
}
