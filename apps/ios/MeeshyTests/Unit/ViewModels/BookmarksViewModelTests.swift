import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class BookmarksViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        postService: MockPostService = MockPostService()
    ) -> (sut: BookmarksViewModel, postService: MockPostService) {
        let sut = BookmarksViewModel(postService: postService)
        return (sut, postService)
    }

    private static func makePaginatedPosts(
        posts: [APIPost],
        hasMore: Bool = false,
        nextCursor: String? = nil
    ) -> PaginatedAPIResponse<[APIPost]> {
        let cursorJSON: String
        if let cursor = nextCursor {
            cursorJSON = """
            {"nextCursor":"\(cursor)","hasMore":\(hasMore),"limit":20}
            """
        } else {
            cursorJSON = "null"
        }
        let postsJSON = posts.map { p in
            """
            {"id":"\(p.id)","type":"POST","content":"\(p.content ?? "")","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"\(p.author.id)","username":"\(p.author.username ?? "user")"}}
            """
        }
        return JSONStub.decode("""
        {"success":true,"data":[\(postsJSON.joined(separator: ","))],"pagination":\(cursorJSON),"error":null}
        """)
    }

    private static func makeAPIPost(id: String = "post-1", content: String = "Hello") -> APIPost {
        JSONStub.decode("""
        {"id":"\(id)","type":"POST","content":"\(content)","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
    }

    // MARK: - loadBookmarks

    func test_loadBookmarks_success_populatesPosts() async {
        let (sut, mock) = makeSUT()
        let posts = [Self.makeAPIPost(id: "b1"), Self.makeAPIPost(id: "b2")]
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: posts))

        await sut.loadBookmarks()

        XCTAssertEqual(sut.posts.count, 2)
        XCTAssertEqual(sut.posts[0].id, "b1")
        XCTAssertEqual(sut.posts[1].id, "b2")
        XCTAssertEqual(mock.getBookmarksCallCount, 1)
    }

    func test_loadBookmarks_error_keepsEmptyPosts() async {
        let (sut, mock) = makeSUT()
        mock.getBookmarksResult = .failure(NSError(domain: "test", code: 500))

        await sut.loadBookmarks()

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertEqual(mock.getBookmarksCallCount, 1)
    }

    func test_loadBookmarks_setsIsLoadingDuringFetch() async {
        let (sut, mock) = makeSUT()
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: []))

        XCTAssertFalse(sut.isLoading)
        await sut.loadBookmarks()
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadBookmarks_withPagination_setsHasMore() async {
        let (sut, mock) = makeSUT()
        let posts = [Self.makeAPIPost(id: "b1")]
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: posts, hasMore: true, nextCursor: "cursor-2"))

        await sut.loadBookmarks()

        XCTAssertTrue(sut.hasMore)
        XCTAssertEqual(sut.posts.count, 1)
    }

    func test_loadBookmarks_noPagination_setsHasMoreFalse() async {
        let (sut, mock) = makeSUT()
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: []))

        await sut.loadBookmarks()

        XCTAssertFalse(sut.hasMore)
    }

    // MARK: - removeBookmark

    func test_removeBookmark_success_removesFromList() async {
        let (sut, mock) = makeSUT()
        let posts = [Self.makeAPIPost(id: "b1"), Self.makeAPIPost(id: "b2")]
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: posts))
        await sut.loadBookmarks()

        await sut.removeBookmark("b1")

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].id, "b2")
        XCTAssertEqual(mock.removeBookmarkCallCount, 1)
        XCTAssertEqual(mock.lastRemoveBookmarkPostId, "b1")
    }

    func test_removeBookmark_error_rollsBack() async {
        let (sut, mock) = makeSUT()
        let posts = [Self.makeAPIPost(id: "b1"), Self.makeAPIPost(id: "b2")]
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: posts))
        await sut.loadBookmarks()

        mock.removeBookmarkResult = .failure(NSError(domain: "test", code: 500))
        await sut.removeBookmark("b1")

        XCTAssertEqual(sut.posts.count, 2)
        XCTAssertEqual(sut.posts[0].id, "b1")
    }

    // MARK: - refresh

    func test_refresh_resetsPaginationAndReloads() async {
        let (sut, mock) = makeSUT()
        let posts = [Self.makeAPIPost(id: "b1")]
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: posts))
        await sut.loadBookmarks()
        XCTAssertEqual(sut.posts.count, 1)

        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: [Self.makeAPIPost(id: "b2")]))
        await sut.refresh()

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].id, "b2")
    }
}
