import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// Le détail d'un post s'ouvre en FEUILLE, et plus jamais en écran empilé
/// (#16676, directive porteur du 2026-11-07).
///
/// Le routeur est le seul canal : toutes les portes poussent `.postDetail`, et
/// c'est lui qui en fait une feuille. Ces témoins le prennent au mot — pile
/// intacte, feuille posée, et aucune présentation qui en croise une autre.
@MainActor
final class PostDetailSheetRoutingTests: XCTestCase {

    private func makeRouter(registry: PresentedSurfaceRegistry = PresentedSurfaceRegistry()) -> Router {
        Router(surfaces: registry, surfaceHandoffNanoseconds: 0)
    }

    private func makeConversation(id: String = "0000000000000000000000c1") -> Conversation {
        Conversation(id: id, identifier: id, type: .direct, title: "Test", lastMessageAt: Date(), createdAt: Date(), updatedAt: Date())
    }

    private func awaitPresentedPost(_ router: Router, id postId: String) async {
        let presented = expectation(description: "la feuille du post \(postId) monte")
        let watch = router.$presentedPost
            .compactMap { $0 }
            .filter { $0.postId == postId }
            .first()
            .sink { _ in presented.fulfill() }
        await fulfillment(of: [presented], timeout: 2)
        watch.cancel()
    }

    // MARK: - La feuille, pas la pile

    func test_push_postDetail_presentsTheSheet_withoutStacking() {
        let router = makeRouter()

        router.push(.postDetail("p1"))

        XCTAssertTrue(router.path.isEmpty)
        XCTAssertEqual(router.presentedPost?.postId, "p1")
    }

    func test_push_postDetail_carriesTheWholeTarget_toTheSheet() {
        let router = makeRouter()

        router.push(.postDetail("p1", nil, showComments: true, commentId: "c1", parentCommentId: "c0"))

        let post = router.presentedPost
        XCTAssertEqual(post?.showComments, true)
        XCTAssertEqual(post?.commentId, "c1")
        XCTAssertEqual(post?.parentCommentId, "c0")
    }

    func test_sheetIdentity_differsByTargetedComment() {
        let plain = PostDetailSheetTarget(.postDetail("p1"))
        let onComment = PostDetailSheetTarget(.postDetail("p1", nil, showComments: true, commentId: "c1"))

        XCTAssertNotEqual(plain?.id, onComment?.id)
    }

    func test_target_isOnlyBuiltFromAPostRoute() {
        XCTAssertNil(PostDetailSheetTarget(.settings))
    }

    // MARK: - Ce qui part depuis la feuille

    func test_anotherRoute_pushedFromTheSheet_closesItAndLandsBeneath() {
        let router = makeRouter()
        router.push(.postDetail("p1"))

        router.push(.hashtagResults(tag: "meeshy"))

        XCTAssertNil(router.presentedPost)
        XCTAssertEqual(router.path, [.hashtagResults(tag: "meeshy")])
    }

    func test_openingAConversation_closesTheSheet() {
        let router = makeRouter()
        router.push(.postDetail("p1"))

        router.navigateToConversation(makeConversation())

        XCTAssertNil(router.presentedPost)
        XCTAssertEqual(router.path.count, 1)
    }

    func test_replacingTheStack_closesTheSheet() {
        let router = makeRouter()
        router.push(.postDetail("p1"))

        router.replaceStack(with: .settings)

        XCTAssertNil(router.presentedPost)
        XCTAssertEqual(router.path, [.settings])
    }

    func test_aRepostOpenedFromTheSheet_replacesIt_afterItLeaves() async {
        let router = makeRouter()
        router.push(.postDetail("p1"))

        router.push(.postDetail("repost"))

        XCTAssertNil(router.presentedPost, "deux feuilles ne se croisent pas")
        await awaitPresentedPost(router, id: "repost")
    }

    // MARK: - Une feuille racine déjà ouverte passe la main

    func test_profileSheetOpen_closesFirst_thenThePostRises() async {
        let router = makeRouter()
        router.deepLinkProfileUser = ProfileSheetUser(userId: "u1", username: "alice")

        router.push(.postDetail("p1"))

        XCTAssertNil(router.deepLinkProfileUser)
        XCTAssertNil(router.presentedPost, "la feuille du post attend le départ du profil")
        await awaitPresentedPost(router, id: "p1")
    }

    func test_declaredSurface_isClosedBeforeThePostRises() async {
        let registry = PresentedSurfaceRegistry()
        let router = makeRouter(registry: registry)
        var closed = 0
        _ = registry.declare(.storyViewer, answer: { .closes }) { closed += 1 }

        router.push(.postDetail("p1"))

        XCTAssertEqual(closed, 1)
        XCTAssertNil(router.presentedPost)
        await awaitPresentedPost(router, id: "p1")
    }

    func test_aConversationOpenedWhileThePostWaits_cancelsIt() async {
        let router = makeRouter()
        router.deepLinkProfileUser = ProfileSheetUser(userId: "u1", username: "alice")
        router.push(.postDetail("p1"))

        router.navigateToConversation(makeConversation())
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertNil(router.presentedPost, "le post en attente ne monte pas sur la conversation ouverte ensuite")
    }

    // MARK: - Fermer

    func test_closePostDetail_closesTheSheet_withoutTouchingThePath() {
        let router = makeRouter()
        router.path = [.settings]
        router.push(.postDetail("p1"))

        router.closePostDetail()

        XCTAssertNil(router.presentedPost)
        XCTAssertEqual(router.path, [.settings])
    }

    func test_closePostDetail_withoutSheet_popsAsBefore() {
        let router = makeRouter()
        router.path = [.settings, .profile]

        router.closePostDetail()

        XCTAssertEqual(router.path, [.settings])
    }

    // MARK: - iPad deux colonnes : le panneau, pas la feuille

    func test_twoColumnLayout_forwardsThePost_toThePanel() {
        let router = makeRouter()
        var forwarded: [Route] = []
        router.onRouteRequested = { route in
            forwarded.append(route)
            return true
        }

        router.push(.postDetail("p1"))

        XCTAssertNil(router.presentedPost)
        XCTAssertFalse(router.presentsPostDetailAsSheet)
        XCTAssertEqual(forwarded, [.postDetail("p1")])
    }
}
