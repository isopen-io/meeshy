import XCTest
import MeeshySDK
@testable import Meeshy

/// #19332 — la carte d'un lien de contenu se sert cache d'abord : mémoire par
/// lecteur et par post (fraîche une minute, périmée un jour), jeton suivi
/// résolu une fois, amorce depuis un post que l'app tient déjà ; un 404 dit
/// « indisponible », une panne ne dit rien.
@MainActor
final class ContentCardStoreTests: XCTestCase {

    // MARK: - Doubles

    final class MockTrackedLinkResolver: TrackedLinkResolving, @unchecked Sendable {
        var resolveResult: Result<ResolvedTrackedLink, Error> = .success(ResolvedTrackedLink())
        private(set) var resolveCallCount = 0
        private(set) var lastResolvedToken: String?

        func resolve(token: String) async throws -> ResolvedTrackedLink {
            resolveCallCount += 1
            lastResolvedToken = token
            return try resolveResult.get()
        }

        func recordClick(token: String) async {}
    }

    final class TestClock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    @MainActor
    final class Viewer {
        var id: String? = "viewer-a"
    }

    private static let postId = "66f0c0ffee0000000000c0de"
    private static let notFound = MeeshyError.server(statusCode: 404, message: "Not found")
    private static let offline = MeeshyError.network(.noConnection)

    // MARK: - Fabriques

    private func makePost(type: String = "POST", content: String = "Salut", bookmarkCount: Int = 3) -> APIPost {
        JSONStub.decode("""
        {"id":"\(Self.postId)","type":"\(type)","content":"\(content)","originalLanguage":"es","createdAt":"2026-11-04T09:55:10.287Z",\
        "author":{"id":"a1","username":"amani","displayName":"Amani"},"bookmarkCount":\(bookmarkCount),\
        "translations":{"en":{"text":"Hello"}}}
        """)
    }

    private struct SUT {
        let store: ContentCardStore
        let posts: MockPostService
        let stories: MockStoryService
        let links: MockTrackedLinkResolver
        let clock: TestClock
        let viewer: Viewer
    }

    private func makeSUT(languages: [String] = []) -> SUT {
        let posts = MockPostService()
        let stories = MockStoryService()
        let links = MockTrackedLinkResolver()
        let clock = TestClock()
        let viewer = Viewer()
        let store = ContentCardStore(
            posts: posts, stories: stories, links: links,
            languages: MockLanguageProvider(preferredLanguages: languages),
            viewerId: { viewer.id }, now: { clock.now }
        )
        return SUT(store: store, posts: posts, stories: stories, links: links, clock: clock, viewer: viewer)
    }

    private var direct: ContentLinkTarget {
        .content(ContentPathTarget(postId: Self.postId, type: .post))
    }

    private func card(of resolution: ContentCardResolution) -> ContentCard? {
        guard case .card(let card) = resolution else { return nil }
        return card
    }

    private func cachedCard(_ result: CacheResult<ContentCardResolution>) -> (card: ContentCard, isFresh: Bool)? {
        switch result {
        case .fresh(.card(let card), _): return (card, true)
        case .stale(.card(let card), _): return (card, false)
        default: return nil
        }
    }

    // MARK: - Cache d'abord

    func test_cached_unknownContent_isEmpty_andAsksNothing() {
        let sut = makeSUT()

        guard case .empty = sut.store.cached(direct) else { return XCTFail("rien n'est connu") }
        XCTAssertEqual(sut.posts.getPostCallCount, 0)
    }

    func test_refresh_directLink_readsThePost_thenServesItFresh() async throws {
        let sut = makeSUT()
        sut.posts.getPostResult = .success(makePost())

        let resolution = await sut.store.refresh(direct)

        XCTAssertEqual(card(of: resolution)?.postId, Self.postId)
        XCTAssertEqual(sut.posts.lastGetPostId, Self.postId)
        let cached = try XCTUnwrap(cachedCard(sut.store.cached(direct)))
        XCTAssertTrue(cached.isFresh)
        XCTAssertEqual(cached.card.stats.bookmarks, 3)
    }

    func test_cached_afterAMinute_isStale_andAfterADay_isExpired() async throws {
        let sut = makeSUT()
        sut.posts.getPostResult = .success(makePost())
        _ = await sut.store.refresh(direct)

        sut.clock.now += ContentCardStore.freshInterval + 1
        let stale = try XCTUnwrap(cachedCard(sut.store.cached(direct)))
        XCTAssertFalse(stale.isFresh, "une carte périmée s'affiche, puis se relit en silence")

        sut.clock.now += ContentCardStore.staleInterval
        guard case .expired = sut.store.cached(direct) else { return XCTFail("au-delà d'un jour, la carte se relit avant de s'afficher") }
    }

    func test_refresh_servesTheTextInTheReadersLanguage() async {
        let sut = makeSUT(languages: ["de", "en"])
        sut.posts.getPostResult = .success(makePost(content: "Hola"))

        let resolution = await sut.store.refresh(direct)

        XCTAssertEqual(card(of: resolution)?.text, "Hello", "le Prisme du lecteur, au rang 2")
    }

    func test_cached_aPostTheStoriesAlreadyHold_seedsTheCardAsStale() throws {
        let sut = makeSUT()
        sut.stories.cachedPostResult = makePost(type: "STORY")

        let seeded = try XCTUnwrap(cachedCard(sut.store.cached(direct)))

        XCTAssertFalse(seeded.isFresh, "une amorce se relit")
        XCTAssertEqual(seeded.card.kind, .story)
        XCTAssertEqual(sut.stories.lastCachedPostId, Self.postId)
        XCTAssertEqual(sut.posts.getPostCallCount, 0)
    }

    // MARK: - Indisponible, panne

    func test_refresh_notFound_isUnavailable_andNeverServedStale() async {
        let sut = makeSUT()
        sut.posts.getPostResult = .failure(Self.notFound)
        let mood = ContentLinkTarget.content(ContentPathTarget(postId: Self.postId, type: .status))

        let resolution = await sut.store.refresh(mood)

        XCTAssertEqual(resolution, .unavailable(.status))
        guard case .fresh(.unavailable(.status), _) = sut.store.cached(mood) else { return XCTFail("le verdict se garde une minute") }
        sut.clock.now += ContentCardStore.freshInterval + 1
        guard case .expired = sut.store.cached(mood) else { return XCTFail("un indisponible ne se sert jamais périmé") }
    }

    func test_refresh_forbidden_isUnavailable() async {
        let sut = makeSUT()
        sut.posts.getPostResult = .failure(MeeshyError.forbidden(reason: nil, body: nil))

        let resolution = await sut.store.refresh(direct)

        XCTAssertEqual(resolution, .unavailable(.post))
    }

    func test_refresh_networkFailure_isFailed_andCachesNothing() async {
        let sut = makeSUT()
        sut.posts.getPostResult = .failure(Self.offline)

        let resolution = await sut.store.refresh(direct)

        XCTAssertEqual(resolution, .failed)
        guard case .empty = sut.store.cached(direct) else { return XCTFail("une panne n'apprend rien") }
    }

    // MARK: - Lien suivi

    func test_refresh_trackedContent_resolvesTheTokenOnce() async throws {
        let sut = makeSUT()
        sut.links.resolveResult = .success(ResolvedTrackedLink(kind: "tracking", targetType: "REEL", targetId: Self.postId))
        sut.posts.getPostResult = .success(makePost(type: "REEL"))
        let tracked = ContentLinkTarget.tracked(token: "Ab3xYz")

        let first = await sut.store.refresh(tracked)
        _ = await sut.store.refresh(tracked)

        XCTAssertEqual(card(of: first)?.kind, .reel)
        XCTAssertEqual(sut.links.resolveCallCount, 1, "un jeton ne change jamais de cible")
        XCTAssertEqual(sut.links.lastResolvedToken, "Ab3xYz")
        XCTAssertEqual(sut.posts.getPostCallCount, 2)
        XCTAssertTrue(try XCTUnwrap(cachedCard(sut.store.cached(tracked))).isFresh)
    }

    func test_refresh_trackedLinkToASite_isNotContent_andRemembered() async {
        let sut = makeSUT()
        sut.links.resolveResult = .success(ResolvedTrackedLink(kind: "tracking", targetType: "EXTERNAL",
                                                               originalUrl: "https://exemple.org/page"))
        let tracked = ContentLinkTarget.tracked(token: "Ab3xYz")

        let resolution = await sut.store.refresh(tracked)

        XCTAssertEqual(resolution, .notContent)
        XCTAssertEqual(sut.posts.getPostCallCount, 0)
        guard case .fresh(.notContent, _) = sut.store.cached(tracked) else { return XCTFail("le verdict d'un jeton se garde") }
    }

    func test_refresh_unknownToken_isNotContent() async {
        let sut = makeSUT()
        sut.links.resolveResult = .failure(Self.notFound)

        let resolution = await sut.store.refresh(.tracked(token: "Ab3xYz"))

        XCTAssertEqual(resolution, .notContent)
    }

    func test_refresh_trackedOffline_isFailed() async {
        let sut = makeSUT()
        sut.links.resolveResult = .failure(Self.offline)

        let resolution = await sut.store.refresh(.tracked(token: "Ab3xYz"))

        XCTAssertEqual(resolution, .failed)
    }

    // MARK: - Un lecteur ne lit pas la carte d'un autre

    func test_cached_anotherViewer_neverReadsTheFirstViewersCard() async {
        let sut = makeSUT()
        sut.posts.getPostResult = .success(makePost())
        _ = await sut.store.refresh(direct)

        sut.viewer.id = "viewer-b"

        guard case .empty = sut.store.cached(direct) else { return XCTFail("la carte d'un compte ne se sert jamais à un autre") }
    }
}
