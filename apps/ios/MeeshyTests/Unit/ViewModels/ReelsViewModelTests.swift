import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ReelsViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        cachedReels: [FeedPost] = []
    ) -> (sut: ReelsViewModel, service: MockPostService, cache: MockReelFeedCache) {
        let service = MockPostService()
        let cache = MockReelFeedCache()
        cache.cachedFeedResult = cachedReels
        let sut = ReelsViewModel(service: service, cache: cache)
        return (sut, service, cache)
    }

    private static func makeReel(id: String, content: String = "reel") -> FeedPost {
        FeedPost(id: id, author: "alice", authorId: "a1", type: "REEL", content: content)
    }

    private static func makePost(id: String, content: String = "post") -> FeedPost {
        FeedPost(id: id, author: "alice", authorId: "a1", type: "POST", content: content)
    }

    private static func makePaginated(
        reelIds: [String],
        hasMore: Bool = false,
        nextCursor: String? = nil
    ) -> PaginatedAPIResponse<[APIPost]> {
        let items = reelIds.map { id in
            """
            {"id":"\(id)","type":"REEL","content":"reel","createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"a1","username":"alice"}}
            """
        }
        let cursorJSON = nextCursor.map { "{\"hasMore\":\(hasMore),\"nextCursor\":\"\($0)\"}" }
            ?? "{\"hasMore\":\(hasMore),\"nextCursor\":null}"
        return JSONStub.decode("""
        {"success":true,"data":[\(items.joined(separator: ","))],"pagination":\(cursorJSON),"error":null}
        """)
    }

    // MARK: - Seed from feed context (online or offline — no network needed)

    func test_seed_withFeedPosts_keepsOnlyReelsAndSkipsColdStart() {
        let (sut, service, cache) = makeSUT()

        sut.seed(
            posts: [Self.makePost(id: "p1"), Self.makeReel(id: "r1"), Self.makeReel(id: "r2")],
            startId: "r2"
        )

        XCTAssertEqual(sut.reels.map(\.id), ["r1", "r2"])
        XCTAssertEqual(sut.currentId, "r2")
        XCTAssertTrue(sut.hasLoadedOnce)
        // Seeded from on-screen feed: no cache read, no network fetch.
        XCTAssertEqual(cache.cachedFeedCallCount, 0)
        XCTAssertEqual(service.getFeedCallCount, 0)
    }

    // MARK: - Cold start (long-press) cache-first + offline

    func test_coldStart_seedsFromCacheBeforeNetwork() async {
        let (sut, service, cache) = makeSUT(cachedReels: [Self.makeReel(id: "cached-1")])
        service.getFeedResult = .success(Self.makePaginated(reelIds: ["fresh-1", "fresh-2"]))

        sut.seed(posts: [], startId: nil)
        await sut.awaitColdStart()

        XCTAssertEqual(cache.lastCachedFeedKey, "main-feed")
        // Network revalidation replaces the cache seed with the fresh page.
        XCTAssertEqual(sut.reels.map(\.id), ["fresh-1", "fresh-2"])
        XCTAssertEqual(sut.currentId, "fresh-1")
    }

    func test_coldStart_offline_keepsCachedReels() async {
        let (sut, service, _) = makeSUT(cachedReels: [Self.makeReel(id: "cached-1"), Self.makeReel(id: "cached-2")])
        service.getFeedResult = .failure(APIError.networkError(URLError(.notConnectedToInternet)))

        sut.seed(posts: [], startId: nil)
        await sut.awaitColdStart()

        // Network failed — the cached reels remain instead of an empty screen.
        XCTAssertEqual(sut.reels.map(\.id), ["cached-1", "cached-2"])
        XCTAssertEqual(sut.currentId, "cached-1")
        XCTAssertTrue(sut.hasLoadedOnce)
    }

    func test_coldStart_offline_emptyCache_yieldsEmptyState() async {
        let (sut, service, _) = makeSUT(cachedReels: [])
        service.getFeedResult = .failure(APIError.networkError(URLError(.notConnectedToInternet)))

        sut.seed(posts: [], startId: nil)
        await sut.awaitColdStart()

        XCTAssertTrue(sut.reels.isEmpty)
        XCTAssertNil(sut.currentId)
        // hasLoadedOnce flips so the view shows the empty state, not a spinner.
        XCTAssertTrue(sut.hasLoadedOnce)
    }

    func test_coldStart_droppedCachedReel_resetsCurrentIdToFreshHead() async {
        let (sut, service, _) = makeSUT(cachedReels: [Self.makeReel(id: "cached-only")])
        service.getFeedResult = .success(Self.makePaginated(reelIds: ["fresh-1"]))

        sut.seed(posts: [], startId: nil)
        await sut.awaitColdStart()

        // The fresh feed no longer contains the cache-seeded reel, so currentId
        // must not point at a reel absent from the list.
        XCTAssertEqual(sut.reels.map(\.id), ["fresh-1"])
        XCTAssertEqual(sut.currentId, "fresh-1")
    }
}
