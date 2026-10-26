import XCTest
@testable import Meeshy
import MeeshySDK

/// One comment-thread model for posts, reels and stories (#13133): the reply
/// loads are the same, and the entity says how a thread lives — a story's is
/// refetched at every expand, kept open on failure and never persisted; a
/// post's and a reel's load once, persist, and fold on failure.
@MainActor
final class CommentThreadViewModelTests: XCTestCase {

    private final class Saved {
        var keys: [String] = []
    }

    private func makeSUT(_ entity: CommentThreadEntity) -> (CommentThreadViewModel, MockPostService, Saved) {
        let mock = MockPostService()
        let saved = Saved()
        let sut = CommentThreadViewModel(
            entity: entity, postService: mock, preferredLanguages: { ["fr"] },
            persistReplies: { key, _ in saved.keys.append(key) })
        return (sut, mock, saved)
    }

    private static func reply(_ id: String, parentId: String = "c1") -> String {
        """
        {"id":"\(id)","content":"r-\(id)","parentId":"\(parentId)","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """
    }

    private static func page(_ ids: [String], hasMore: Bool = false, cursor: String? = nil)
        -> Result<PaginatedAPIResponse<[APIPostComment]>, Error> {
        let pagination = cursor.map { "{\"nextCursor\":\"\($0)\",\"hasMore\":\(hasMore),\"limit\":20}" } ?? "null"
        let data = ids.map { reply($0) }.joined(separator: ",")
        return .success(JSONStub.decode("""
        {"success":true,"data":[\(data)],"pagination":\(pagination),"error":null}
        """))
    }

    private struct Offline: Error {}

    // MARK: - Expanding a thread

    func test_toggleThread_onAPost_loadsOnce_persists_andSeedsTheLoadedReplies() async {
        let (sut, mock, saved) = makeSUT(.post("p1"))
        mock.getCommentRepliesResultsQueue = [Self.page(["r1"], hasMore: true, cursor: "k1")]
        var seeded: [String] = []
        sut.onRepliesLoaded = { seeded += $0.map(\.id) }

        await sut.toggleThread("c1")
        await sut.toggleThread("c1")
        await sut.toggleThread("c1")

        XCTAssertEqual(mock.getCommentRepliesCallCount, 1, "a loaded post thread is kept")
        XCTAssertEqual(mock.lastGetCommentRepliesPostId, "p1")
        XCTAssertEqual(sut.repliesFor("c1").map(\.id), ["r1"])
        XCTAssertEqual(sut.repliesHasMore["c1"], true)
        XCTAssertEqual(sut.repliesNextCursor["c1"], "k1")
        XCTAssertEqual(saved.keys, ["replies-c1"])
        XCTAssertEqual(seeded, ["r1"])
        XCTAssertTrue(sut.expandedThreads.contains("c1"))
    }

    func test_toggleThread_onAStory_refetchesAtEveryExpand_andPersistsNothing() async {
        let (sut, mock, saved) = makeSUT(.story("s1"))
        mock.getCommentRepliesResultsQueue = [Self.page(["r1"]), Self.page(["r1", "r2"])]

        await sut.toggleThread("c1")
        await sut.toggleThread("c1")
        await sut.toggleThread("c1")

        XCTAssertEqual(mock.getCommentRepliesCallCount, 2)
        XCTAssertEqual(sut.repliesFor("c1").map(\.id), ["r1", "r2"], "the refetch replaces the first page")
        XCTAssertTrue(saved.keys.isEmpty)
    }

    func test_aFailedLoad_foldsAPostThread_butKeepsAStoryThreadOpen() async {
        let (post, postMock, _) = makeSUT(.reel("p1"))
        postMock.getCommentRepliesResult = .failure(Offline())
        let (story, storyMock, _) = makeSUT(.story("s1"))
        storyMock.getCommentRepliesResult = .failure(Offline())

        await post.toggleThread("c1")
        await story.toggleThread("c1")

        XCTAssertFalse(post.expandedThreads.contains("c1"))
        XCTAssertTrue(story.expandedThreads.contains("c1"))
    }

    // MARK: - Next pages

    func test_loadMoreReplies_appendsFromTheCursor_withoutDuplicates() async {
        let (sut, mock, _) = makeSUT(.post("p1"))
        mock.getCommentRepliesResultsQueue = [Self.page(["r1", "r2"], hasMore: true, cursor: "k1"),
                                              Self.page(["r2", "r3"])]
        await sut.loadReplies(commentId: "c1")

        await sut.loadMoreReplies(commentId: "c1")

        XCTAssertEqual(sut.repliesFor("c1").map(\.id), ["r1", "r2", "r3"])
        XCTAssertEqual(mock.lastGetCommentRepliesCursor, "k1")
        XCTAssertEqual(sut.repliesHasMore["c1"], false)
    }

    func test_aFailedNextPage_stopsThePagination() async {
        let (sut, mock, _) = makeSUT(.story("s1"))
        mock.getCommentRepliesResult = .failure(Offline())

        await sut.loadMoreReplies(commentId: "c1")
        await sut.loadMoreReplies(commentId: "c1")

        XCTAssertEqual(sut.repliesHasMore["c1"], false)
        XCTAssertEqual(mock.getCommentRepliesCallCount, 1, "a known end is not asked again")
    }

    func test_loadRepliesUntilPresent_huntsThePagesUntilTheReplyIsThere() async {
        let (sut, mock, _) = makeSUT(.post("p1"))
        mock.getCommentRepliesResultsQueue = [Self.page(["r1"], hasMore: true, cursor: "k1"),
                                              Self.page(["r2"], hasMore: true, cursor: "k2"),
                                              Self.page(["target"], hasMore: true, cursor: "k3")]

        let found = await sut.loadRepliesUntilPresent("target", in: "c1")

        XCTAssertTrue(found)
        XCTAssertEqual(mock.getCommentRepliesCallCount, 3)
    }

    // MARK: - Another entity

    func test_reset_startsAnEmptyThreadOnTheNewEntity() async {
        let (sut, mock, _) = makeSUT(.story("s1"))
        mock.getCommentRepliesResultsQueue = [Self.page(["r1"]), Self.page(["x"])]
        sut.roots = [FeedComment(id: "c1", author: "bob", content: "hi")]
        await sut.toggleThread("c1")

        sut.reset(to: .story("s2"))
        await sut.loadReplies(commentId: "c9")

        XCTAssertTrue(sut.roots.isEmpty)
        XCTAssertNil(sut.replies["c1"])
        XCTAssertTrue(sut.expandedThreads.isEmpty)
        XCTAssertEqual(mock.lastGetCommentRepliesPostId, "s2")
    }
}
