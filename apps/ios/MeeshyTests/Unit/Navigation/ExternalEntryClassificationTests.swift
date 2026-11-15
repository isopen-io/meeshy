import XCTest
@testable import Meeshy

@MainActor
final class ExternalEntryClassificationTests: XCTestCase {

    private func url(_ raw: String) -> URL { URL(string: raw)! }

    func test_relayURL_isAShareRelay() {
        XCTAssertEqual(
            ExternalEntry.classify(url: url("meeshy://share-relay?id=abc"), origin: .openURL),
            .shareRelay(id: "abc")
        )
    }

    func test_composeShareURL_isAShareCompose() {
        XCTAssertEqual(
            ExternalEntry.classify(url: url("meeshy://compose-share?id=xyz"), origin: .openURL),
            .shareCompose(id: "xyz")
        )
    }

    func test_composeShareURL_withoutIdentifier_isADeepLink() {
        let bare = url("meeshy://compose-share")
        XCTAssertEqual(ExternalEntry.classify(url: bare, origin: .openURL), .deepLink(bare))
    }

    func test_magicLink_isASignIn() {
        XCTAssertEqual(
            ExternalEntry.classify(url: url("https://meeshy.me/auth/magic-link/tok1"), origin: .openURL),
            .signIn(.magic(token: "tok1"))
        )
    }

    func test_verificationLink_isASignIn() {
        XCTAssertEqual(
            ExternalEntry.classify(url: url("https://meeshy.me/auth/verify-email?token=t&email=a%40b.co"), origin: .openURL),
            .signIn(.emailVerification(token: "t", email: "a@b.co"))
        )
    }

    func test_anythingElse_isADeepLink() {
        let post = url("https://meeshy.me/story/s1")
        XCTAssertEqual(ExternalEntry.classify(url: post, origin: .openURL), .deepLink(post))
    }

    func test_browsingActivity_knowsOnlySignInAndDeepLink() {
        let relay = url("meeshy://share-relay?id=abc")
        XCTAssertEqual(ExternalEntry.classify(url: relay, origin: .browsingActivity), .deepLink(relay))
        let compose = url("meeshy://compose-share?id=xyz")
        XCTAssertEqual(ExternalEntry.classify(url: compose, origin: .browsingActivity), .deepLink(compose))
        XCTAssertEqual(
            ExternalEntry.classify(url: url("https://meeshy.me/auth/magic-link/tok1"), origin: .browsingActivity),
            .signIn(.magic(token: "tok1"))
        )
    }
}
