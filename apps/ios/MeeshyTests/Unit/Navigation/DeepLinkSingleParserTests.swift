import XCTest
@testable import Meeshy

/// **Un lien Meeshy se lit à un seul endroit** (#7815).
///
/// `DeepLinkParser.parse` (tap in-app) et `DeepLinkRouter.handle` (lancement
/// système) analysaient les mêmes URL par deux `switch` recopiés : chaque
/// nouveau format devait être ajouté aux deux, et un oubli faisait diverger les
/// portes en silence. Le routeur ne fait plus que TRADUIRE la destination du
/// parseur ; ce témoin rougit dès que les deux voies rendent deux verdicts.
@MainActor
final class DeepLinkSingleParserTests: XCTestCase {

    private static let corpus: [String] = [
        "https://meeshy.me/me", "https://meeshy.me/links",
        "https://meeshy.me/u/alice", "https://meeshy.me/users/bob",
        "https://meeshy.me/c/conv1", "https://meeshy.me/conversation/conv2",
        "https://meeshy.me/join/inv1", "https://meeshy.me/chat/chat1",
        "https://meeshy.me/feeds/post/p1", "https://meeshy.me/feeds/p/p2",
        "https://meeshy.me/post/p3", "https://meeshy.me/p/p4",
        "https://meeshy.me/story/s1", "https://meeshy.me/stories/s2", "https://meeshy.me/s/s3",
        "https://meeshy.me/reel/r1", "https://meeshy.me/reels?seed=r2",
        "https://meeshy.me/communities/cm1", "https://meeshy.me/hashtag/voyage",
        "https://www.meeshy.me/story/s4", "https://app.meeshy.me/c/conv3",
        "meeshy://me", "meeshy://links", "meeshy://u/carol", "meeshy://users/dan",
        "meeshy://c/conv4", "meeshy://conversation/conv5", "meeshy://contact/conv6",
        "meeshy://join/inv2", "meeshy://chat/chat2", "meeshy://Join/inv3",
        "meeshy://post/p5", "meeshy://p/p6", "meeshy://feeds/post/p7",
        "meeshy://story/s5", "meeshy://reel/r3", "meeshy://community/cm2",
        "meeshy://hashtag/soleil", "meeshy://conversations/unread", "meeshy://conversations/recent",
        "meeshy://auth/magic-link?token=tok1",
        "https://meeshy.me/auth/magic-link?token=tok2", "https://meeshy.me/auth/magic-link/tok3"
    ]

    private func makeRouter() -> DeepLinkRouter {
        let defaults = UserDefaults(suiteName: "DeepLinkSingleParser.\(UUID().uuidString)")!
        return DeepLinkRouter(drafts: DraftStore(userDefaults: defaults, userIdProvider: { "single-parser" }))
    }

    func test_handle_rendLaDestinationDuParseur_pourChaqueForme() {
        for raw in Self.corpus {
            let url = URL(string: raw)!
            let sut = makeRouter()
            let expected = DeepLinkRouter.link(for: DeepLinkParser.parse(url))

            XCTAssertNotNil(expected, "\(raw) doit être une destination in-app")
            XCTAssertTrue(sut.handle(url: url), "\(raw) doit être revendiqué")
            XCTAssertEqual(sut.pendingDeepLink, expected, "\(raw) : les deux voies divergent")
        }
    }

    /// Les refus stricts de l'ancienne voie système valent désormais pour les
    /// DEUX voies : un identifiant vide ou blanc n'ouvre rien in-app.
    func test_unIdentifiantVideOuBlanc_estRefuseParLesDeuxVoies() {
        for raw in ["https://meeshy.me/join/%20", "https://meeshy.me/c/%20", "meeshy://c/%20",
                    "https://meeshy.me/u", "meeshy://story/%20", "https://meeshy.me/communities/new"] {
            let url = URL(string: raw)!
            XCTAssertEqual(DeepLinkParser.parse(url), .external(url), "\(raw) ne nomme rien")
            XCTAssertFalse(makeRouter().handle(url: url), "\(raw) ne doit pas être revendiqué")
        }
    }

    /// Le partage in-app (`/share`) n'est pas une destination de lancement :
    /// le système ne le revendique pas, comme avant la fusion.
    func test_share_nEstPasRevendiqueParLeSysteme() {
        let url = URL(string: "https://meeshy.me/share?text=Salut")!
        XCTAssertEqual(DeepLinkParser.parse(url), .share(text: "Salut", url: nil))
        XCTAssertFalse(makeRouter().handle(url: url))
    }

    /// `/l/<token>` : le système le résout, il ne le pose pas tel quel.
    func test_lienDeSuivi_estRevendiquePourResolution() {
        XCTAssertTrue(makeRouter().handle(url: URL(string: "https://meeshy.me/l/abc123")!))
    }
}
