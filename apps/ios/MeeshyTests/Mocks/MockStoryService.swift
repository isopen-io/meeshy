import Foundation
import MeeshySDK
import XCTest

final class MockStoryService: StoryServiceProviding, @unchecked Sendable {

    // MARK: - Stubbing

    var listResult: Result<PaginatedAPIResponse<[APIPost]>, Error> = .success(
        JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
    )
    /// Pages servies dans l'ordre, une par appel à `list`. Prioritaire sur
    /// `listResult` tant qu'elle n'est pas épuisée.
    var listResults: [Result<PaginatedAPIResponse<[APIPost]>, Error>] = []
    var markViewedResult: Result<Void, Error> = .success(())
    var deleteResult: Result<Void, Error> = .success(())
    var reactResult: Result<Void, Error> = .success(())
    var commentResult: Result<APIPostComment, Error> = .success(
        JSONStub.decode("""
        {"id":"comment-stub","content":"stub","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
        """)
    )
    var repostResult: Result<Void, Error> = .success(())
    var cachedPostResult: APIPost?
    var fetchPostResult: Result<APIPost, Error> = .success(
        JSONStub.decode("""
        {"id":"post-stub","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
        """)
    )

    // MARK: - Call Tracking

    var listCallCount = 0
    /// Curseur reçu à CHAQUE appel, dans l'ordre — `lastListCursor` seul ne peut
    /// pas dire si la pagination a bien enchaîné les bons curseurs.
    var listCursors: [String?] = []
    var lastListCursor: String?
    var lastListLimit: Int?
    var lastListUpdatedSince: Date?

    var markViewedCallCount = 0
    var lastMarkViewedStoryId: String?

    var deleteCallCount = 0
    var lastDeleteStoryId: String?

    var reactCallCount = 0
    var lastReactStoryId: String?
    var lastReactEmoji: String?

    var commentCallCount = 0
    var lastCommentStoryId: String?
    var lastCommentContent: String?

    var repostCallCount = 0
    var lastRepostStoryId: String?

    var cachedPostCallCount = 0
    var lastCachedPostId: String?

    var fetchPostCallCount = 0
    var lastFetchPostId: String?

    var cacheCallCount = 0
    var lastCachedPost: APIPost?

    // MARK: - Protocol Conformance

    func list(cursor: String?, limit: Int, updatedSince: Date?) async throws -> PaginatedAPIResponse<[APIPost]> {
        listCallCount += 1
        lastListCursor = cursor
        lastListLimit = limit
        lastListUpdatedSince = updatedSince
        listCursors.append(cursor)
        // File de pages : le tray suit `nextCursor` tant que le serveur annonce
        // `hasMore`, donc un témoin de pagination doit pouvoir répondre
        // DIFFÉREMMENT à chaque appel. Vide → `listResult`, inchangé pour les
        // témoins mono-page.
        if !listResults.isEmpty {
            return try listResults.removeFirst().get()
        }
        return try listResult.get()
    }

    func markViewed(storyId: String) async throws {
        markViewedCallCount += 1
        lastMarkViewedStoryId = storyId
        try markViewedResult.get()
    }

    func delete(storyId: String) async throws {
        deleteCallCount += 1
        lastDeleteStoryId = storyId
        try deleteResult.get()
    }

    func react(storyId: String, emoji: String) async throws {
        reactCallCount += 1
        lastReactStoryId = storyId
        lastReactEmoji = emoji
        try reactResult.get()
    }

    func comment(storyId: String, content: String) async throws -> APIPostComment {
        commentCallCount += 1
        lastCommentStoryId = storyId
        lastCommentContent = content
        return try commentResult.get()
    }

    func repost(storyId: String) async throws {
        repostCallCount += 1
        lastRepostStoryId = storyId
        try repostResult.get()
    }

    var listMineResult: Result<PaginatedAPIResponse<[APIPost]>, Error> = .success(JSONStub.decode("""
    {"success":true,"data":[],"pagination":null,"error":null}
    """))
    var listMineCallCount = 0
    var lastListMineCursor: String?

    func listMine(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        listMineCallCount += 1
        lastListMineCursor = cursor
        return try listMineResult.get()
    }

    var republishResult: Result<APIPost, Error> = .failure(NSError(domain: "MockStoryService", code: 0))
    var republishCallCount = 0
    var lastRepublishStoryId: String?

    func republish(storyId: String) async throws -> APIPost {
        republishCallCount += 1
        lastRepublishStoryId = storyId
        return try republishResult.get()
    }

    func cachedPost(id: String) -> APIPost? {
        cachedPostCallCount += 1
        lastCachedPostId = id
        return cachedPostResult
    }

    func fetchPost(id: String) async throws -> APIPost {
        fetchPostCallCount += 1
        lastFetchPostId = id
        return try fetchPostResult.get()
    }

    func cache(post: APIPost) {
        cacheCallCount += 1
        lastCachedPost = post
    }

    private(set) var invalidatedPostIds: Set<String> = []

    func invalidate(postIds: Set<String>) {
        invalidatedPostIds.formUnion(postIds)
    }

    // MARK: - Reset

    func reset() {
        listResult = .success(JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """))
        listResults = []
        listCallCount = 0
        listCursors = []
        lastListCursor = nil
        lastListLimit = nil

        markViewedResult = .success(())
        markViewedCallCount = 0
        lastMarkViewedStoryId = nil

        deleteResult = .success(())
        deleteCallCount = 0
        lastDeleteStoryId = nil

        reactResult = .success(())
        reactCallCount = 0
        lastReactStoryId = nil
        lastReactEmoji = nil

        commentResult = .success(JSONStub.decode("""
        {"id":"comment-stub","content":"stub","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
        """))
        commentCallCount = 0
        lastCommentStoryId = nil
        lastCommentContent = nil

        repostResult = .success(())
        repostCallCount = 0
        lastRepostStoryId = nil

        cachedPostResult = nil
        cachedPostCallCount = 0
        lastCachedPostId = nil

        fetchPostResult = .success(JSONStub.decode("""
        {"id":"post-stub","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
        """))
        fetchPostCallCount = 0
        lastFetchPostId = nil

        cacheCallCount = 0
        lastCachedPost = nil
    }
}
