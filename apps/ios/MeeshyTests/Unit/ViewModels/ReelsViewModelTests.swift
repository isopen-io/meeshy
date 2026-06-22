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

    // MARK: - Affinity thread wiring (getReels / seedReelId)

    func test_coldStart_fresh_pagesReelsThreadWithoutSeed() async {
        let (sut, service, _) = makeSUT(cachedReels: [])
        service.getReelsResult = .success(Self.makePaginated(reelIds: ["pourtoi-1", "pourtoi-2"]))

        sut.seed(posts: [], startId: nil)
        await sut.awaitColdStart()

        // Fresh launch (no entry reel) pages the seedless « Pour toi » thread via getReels.
        XCTAssertEqual(service.getReelsCallCount, 1)
        XCTAssertNil(service.lastGetReelsSeedId)
        XCTAssertEqual(service.getFeedCallCount, 0)
        XCTAssertEqual(sut.reels.map(\.id), ["pourtoi-1", "pourtoi-2"])
    }

    func test_loadMore_afterFeedSeed_pagesAffinityThreadSeededByEntryReel() async {
        let (sut, service, _) = makeSUT()
        service.getReelsResult = .success(Self.makePaginated(reelIds: ["affinity-1"]))

        sut.seed(posts: [Self.makeReel(id: "r1"), Self.makeReel(id: "r2")], startId: "r2")
        // Scrolling near the end pulls the affinity discovery thread, seeded by the
        // reel the viewer opened on, and appends it (deduped) after the feed reels.
        await sut.loadMoreIfNeeded(currentReel: Self.makeReel(id: "r2"))

        XCTAssertEqual(service.getReelsCallCount, 1)
        XCTAssertEqual(service.lastGetReelsSeedId, "r2")
        XCTAssertEqual(sut.reels.map(\.id), ["r1", "r2", "affinity-1"])
    }

    // MARK: - Share (deduplicated tracking-link path — aligned with the feed)

    func test_shareLink_usesDeduplicatedTrackingLinkPath_andReturnsShortUrl() async {
        let (sut, service, _) = makeSUT()

        let shortUrl = await sut.shareLink(for: Self.makeReel(id: "r1"))

        // The reel share MUST hit the deduplicated `generateLink: true` path so
        // re-taps reuse the existing link instead of bumping shareCount each tap
        // (the over-count bug). It also returns the short URL so the caller can
        // present the system share sheet — same contract as the feed.
        XCTAssertEqual(service.shareCallCount, 1)
        XCTAssertEqual(service.lastSharePostId, "r1")
        XCTAssertEqual(service.lastShareGenerateLink, true)
        XCTAssertEqual(shortUrl, "https://meeshy.me/l/mock123")
    }

    func test_shareLink_whenServiceFails_returnsNil() async {
        let (sut, service, _) = makeSUT()
        service.shareResult = .failure(NSError(domain: "test", code: 1))

        let shortUrl = await sut.shareLink(for: Self.makeReel(id: "r1"))

        XCTAssertNil(shortUrl)
    }
}

// MARK: - Reel Media Layout (pure classification of a reel's media surfaces)

@MainActor
final class ReelMediaLayoutTests: XCTestCase {

    private func img(_ id: String) -> FeedMedia { FeedMedia(id: id, type: .image, url: "https://x/\(id).jpg") }
    private func aud(_ id: String) -> FeedMedia { FeedMedia(id: id, type: .audio, url: "https://x/\(id).m4a") }
    private func vid(_ id: String) -> FeedMedia { FeedMedia(id: id, type: .video, url: "https://x/\(id).mp4") }
    private func doc(_ id: String) -> FeedMedia { FeedMedia(id: id, type: .document, fileName: "\(id).pdf") }

    func test_resolve_noMedia_isEmpty() {
        XCTAssertEqual(ReelMediaLayout.resolve(media: []), .empty)
    }

    func test_resolve_onlyDocuments_isEmpty() {
        // Documents and locations are not playable/visual reel surfaces.
        XCTAssertEqual(ReelMediaLayout.resolve(media: [doc("d1")]), .empty)
    }

    func test_resolve_singleImage_isImages() {
        XCTAssertEqual(ReelMediaLayout.resolve(media: [img("i1")]), .images([img("i1")]))
    }

    func test_resolve_multipleImages_isImages() {
        let media = [img("i1"), img("i2"), img("i3")]
        XCTAssertEqual(ReelMediaLayout.resolve(media: media), .images(media))
    }

    func test_resolve_singleAudio_isAudioOnly() {
        XCTAssertEqual(ReelMediaLayout.resolve(media: [aud("a1")]), .audioOnly([aud("a1")]))
    }

    func test_resolve_multipleAudios_isAudioOnly() {
        let media = [aud("a1"), aud("a2")]
        XCTAssertEqual(ReelMediaLayout.resolve(media: media), .audioOnly(media))
    }

    func test_resolve_imagesPlusSingleAudio_isImagesWithAudio() {
        let layout = ReelMediaLayout.resolve(media: [img("i1"), img("i2"), aud("a1")])
        XCTAssertEqual(layout, .imagesWithAudio(images: [img("i1"), img("i2")], audios: [aud("a1")]))
    }

    func test_resolve_imagesPlusMultipleAudios_isImagesWithAudio() {
        let layout = ReelMediaLayout.resolve(media: [img("i1"), aud("a1"), aud("a2")])
        XCTAssertEqual(layout, .imagesWithAudio(images: [img("i1")], audios: [aud("a1"), aud("a2")]))
    }

    func test_resolve_videoWins_overImagesAndAudio() {
        // Video takes priority over every other media kind (single-video reel).
        let layout = ReelMediaLayout.resolve(media: [img("i1"), aud("a1"), vid("v1")])
        XCTAssertEqual(layout, .video(vid("v1")))
    }

    func test_resolve_videoAlone_isVideo() {
        XCTAssertEqual(ReelMediaLayout.resolve(media: [vid("v1")]), .video(vid("v1")))
    }

    func test_resolve_preservesOrder_ofImagesAndAudios() {
        let layout = ReelMediaLayout.resolve(media: [img("i2"), aud("a2"), img("i1"), aud("a1")])
        XCTAssertEqual(layout, .imagesWithAudio(images: [img("i2"), img("i1")], audios: [aud("a2"), aud("a1")]))
    }
}
