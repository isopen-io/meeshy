import XCTest
import MeeshySDK
@testable import Meeshy

private let cardPostId = "66f0c0ffee0000000000c0de"

/// #19332 — la carte d'un lien de contenu suit ses quatre états (contrat § 3)
/// cache d'abord : une carte connue paraît sans squelette, même périmée ; un
/// 404 dit « indisponible » ; une panne sans rien en mémoire rend l'aperçu
/// d'avant, et ne retire jamais une carte déjà à l'écran.
@MainActor
final class ContentLinkCardViewModelTests: XCTestCase {

    // MARK: - Doubles

    @MainActor
    final class MockContentCardStore: ContentCardStoreProviding {
        var cachedResult: CacheResult<ContentCardResolution> = .empty
        var refreshResult: ContentCardResolution = .failed
        private(set) var cachedCallCount = 0
        private(set) var refreshCallCount = 0
        private(set) var lastRefreshedTarget: ContentLinkTarget?

        func cached(_ target: ContentLinkTarget) -> CacheResult<ContentCardResolution> {
            cachedCallCount += 1
            return cachedResult
        }

        func refresh(_ target: ContentLinkTarget) async -> ContentCardResolution {
            refreshCallCount += 1
            lastRefreshedTarget = target
            return refreshResult
        }
    }

    // MARK: - Fabriques

    private func makeCard(type: String = "REEL", bookmarked: Bool = false, id: String = cardPostId) -> ContentCard {
        let post: APIPost = JSONStub.decode("""
        {"id":"\(id)","type":"\(type)","content":"Le coucher de soleil","createdAt":"2026-11-04T09:55:10.287Z",\
        "author":{"id":"a1","username":"amani","displayName":"Amani Diallo"},\
        "viewCount":1234,"likeCount":5,"commentCount":0,"bookmarkCount":12,"isBookmarkedByMe":\(bookmarked)}
        """)
        return ContentCard(post: post, preferredLanguages: [])
    }

    private func makeSUT(
        target: ContentLinkTarget = .content(ContentPathTarget(postId: cardPostId, type: nil)),
        cached: CacheResult<ContentCardResolution> = .empty,
        refresh: ContentCardResolution = .failed,
        excludedPostId: String? = nil
    ) -> (ContentLinkCardViewModel, MockContentCardStore) {
        let store = MockContentCardStore()
        store.cachedResult = cached
        store.refreshResult = refresh
        let sut = ContentLinkCardViewModel(target: target, store: store, excludedPostId: excludedPostId)
        return (sut, store)
    }

    // MARK: - Cache d'abord

    func test_init_freshCard_rendersTheCardWithoutSkeleton_andSkipsTheNetwork() async {
        let card = makeCard()
        let (sut, store) = makeSUT(cached: .fresh(.card(card), age: 1))

        XCTAssertEqual(sut.phase, .card(card))
        await sut.load()
        XCTAssertEqual(store.refreshCallCount, 0)
    }

    func test_init_staleCard_rendersTheCardImmediately_thenRevalidatesSilently() async {
        let stale = makeCard(bookmarked: false)
        let fresh = makeCard(bookmarked: true)
        let (sut, store) = makeSUT(cached: .stale(.card(stale), age: 500), refresh: .card(fresh))

        XCTAssertEqual(sut.phase, .card(stale), "aucun squelette quand le cache a une carte, même périmée")
        await sut.load()
        XCTAssertEqual(store.refreshCallCount, 1)
        XCTAssertEqual(sut.phase, .card(fresh))
    }

    func test_init_emptyCache_startsWithTheSkeleton_thenShowsTheCard() async {
        let card = makeCard()
        let target = ContentLinkTarget.tracked(token: "Ab3xYz")
        let (sut, store) = makeSUT(target: target, refresh: .card(card))

        XCTAssertEqual(sut.phase, .loading)
        await sut.load()
        XCTAssertEqual(store.lastRefreshedTarget, target)
        XCTAssertEqual(sut.phase, .card(card))
    }

    // MARK: - Indisponible, pas un contenu, panne

    func test_load_notFound_isUnavailable() async {
        let (sut, _) = makeSUT(refresh: .unavailable(.story))

        await sut.load()

        XCTAssertEqual(sut.phase, .unavailable(.story))
        XCTAssertNil(sut.destinationURL(linkURL: "https://meeshy.me/s/\(cardPostId)", webOrigin: "https://meeshy.me"),
                     "une ligne indisponible n'ouvre rien")
    }

    func test_load_notAContent_fallsBackToTheExistingPreview() async {
        let (sut, _) = makeSUT(target: .tracked(token: "Ab3xYz"), refresh: .notContent)

        await sut.load()

        XCTAssertEqual(sut.phase, .fallback)
    }

    func test_load_networkFailureWithoutCache_fallsBackToTheExistingPreview() async {
        let (sut, _) = makeSUT(refresh: .failed)

        await sut.load()

        XCTAssertEqual(sut.phase, .fallback)
    }

    func test_load_networkFailureWithACachedCard_keepsTheCard() async {
        let card = makeCard()
        let (sut, _) = makeSUT(cached: .stale(.card(card), age: 500), refresh: .failed)

        await sut.load()

        XCTAssertEqual(sut.phase, .card(card))
    }

    func test_load_theCarryingPostItself_isNeverItsOwnCard() async {
        let (sut, _) = makeSUT(target: .tracked(token: "Ab3xYz"), refresh: .card(makeCard()),
                               excludedPostId: cardPostId.uppercased())

        await sut.load()

        XCTAssertEqual(sut.phase, .fallback)
    }

    // MARK: - Le toucher ouvre le contenu DANS l'app

    func test_destinationURL_directLink_opensTheCanonicalAddressOfTheServedType() {
        let (sut, _) = makeSUT(target: .content(ContentPathTarget(postId: cardPostId, type: nil)),
                               cached: .fresh(.card(makeCard(type: "REEL")), age: 1))

        let url = sut.destinationURL(linkURL: "https://meeshy.me/feeds/post/\(cardPostId)", webOrigin: "https://meeshy.me")

        XCTAssertEqual(url?.absoluteString, "https://meeshy.me/reel/\(cardPostId)",
                       "un réel cité par l'ancienne adresse s'ouvre dans le lecteur de réels")
    }

    func test_destinationURL_trackedLink_opensTheTrackedLinkItself() {
        let (sut, _) = makeSUT(target: .tracked(token: "Ab3xYz"), cached: .fresh(.card(makeCard()), age: 1))

        let url = sut.destinationURL(linkURL: " https://meeshy.me/l/Ab3xYz ", webOrigin: "https://meeshy.me")

        XCTAssertEqual(url?.absoluteString, "https://meeshy.me/l/Ab3xYz", "le clic se compte, la cible se relit")
    }

    func test_destinationURL_whileLoading_isNil() {
        let (sut, _) = makeSUT()

        XCTAssertNil(sut.destinationURL(linkURL: "https://meeshy.me/post/\(cardPostId)", webOrigin: "https://meeshy.me"))
    }

    // MARK: - VoiceOver : un seul élément, une phrase

    func test_accessibilityLabel_namesTheAuthorTheTextAndTheCounters() {
        let label = ContentLinkCardCopy.accessibilityLabel(for: makeCard())

        XCTAssertTrue(label.contains("Amani Diallo"))
        XCTAssertTrue(label.contains("Le coucher de soleil"))
        XCTAssertTrue(label.contains(ContentLinkCardCopy.views(1234)))
        XCTAssertTrue(label.contains(ContentLinkCardCopy.favorites(12)))
        XCTAssertFalse(label.contains(ContentLinkCardCopy.saved), "rien n'est dit d'un favori que le lecteur n'a pas posé")
    }

    func test_accessibilityLabel_bookmarkedByTheReader_saysItIsSaved() {
        let label = ContentLinkCardCopy.accessibilityLabel(for: makeCard(bookmarked: true))

        XCTAssertTrue(label.contains(ContentLinkCardCopy.saved))
    }

    /// Le catalogue annonce `%lld` pour un compteur et `%@` pour un nom : un
    /// spécificateur qui survit dirait au lecteur « %lld vues ».
    func test_copy_substitutesEveryArgument_whateverTheLanguage() {
        for produced in [ContentLinkCardCopy.views(3), ContentLinkCardCopy.favorites(1),
                         ContentLinkCardCopy.byAuthor(.status, author: "Amani")] {
            XCTAssertFalse(produced.contains("%"), "« \(produced) » garde un spécificateur brut")
        }
        XCTAssertTrue(ContentLinkCardCopy.byAuthor(.status, author: "Amani").contains("Amani"))
    }
}
