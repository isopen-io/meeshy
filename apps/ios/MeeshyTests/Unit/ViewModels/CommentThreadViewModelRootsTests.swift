import XCTest
@testable import Meeshy
import MeeshySDK

/// The root comments of a post, a reel or a story load through the one thread
/// model (#13133): cache first, then the first page, then the next pages from
/// the cursor, and the hunt of a notified root. A story asks for pages of 50,
/// a post or a reel for pages of 20.
@MainActor
final class CommentThreadViewModelRootsTests: XCTestCase {

    private final class Store {
        var cached: [String: CacheResult<[FeedComment]>] = [:]
        var saved: [String: [FeedComment]] = [:]
        var onLoad: () -> Void = {}
    }

    private func makeSUT(
        _ entity: CommentThreadEntity, embedded: [FeedComment] = []
    ) -> (CommentThreadViewModel, MockPostService, Store) {
        let mock = MockPostService()
        let store = Store()
        let sut = CommentThreadViewModel(
            entity: entity, embedded: embedded, postService: mock, preferredLanguages: { ["fr"] },
            store: CommentThreadStore(
                load: { key in store.onLoad(); return store.cached[key] ?? .empty },
                save: { key, comments in store.saved[key] = comments }))
        return (sut, mock, store)
    }

    private static func comment(_ id: String, replies: Int = 0) -> FeedComment {
        FeedComment(id: id, author: "bob", content: "c-\(id)", replies: replies)
    }

    private static func page(_ ids: [String], hasMore: Bool = false, cursor: String? = nil)
        -> Result<PaginatedAPIResponse<[APIPostComment]>, Error> {
        let pagination = cursor.map { "{\"nextCursor\":\"\($0)\",\"hasMore\":\(hasMore),\"limit\":20}" } ?? "null"
        let data = ids.map {
            "{\"id\":\"\($0)\",\"content\":\"c-\($0)\",\"createdAt\":\"2026-01-01T00:00:00.000Z\",\"author\":{\"id\":\"a1\",\"username\":\"alice\"}}"
        }.joined(separator: ",")
        return .success(JSONStub.decode("""
        {"success":true,"data":[\(data)],"pagination":\(pagination),"error":null}
        """))
    }

    private struct Offline: Error {}

    // MARK: - Cache first

    func test_loadRoots_freshCache_servesItWithoutTheNetwork_andSeedsTheLikes() async {
        let (sut, mock, store) = makeSUT(.post("p1"))
        store.cached["post-p1"] = .fresh([Self.comment("c1"), Self.comment("c2")], age: 1)
        var seeded: [String] = []
        sut.onRootsLoaded = { seeded += $0.map(\.id) }

        let outcome = await sut.loadRoots()

        XCTAssertEqual(outcome, .cache)
        XCTAssertEqual(sut.roots.map(\.id), ["c1", "c2"])
        XCTAssertEqual(mock.getCommentsCallCount, 0)
        XCTAssertNil(sut.rootsHasMore, "nothing was asked: the next page is unknown, never refused")
        XCTAssertEqual(seeded, ["c1", "c2"])
    }

    func test_loadRoots_freshCache_withAServerTotal_knowsWhetherMoreExist() async {
        let (sut, _, store) = makeSUT(.post("p1"))
        store.cached["post-p1"] = .fresh([Self.comment("c1", replies: 2)], age: 1)

        await sut.loadRoots(serverTotal: 4)

        XCTAssertEqual(sut.knownTotal, 3)
        XCTAssertEqual(sut.rootsHasMore, true)
    }

    func test_loadRoots_staleCache_servesIt_thenMergesTheFirstPage_keepingLocalRows() async {
        let (sut, mock, store) = makeSUT(.post("p1"))
        store.cached["post-p1"] = .stale([Self.comment("c1")], age: 99)
        mock.getCommentsResult = Self.page(["c1", "c2"], hasMore: true, cursor: "k1")
        sut.roots = [Self.comment("cmid_local")]

        let outcome = await sut.loadRoots()

        XCTAssertEqual(outcome, .network)
        XCTAssertEqual(sut.roots.map(\.id), ["cmid_local", "c1", "c2"])
        XCTAssertNil(mock.lastGetCommentsCursor)
        XCTAssertEqual(sut.rootsHasMore, true)
        XCTAssertEqual(store.saved["post-p1"]?.map(\.id), ["c1", "c2"], "an optimistic row is never persisted")
        XCTAssertFalse(sut.isLoadingRoots)
    }

    func test_loadRoots_aStaleRowTheFirstPageNoLongerServes_doesNotSurviveIt() async {
        let (sut, mock, store) = makeSUT(.story("s1"))
        store.cached["post-s1"] = .stale([Self.comment("c1"), Self.comment("gone")], age: 99)
        mock.getCommentsResult = Self.page(["c1", "c2"])

        await sut.loadRoots()

        XCTAssertEqual(sut.roots.map(\.id), ["c1", "c2"])
        XCTAssertEqual(store.saved["post-s1"]?.map(\.id), ["c1", "c2"])
    }

    func test_loadRoots_pageSize_isFiftyForAStory_andTwentyForAPostOrAReel() async {
        for (entity, size) in [(CommentThreadEntity.story("s1"), 50), (.post("p1"), 20), (.reel("r1"), 20)] {
            let (sut, mock, _) = makeSUT(entity)
            mock.getCommentsResult = Self.page(["c1"])
            await sut.loadRoots()
            XCTAssertEqual(mock.lastGetCommentsLimit, size)
            XCTAssertEqual(mock.lastGetCommentsPostId, entity.id)
        }
    }

    func test_loadRoots_networkFailure_keepsWhatIsShown() async {
        let (sut, mock, store) = makeSUT(.post("p1"), embedded: [Self.comment("e1")])
        store.cached["post-p1"] = .stale([Self.comment("c1")], age: 99)
        mock.getCommentsResult = .failure(Offline())

        let outcome = await sut.loadRoots()

        XCTAssertEqual(outcome, .failed)
        XCTAssertEqual(sut.roots.map(\.id), ["e1", "c1"])
    }

    func test_loadRoots_droppedWhenTheSurfaceMovedToAnotherEntity() async {
        let (sut, mock, store) = makeSUT(.story("s1"))
        mock.getCommentsResult = Self.page(["old"])
        store.onLoad = { sut.reset(to: .story("s2")) }

        let outcome = await sut.loadRoots()

        XCTAssertEqual(outcome, .skipped)
        XCTAssertTrue(sut.roots.isEmpty)
        XCTAssertFalse(sut.isLoadingRoots)
    }

    // MARK: - Next pages

    func test_loadMoreRoots_appendsFromTheCursor_withoutDuplicates() async {
        let (sut, mock, _) = makeSUT(.post("p1"))
        mock.getCommentsResultsQueue = [Self.page(["c1", "c2"], hasMore: true, cursor: "k1"), Self.page(["c2", "c3"])]
        await sut.loadRoots()

        await sut.loadMoreRoots()

        XCTAssertEqual(sut.roots.map(\.id), ["c1", "c2", "c3"])
        XCTAssertEqual(mock.lastGetCommentsCursor, "k1")
        XCTAssertEqual(sut.rootsHasMore, false)
    }

    func test_loadMoreRoots_afterAFreshCache_recoversTheFirstPage() async {
        let (sut, mock, store) = makeSUT(.post("p1"))
        store.cached["post-p1"] = .fresh([Self.comment("c1")], age: 1)
        mock.getCommentsResult = Self.page(["c1", "c2"], hasMore: true, cursor: "k1")
        await sut.loadRoots()

        await sut.loadMoreRoots()

        XCTAssertNil(mock.lastGetCommentsCursor)
        XCTAssertEqual(sut.roots.map(\.id), ["c1", "c2"])
        XCTAssertEqual(sut.rootsNextCursor, "k1")
    }

    func test_aFailedNextPage_stopsThePagination() async {
        let (sut, mock, _) = makeSUT(.story("s1"))
        mock.getCommentsResult = .failure(Offline())

        await sut.loadMoreRoots()
        await sut.loadMoreRoots()

        XCTAssertEqual(sut.rootsHasMore, false)
        XCTAssertEqual(mock.getCommentsCallCount, 1)
    }

    func test_loadRootsUntilPresent_huntsThePagesUntilTheRootIsThere() async {
        let (sut, mock, _) = makeSUT(.post("p1"))
        mock.getCommentsResultsQueue = [Self.page(["a"], hasMore: true, cursor: "k1"),
                                        Self.page(["b"], hasMore: true, cursor: "k2"),
                                        Self.page(["target"], hasMore: true, cursor: "k3")]

        let found = await sut.loadRootsUntilPresent(["target"])

        XCTAssertTrue(found)
        XCTAssertEqual(mock.getCommentsCallCount, 3)
    }

    func test_loadRootsUntilPresent_anExhaustedListStops() async {
        let (sut, mock, _) = makeSUT(.post("p1"))
        mock.getCommentsResult = Self.page(["other"])

        let found = await sut.loadRootsUntilPresent(["missing"])

        XCTAssertFalse(found)
        XCTAssertEqual(mock.getCommentsCallCount, 1)
    }

    // MARK: - Reply previews

    func test_preloadReplyPreviews_onAPost_servesCachedThreads_andFetchesTheOthers() async {
        let (sut, mock, store) = makeSUT(.post("p1"))
        sut.roots = [Self.comment("c1", replies: 1), Self.comment("c2", replies: 1), Self.comment("c3")]
        store.cached["replies-c1"] = .stale([FeedComment(id: "r1", author: "a", content: "r", parentId: "c1")], age: 9)
        mock.getCommentRepliesResult = Self.page(["r2"])

        await sut.preloadReplyPreviews()

        XCTAssertEqual(sut.repliesFor("c1").map(\.id), ["r1"])
        XCTAssertEqual(sut.repliesFor("c2").map(\.id), ["r2"])
        XCTAssertEqual(mock.getCommentRepliesCallCount, 1, "a thread without replies is not asked")
    }

    func test_preloadReplyPreviews_onAStory_refetchesEveryThread() async {
        let (sut, mock, store) = makeSUT(.story("s1"))
        sut.roots = [Self.comment("c1", replies: 1)]
        store.cached["replies-c1"] = .fresh([], age: 1)
        mock.getCommentRepliesResult = Self.page(["r1"])

        await sut.preloadReplyPreviews()

        XCTAssertEqual(sut.repliesFor("c1").map(\.id), ["r1"])
    }

    // MARK: - The sheet's live rows

    func test_liveRoots_isNilUntilTheRootsAreTouched_andNilRestoresTheEmbeddedRows() {
        let (sut, _, _) = makeSUT(.post("p1"), embedded: [Self.comment("e1")])
        XCTAssertNil(sut.liveRoots)
        XCTAssertEqual(sut.roots.map(\.id), ["e1"])

        sut.liveRoots = [Self.comment("x")]
        XCTAssertEqual(sut.liveRoots?.map(\.id), ["x"])

        sut.liveRoots = nil
        XCTAssertNil(sut.liveRoots)
        XCTAssertEqual(sut.topLevelRoots.map(\.id), ["e1"])
    }
}
