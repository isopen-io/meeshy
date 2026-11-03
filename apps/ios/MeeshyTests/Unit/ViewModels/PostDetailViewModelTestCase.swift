import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

/// Fixtures partagées des suites de `PostDetailViewModel` : la fabrique du
/// modèle de vue, des posts, des commentaires et des événements socket.
@MainActor
class PostDetailViewModelTestCase: XCTestCase {
    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.feed.invalidate(for: "p1")
        await CacheCoordinator.shared.comments.invalidate(for: "post-p1")
    }

    // MARK: - Factory

    func makeSUT(
        postService: MockPostService = MockPostService(),
        preferredLanguages: [String] = [],
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        socialSocket: MockSocialSocket = MockSocialSocket()
    ) -> (sut: PostDetailViewModel, postService: MockPostService) {
        let languageProvider = MockLanguageProvider(preferredLanguages: preferredLanguages)
        let sut = PostDetailViewModel(
            postService: postService,
            languageProvider: languageProvider,
            offlineQueue: offlineQueue,
            socialSocket: socialSocket
        )
        return (sut, postService)
    }

    static func makeAPIPost(id: String = "post-1", content: String = "Hello") -> APIPost {
        JSONStub.decode("""
        {"id":"\(id)","type":"POST","content":"\(content)","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
    }

    static let stubComment: APIPostComment = JSONStub.decode("""
    {"id":"c1","content":"Nice post","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
    """)

    static func makePaginatedComments(
        comments: [APIPostComment],
        hasMore: Bool = false,
        nextCursor: String? = nil
    ) -> PaginatedAPIResponse<[APIPostComment]> {
        let cursorJSON: String
        if let cursor = nextCursor {
            cursorJSON = """
            {"nextCursor":"\(cursor)","hasMore":\(hasMore),"limit":20}
            """
        } else {
            cursorJSON = "null"
        }
        let commentsJSON = comments.map { c in
            let parentField = c.parentId.map { ",\"parentId\":\"\($0)\"" } ?? ""
            return """
            {"id":"\(c.id)","content":"\(c.content)","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"\(c.author.id)","username":"\(c.author.username ?? "user")"}\(parentField)}
            """
        }
        return JSONStub.decode("""
        {"success":true,"data":[\(commentsJSON.joined(separator: ","))],"pagination":\(cursorJSON),"error":null}
        """)
    }

    // MARK: - loadCommentsUntilPresent (chasse paginée — commentaire notifié)

    static func makeAPIComment(id: String) -> APIPostComment {
        JSONStub.decode("""
        {"id":"\(id)","content":"c-\(id)","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
    }

    // MARK: - Replies pagination (fil de réponses > 20 — endpoint paginé ASC)

    static func makeAPIReply(id: String, parentId: String) -> APIPostComment {
        JSONStub.decode("""
        {"id":"\(id)","content":"r-\(id)","parentId":"\(parentId)","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
    }

    // MARK: - likePost: write-through vers la clé cache détail (stores-09)

    /// Polls the detail cache key until the fire-and-forget patch task lands
    /// (or 1 s elapses) — a fixed sleep would flake under CI load.
    func waitForCachedLikes(
        key: String,
        expected: Int
    ) async -> FeedPost? {
        var cached: FeedPost?
        for _ in 0..<50 {
            let result = await CacheCoordinator.shared.feed.load(for: key)
            cached = result.snapshot()?.first(where: { $0.id == key })
            if cached?.likes == expected { break }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        return cached
    }

    /// Polls the mock's continuation dict until the fire-and-forget observer
    /// Task has registered its `outcomeStream` continuation for `cmid`. Times
    /// out after 500 ms (50 × 10 ms).
    func waitForContinuation(
        in queue: MockOfflineQueue,
        for cmid: String
    ) async throws {
        for _ in 0..<50 {
            if queue.outcomeContinuations[cmid] != nil { return }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("Observer continuation never registered for cmid=\(cmid)")
    }

    // MARK: - Fabriques d'événements socket

    //
    // `SocketPostLikedData` / `SocketPostUnlikedData` sont `Decodable` sans init
    // public : leur init memberwise est internal au SDK. On les construit donc
    // par décodage, comme le reste des stubs de ce fichier.

    static func makeLiked(postId: String, userId: String, likeCount: Int) -> SocketPostLikedData {
        JSONStub.decode("""
        {"postId":"\(postId)","userId":"\(userId)","emoji":"\u{2764}\u{FE0F}","likeCount":\(likeCount),"reactionSummary":{}}
        """)
    }

    static func makeUnliked(postId: String, userId: String, likeCount: Int) -> SocketPostUnlikedData {
        JSONStub.decode("""
        {"postId":"\(postId)","userId":"\(userId)","likeCount":\(likeCount),"reactionSummary":{}}
        """)
    }

    // MARK: - L2c/F1 — une mutation reçue À DISTANCE doit réécrire sa clé de cache

    static func makeCommentDeleted(postId: String, commentId: String, commentCount: Int) -> SocketCommentDeletedData {
        JSONStub.decode("""
        {"postId":"\(postId)","commentId":"\(commentId)","commentCount":\(commentCount)}
        """)
    }

    static func makeCommentMediaUpdated(postId: String, commentId: String, parentId: String? = nil) -> SocketCommentMediaUpdatedData {
        let parent = parentId.map { "\"parentId\":\"\($0)\"," } ?? ""
        return JSONStub.decode("""
        {"postId":"\(postId)","commentId":"\(commentId)","comment":{"id":"\(commentId)",\(parent)"content":"","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"},"media":[{"id":"m1","fileUrl":"https://cdn/audio.m4a","mimeType":"audio/m4a","transcription":{"text":"salut","language":"fr"}}]}}
        """)
    }

    /// Poll la clé de cache : la réécriture part dans un `Task` détaché du
    /// sink, donc invisible à un simple `await Task.yield()`.
    func cachedComments(
        _ key: String,
        timeout: TimeInterval = 5.0,
        until predicate: ([FeedComment]) -> Bool
    ) async -> [FeedComment] {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let snapshot = await CacheCoordinator.shared.comments.load(for: key).snapshot(), predicate(snapshot) {
                return snapshot
            }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return await CacheCoordinator.shared.comments.load(for: key).snapshot() ?? []
    }
}
