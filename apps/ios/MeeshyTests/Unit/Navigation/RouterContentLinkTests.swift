import XCTest
@testable import Meeshy

/// **Un lien tapé DANS l'app ouvre ce que le même lien ouvre depuis l'extérieur** (#7805, #7808).
///
/// `Router.handleDeepLink` poussait le détail d'un post pour toute story, et ne
/// connaissait pas les réels : le même lien ouvrait deux écrans selon qu'on le
/// touchait dans un message ou dans Safari. Il remet désormais la destination à
/// la voie système, que la racine ouvre par `StoryDoor` / `ReelDoor`.
@MainActor
final class RouterContentLinkTests: XCTestCase {

    override func setUp() async throws {
        try await super.setUp()
        DeepLinkRouter.shared.pendingDeepLink = nil
    }

    override func tearDown() async throws {
        DeepLinkRouter.shared.pendingDeepLink = nil
        try await super.tearDown()
    }

    func test_handleDeepLink_lienDeStory_passeParLaPorteDesStories_sansPousserLeDetail() {
        let router = Router()

        router.handleDeepLink(URL(string: "https://meeshy.me/story/s1")!)

        XCTAssertEqual(DeepLinkRouter.shared.pendingDeepLink, .storyDetail(postId: "s1"))
        XCTAssertTrue(router.path.isEmpty)
    }

    func test_handleDeepLink_lienDeReel_passeParLaPorteDesReels_sansPousserLeDetail() {
        let router = Router()

        router.handleDeepLink(URL(string: "https://meeshy.me/reel/r1")!)

        XCTAssertEqual(DeepLinkRouter.shared.pendingDeepLink, .reel(postId: "r1"))
        XCTAssertTrue(router.path.isEmpty)
    }

    /// L'adresse PARTAGÉE d'une communauté (#20332) ouvre le détail en disant
    /// que le lecteur arrive par le lien ; l'adresse nue, non.
    func test_handleDeepLink_adressePartageeDUneCommunaute_ouvreLeDetailArriveParLeLien() {
        let shared = Router()
        shared.handleDeepLink(URL(string: "https://meeshy.me/communities/mshy_club?via=link")!)
        XCTAssertEqual(shared.path, [.communityDetail("mshy_club", viaLink: true)])

        let bare = Router()
        bare.handleDeepLink(URL(string: "https://meeshy.me/communities/mshy_club")!)
        XCTAssertEqual(bare.path, [.communityDetail("mshy_club")])
    }
}
