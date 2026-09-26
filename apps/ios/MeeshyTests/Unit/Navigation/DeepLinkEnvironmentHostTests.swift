import XCTest
import MeeshySDK
@testable import Meeshy

/// #8140 — l'app reconnaît comme liens Meeshy ceux de l'hôte web de
/// l'environnement SÉLECTIONNÉ : sur staging, `staging.meeshy.me` produit la
/// même carte et la même navigation que `meeshy.me` en production. La recette
/// staging voit ainsi ce que la production verra — sans qu'un hôte étranger,
/// ni un hôte qui ne fait que COMMENCER comme celui de l'environnement, soit
/// jamais pris pour Meeshy.
@MainActor
final class DeepLinkEnvironmentHostTests: XCTestCase {

    private static let staging = "https://staging.meeshy.me"
    private static let production = "https://meeshy.me"

    private func url(_ string: String) -> URL { URL(string: string)! }

    func test_parse_stagingJoinLinkOnStaging_isJoinLink() {
        let destination = DeepLinkParser.parse(url("https://staging.meeshy.me/join/mshy_club"), environmentWebOrigin: Self.staging)
        XCTAssertEqual(destination, .joinLink(identifier: "mshy_club"))
    }

    func test_parse_stagingDirectLinkOnStaging_isConversation() {
        let destination = DeepLinkParser.parse(url("https://staging.meeshy.me/c/abc123"), environmentWebOrigin: Self.staging)
        XCTAssertEqual(destination, .conversation(id: "abc123", draftText: nil))
    }

    func test_parse_stagingLinkOnProduction_staysExternal() {
        let link = url("https://staging.meeshy.me/join/mshy_club")
        XCTAssertEqual(DeepLinkParser.parse(link, environmentWebOrigin: Self.production), .external(link))
    }

    func test_parse_productionLinkOnStaging_isStillMeeshy() {
        let destination = DeepLinkParser.parse(url("https://meeshy.me/join/mshy_club"), environmentWebOrigin: Self.staging)
        XCTAssertEqual(destination, .joinLink(identifier: "mshy_club"))
    }

    func test_parse_foreignHostsOnStaging_stayExternal() {
        for foreign in [
            "https://evil.example/join/mshy_club",
            "https://staging.meeshy.me.evil.example/join/mshy_club",
            "https://evilstaging.meeshy.me/join/mshy_club",
            "https://gate.staging.meeshy.me/join/mshy_club",
        ] {
            let link = url(foreign)
            XCTAssertEqual(DeepLinkParser.parse(link, environmentWebOrigin: Self.staging), .external(link), foreign)
        }
    }

    func test_target_stagingLinksOnStaging_areConversationCards() {
        XCTAssertEqual(
            ConversationLinkTarget.target(for: "https://staging.meeshy.me/join/mshy_club", environmentWebOrigin: Self.staging),
            .shareLink(identifier: "mshy_club")
        )
        XCTAssertEqual(
            ConversationLinkTarget.target(for: "https://staging.meeshy.me/c/abc123", environmentWebOrigin: Self.staging),
            .direct(conversationId: "abc123")
        )
    }

    func test_parse_defaultEnvironment_readsTheSelectedWebOrigin() {
        let host = URL(string: MeeshyConfig.shared.webOrigin)?.host ?? "meeshy.me"
        let link = url("https://\(host)/join/mshy_club")
        XCTAssertEqual(DeepLinkParser.parse(link), .joinLink(identifier: "mshy_club"))
    }
}
