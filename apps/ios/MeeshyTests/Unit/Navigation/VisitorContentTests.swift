import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// #9171 — un lien universel de publication ou de réel ouvert SANS session
/// montre le contenu public, l'invitation à se connecter, et qui l'a partagé.
///
/// Trois maillons, trois familles de cas :
/// 1. le routeur GARDE le jeton d'un `/l/<jeton>` (`via`) après l'avoir résolu ;
/// 2. le chargeur sert / refuse / échoue, et ne résout le lien que s'il a un jeton ;
/// 3. le routage invité présente l'écran visiteur sans consommer le lien en attente.
private final class StubTrackedLinkResolver: TrackedLinkResolving, @unchecked Sendable {
    var resolveResult: Result<ResolvedTrackedLink, Error> = .failure(URLError(.notConnectedToInternet))
    private(set) var resolveCallCount = 0
    private(set) var lastResolvedToken: String?

    func resolve(token: String) async throws -> ResolvedTrackedLink {
        resolveCallCount += 1
        lastResolvedToken = token
        return try resolveResult.get()
    }

    func recordClick(token: String) async {}
}

@MainActor
final class VisitorContentTests: XCTestCase {

    // MARK: - Fabriques

    private func makeAPIPost(id: String = "p1", type: String = "POST", content: String = "Bonjour") -> APIPost {
        JSONStub.decode("""
        {"id":"\(id)","type":"\(type)","content":"\(content)","createdAt":"2026-10-02T10:00:00.000Z",
         "author":{"id":"a1","username":"alice"}}
        """)
    }

    private func makeLoader() -> (sut: VisitorContentLoader, posts: MockPostService, links: StubTrackedLinkResolver) {
        let posts = MockPostService()
        let links = StubTrackedLinkResolver()
        let sut = VisitorContentLoader(posts: posts, links: links, preferredLanguages: { [] })
        return (sut, posts, links)
    }

    private func makeRouter() -> DeepLinkRouter {
        DeepLinkRouter(isAuthenticated: { false }, hasResolvedSession: { true })
    }

    private func ada() -> TrackedLinkSharer {
        TrackedLinkSharer(displayName: "Ada Lovelace", username: "ada", avatar: nil)
    }

    /// Attend la prochaine destination non nulle du routeur (la résolution d'un
    /// `/l/<jeton>` part dans une tâche).
    private func awaitPendingLink(of router: DeepLinkRouter, after action: () -> Void) async {
        let resolved = expectation(description: "destination résolue")
        let cancellable = router.$pendingDeepLink.dropFirst().compactMap { $0 }.sink { _ in resolved.fulfill() }
        action()
        await fulfillment(of: [resolved], timeout: 2)
        cancellable.cancel()
    }

    // MARK: - 1. Le jeton survit à la résolution

    func test_resolveTrackedLink_reelTarget_keepsTokenAsVia() async {
        let router = makeRouter()
        let links = StubTrackedLinkResolver()
        links.resolveResult = .success(ResolvedTrackedLink(kind: "tracking", targetType: "REEL", targetId: "r1"))

        await awaitPendingLink(of: router) { router.resolveTrackedLink("abc123", resolver: links) }

        XCTAssertEqual(router.pendingDeepLink, .reel(postId: "r1"))
        XCTAssertEqual(router.via(for: .reel(postId: "r1")), "abc123")
        XCTAssertEqual(
            VisitorContentRequest(link: .reel(postId: "r1"), via: router.via(for: .reel(postId: "r1"))),
            VisitorContentRequest(postId: "r1", kind: .reel, via: "abc123")
        )
    }

    func test_resolveTrackedLink_postTarget_keepsTokenOnlyForThatDestination() async {
        let router = makeRouter()
        let links = StubTrackedLinkResolver()
        links.resolveResult = .success(ResolvedTrackedLink(kind: "tracking", targetType: "POST", targetId: "p1"))

        await awaitPendingLink(of: router) { router.resolveTrackedLink("tok", resolver: links) }

        XCTAssertEqual(router.via(for: .postDetail(postId: "p1")), "tok")
        XCTAssertNil(router.via(for: .postDetail(postId: "autre")))
    }

    func test_handleURL_directPostLink_hasNoVia() {
        let router = makeRouter()

        XCTAssertTrue(router.handle(url: URL(string: "https://meeshy.me/post/p1")!))

        XCTAssertEqual(router.pendingDeepLink, .postDetail(postId: "p1"))
        XCTAssertNil(router.via(for: .postDetail(postId: "p1")))
    }

    func test_handleURL_directLinkAfterTrackedLink_dropsVia() async {
        let router = makeRouter()
        let links = StubTrackedLinkResolver()
        links.resolveResult = .success(ResolvedTrackedLink(kind: "tracking", targetType: "REEL", targetId: "r1"))
        await awaitPendingLink(of: router) { router.resolveTrackedLink("abc123", resolver: links) }

        XCTAssertTrue(router.handle(url: URL(string: "https://meeshy.me/reel/r1")!))

        XCTAssertNil(router.via(for: .reel(postId: "r1")))
    }

    // MARK: - Ce qu'un visiteur peut voir

    func test_requestInit_postAndReel_mapToTheirKind() {
        XCTAssertEqual(VisitorContentRequest(link: .postDetail(postId: "p1"), via: nil)?.kind, .post)
        XCTAssertEqual(VisitorContentRequest(link: .reel(postId: "r1"), via: "t")?.kind, .reel)
        XCTAssertEqual(VisitorContentRequest(link: .reel(postId: "r1"), via: "t")?.via, "t")
    }

    func test_requestInit_otherLinks_areNotVisitorContent() {
        XCTAssertNil(VisitorContentRequest(link: .storyDetail(postId: "s1"), via: nil))
        XCTAssertNil(VisitorContentRequest(link: .conversation(id: "c1"), via: nil))
        XCTAssertNil(VisitorContentRequest(link: .joinLink(identifier: "j1"), via: nil))
        XCTAssertNil(VisitorContentRequest(link: .userProfile(username: "ada"), via: nil))
    }

    // MARK: - 2. Le chargeur

    func test_load_publicPostWithVia_isServedWithItsSharer() async {
        let (sut, posts, links) = makeLoader()
        posts.getPostResult = .success(makeAPIPost(id: "p1", content: "Bonjour"))
        links.resolveResult = .success(ResolvedTrackedLink(kind: "tracking", targetType: "POST", targetId: "p1", sharer: ada()))

        let state = await sut.load(VisitorContentRequest(postId: "p1", kind: .post, via: "abc123"))

        guard case let .served(post, sharer) = state else { return XCTFail("un post public est servi, état : \(state)") }
        XCTAssertEqual(post.id, "p1")
        XCTAssertEqual(post.displayContent, "Bonjour")
        XCTAssertEqual(sharer, ada())
        XCTAssertEqual(posts.lastGetPostId, "p1")
        XCTAssertEqual(links.lastResolvedToken, "abc123")
    }

    func test_load_withoutVia_neverCallsTheResolver() async {
        let (sut, posts, links) = makeLoader()
        posts.getPostResult = .success(makeAPIPost(id: "r1", type: "REEL"))

        let state = await sut.load(VisitorContentRequest(postId: "r1", kind: .reel, via: nil))

        guard case let .served(post, sharer) = state else { return XCTFail("un réel public est servi, état : \(state)") }
        XCTAssertEqual(post.id, "r1")
        XCTAssertNil(sharer)
        XCTAssertEqual(links.resolveCallCount, 0)
    }

    func test_load_sharerResolutionFails_stillServesWithoutSharer() async {
        let (sut, posts, links) = makeLoader()
        posts.getPostResult = .success(makeAPIPost())
        links.resolveResult = .failure(APIError.serverError(500, nil))

        let state = await sut.load(VisitorContentRequest(postId: "p1", kind: .post, via: "abc123"))

        guard case let .served(_, sharer) = state else { return XCTFail("le contenu reste servi, état : \(state)") }
        XCTAssertNil(sharer)
        XCTAssertEqual(links.resolveCallCount, 1)
    }

    func test_load_postNotFound_isRefused() async {
        let (sut, posts, _) = makeLoader()
        posts.getPostResult = .failure(APIError.serverError(404, "POST_NOT_FOUND"))

        let state = await sut.load(VisitorContentRequest(postId: "p1", kind: .post, via: nil))

        guard case .refused = state else { return XCTFail("un 404 est un refus, état : \(state)") }
    }

    func test_load_postForbidden_isRefused() async {
        let (sut, posts, _) = makeLoader()
        posts.getPostResult = .failure(APIError.serverError(403, nil))

        let state = await sut.load(VisitorContentRequest(postId: "p1", kind: .post, via: "abc123"))

        guard case .refused = state else { return XCTFail("un 403 est un refus, état : \(state)") }
    }

    func test_load_networkFailure_isRetryableFailure() async {
        let (sut, posts, _) = makeLoader()
        posts.getPostResult = .failure(URLError(.notConnectedToInternet))

        let state = await sut.load(VisitorContentRequest(postId: "p1", kind: .post, via: nil))

        guard case .failed = state else { return XCTFail("une coupure se réessaie, état : \(state)") }
    }

    func test_load_serverError_isRetryableFailure() async {
        let (sut, posts, _) = makeLoader()
        posts.getPostResult = .failure(APIError.serverError(503, nil))

        let state = await sut.load(VisitorContentRequest(postId: "p1", kind: .post, via: nil))

        guard case .failed = state else { return XCTFail("une panne serveur se réessaie, état : \(state)") }
    }

    // MARK: - 3. Le routage invité

    func test_present_signedOutContentLink_presentsVisitorAndKeepsPendingLink() {
        let router = makeRouter()
        router.pendingDeepLink = .reel(postId: "r1")
        let sut = VisitorContentPresenter(router: router, isAuthenticated: { false })

        XCTAssertTrue(sut.present(router.pendingDeepLink))

        XCTAssertEqual(sut.request, VisitorContentRequest(postId: "r1", kind: .reel, via: nil))
        XCTAssertEqual(router.pendingDeepLink, .reel(postId: "r1"), "le lien attend toujours la connexion")
    }

    func test_present_signedOutTrackedLink_carriesItsVia() async {
        let router = makeRouter()
        let links = StubTrackedLinkResolver()
        links.resolveResult = .success(ResolvedTrackedLink(kind: "tracking", targetType: "POST", targetId: "p1"))
        await awaitPendingLink(of: router) { router.resolveTrackedLink("abc123", resolver: links) }
        let sut = VisitorContentPresenter(router: router, isAuthenticated: { false })

        XCTAssertTrue(sut.present(router.pendingDeepLink))

        XCTAssertEqual(sut.request, VisitorContentRequest(postId: "p1", kind: .post, via: "abc123"))
        XCTAssertEqual(router.pendingDeepLink, .postDetail(postId: "p1"))
    }

    func test_present_signedIn_presentsNothing() {
        let router = makeRouter()
        router.pendingDeepLink = .postDetail(postId: "p1")
        let sut = VisitorContentPresenter(router: router, isAuthenticated: { true })

        XCTAssertFalse(sut.present(router.pendingDeepLink))

        XCTAssertNil(sut.request)
        XCTAssertEqual(router.pendingDeepLink, .postDetail(postId: "p1"))
    }

    func test_present_nonContentLink_presentsNothing() {
        let sut = VisitorContentPresenter(router: makeRouter(), isAuthenticated: { false })

        XCTAssertFalse(sut.present(.storyDetail(postId: "s1")))
        XCTAssertFalse(sut.present(.userProfile(username: "ada")))
        XCTAssertFalse(sut.present(nil))
        XCTAssertNil(sut.request)
    }

    func test_requestAccount_signUp_closesThenOpensSignUpBehind() {
        let router = makeRouter()
        router.pendingDeepLink = .reel(postId: "r1")
        let sut = VisitorContentPresenter(router: router, isAuthenticated: { false })
        sut.present(router.pendingDeepLink)

        sut.requestAccount(.signUp)

        XCTAssertNil(sut.request)
        XCTAssertNil(router.requestedAccountEntry, "rien ne s'ouvre sous l'écran visiteur")
        sut.didDismiss()
        XCTAssertEqual(router.requestedAccountEntry, .signUp)
        XCTAssertEqual(router.pendingDeepLink, .reel(postId: "r1"))
    }

    func test_didDismiss_closedWithoutChoice_opensNothing() {
        let router = makeRouter()
        let sut = VisitorContentPresenter(router: router, isAuthenticated: { false })
        sut.present(.postDetail(postId: "p1"))

        sut.dismiss()
        sut.didDismiss()

        XCTAssertNil(sut.request)
        XCTAssertNil(router.requestedAccountEntry)
    }

    // MARK: - Les mots de la carte

    func test_sharerName_withDisplayName_usesIt() {
        XCTAssertEqual(VisitorInvitationCopy.sharerName(ada()), "Ada Lovelace")
    }

    func test_sharerName_withoutDisplayName_usesAtUsername() {
        XCTAssertEqual(VisitorInvitationCopy.sharerName(TrackedLinkSharer(displayName: "  ", username: "ada")), "@ada")
        XCTAssertEqual(VisitorInvitationCopy.sharerName(TrackedLinkSharer(username: "ada")), "@ada")
    }

    func test_title_withSharer_namesTheSharer() {
        XCTAssertTrue(VisitorInvitationCopy.title(kind: .reel, sharer: ada()).contains("Ada Lovelace"))
        XCTAssertTrue(VisitorInvitationCopy.title(kind: .post, sharer: TrackedLinkSharer(username: "ada")).contains("@ada"))
    }

    func test_title_withoutSharer_invitesWithoutName() {
        XCTAssertFalse(VisitorInvitationCopy.title(kind: .post, sharer: nil).contains("%@"))
        XCTAssertFalse(VisitorInvitationCopy.title(kind: .post, sharer: nil).isEmpty)
    }
}
