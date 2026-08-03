import XCTest
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class HashtagResultsViewModelTests: XCTestCase {
    private static func makeAPIPost(id: String = "post-1", content: String = "#paris") -> APIPost {
        JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "POST",
            "content": "\(content)",
            "createdAt": "2026-01-15T12:00:00.000Z",
            "likeCount": 0,
            "commentCount": 0,
            "author": {"id": "author-1", "username": "alice"}
        }
        """)
    }

    private static func makePaginatedResponse(
        posts: [APIPost] = [],
        hasMore: Bool = false,
        nextCursor: String? = nil
    ) -> PaginatedAPIResponse<[APIPost]> {
        let cursorJSON: String
        if let cursor = nextCursor {
            cursorJSON = #"{"nextCursor":"\#(cursor)","hasMore":\#(hasMore),"limit":20}"#
        } else if hasMore {
            cursorJSON = #"{"nextCursor":"cursor-next","hasMore":true,"limit":20}"#
        } else {
            cursorJSON = "null"
        }
        let postsJSON: String
        if posts.isEmpty {
            postsJSON = "[]"
        } else {
            let items = posts.map { p in
                #"{"id":"\#(p.id)","type":"\#(p.type ?? "POST")","content":"\#(p.content ?? "")","createdAt":"2026-01-15T12:00:00.000Z","likeCount":\#(p.likeCount ?? 0),"commentCount":\#(p.commentCount ?? 0),"author":{"id":"\#(p.author.id)","username":"\#(p.author.username ?? "user")"}}"#
            }
            postsJSON = "[\(items.joined(separator: ","))]"
        }
        return JSONStub.decode(#"{"success":true,"data":\#(postsJSON),"pagination":\#(cursorJSON),"error":null}"#)
    }

    func test_load_populatesPostsFromService() async {
        let service = MockPostService()
        let post = Self.makeAPIPost(id: "p1")
        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(posts: [post]))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)

        await sut.load()

        XCTAssertEqual(sut.posts.map(\.id), ["p1"])
        XCTAssertEqual(service.getPostsByHashtagCallCount, 1)
    }

    func test_load_setsIsLoadingFalseAfterCompletion() async {
        let service = MockPostService()
        let sut = HashtagResultsViewModel(tag: "paris", service: service)

        await sut.load()

        XCTAssertFalse(sut.isLoading)
    }

    func test_load_serviceThrows_leavesPostsEmpty_doesNotCrash() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .failure(URLError(.notConnectedToInternet))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)

        await sut.load()

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadMore_appendsToExistingPosts_usingReturnedCursor() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(
            posts: [Self.makeAPIPost(id: "p1")], hasMore: true, nextCursor: "20"))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)
        await sut.load()

        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p2")]))
        await sut.loadMore()

        XCTAssertEqual(sut.posts.map(\.id), ["p1", "p2"])
    }

    func test_loadMore_whenNoMorePages_doesNotCallServiceAgain() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1")], hasMore: false))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)
        await sut.load()

        await sut.loadMore()

        XCTAssertEqual(service.getPostsByHashtagCallCount, 1)
    }
}
