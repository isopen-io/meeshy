import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

@MainActor
final class PostDetailViewModelTests: XCTestCase {

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.feed.invalidate(for: "p1")
        await CacheCoordinator.shared.comments.invalidate(for: "post-p1")
    }

    // MARK: - Factory

    private func makeSUT(
        postService: MockPostService = MockPostService(),
        preferredLanguages: [String] = [],
        offlineQueue: OfflineQueueing = OfflineQueue.shared
    ) -> (sut: PostDetailViewModel, postService: MockPostService) {
        let languageProvider = MockLanguageProvider(preferredLanguages: preferredLanguages)
        let sut = PostDetailViewModel(
            postService: postService,
            languageProvider: languageProvider,
            offlineQueue: offlineQueue
        )
        return (sut, postService)
    }

    private static func makeAPIPost(id: String = "post-1", content: String = "Hello") -> APIPost {
        JSONStub.decode("""
        {"id":"\(id)","type":"POST","content":"\(content)","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
    }

    private static let stubComment: APIPostComment = JSONStub.decode("""
    {"id":"c1","content":"Nice post","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
    """)

    private static func makePaginatedComments(
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

    // MARK: - loadPost

    func test_loadPost_success_setsPost() async {
        let (sut, mock) = makeSUT()
        let apiPost = Self.makeAPIPost(id: "p1", content: "Test")
        mock.getPostResult = .success(apiPost)

        await sut.loadPost("p1")

        XCTAssertNotNil(sut.post)
        XCTAssertEqual(sut.post?.id, "p1")
        XCTAssertEqual(mock.getPostCallCount, 1)
    }

    func test_loadPost_error_setsError() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .failure(NSError(domain: "test", code: 404, userInfo: [NSLocalizedDescriptionKey: "Not found"]))

        await sut.loadPost("p1")

        XCTAssertNotNil(sut.error)
        XCTAssertNil(sut.post)
    }

    // MARK: - loadComments

    func test_loadComments_success_populatesComments() async {
        let (sut, mock) = makeSUT()
        let comment: APIPostComment = JSONStub.decode("""
        {"id":"c1","content":"Nice","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
        mock.getCommentsResult = .success(Self.makePaginatedComments(comments: [comment]))

        await sut.loadComments("p1")

        XCTAssertEqual(sut.comments.count, 1)
        XCTAssertEqual(sut.comments[0].id, "c1")
        XCTAssertEqual(mock.getCommentsCallCount, 1)
    }

    func test_loadComments_error_keepsEmptyComments() async {
        let (sut, mock) = makeSUT()
        mock.getCommentsResult = .failure(NSError(domain: "test", code: 500))

        await sut.loadComments("p1")

        XCTAssertTrue(sut.comments.isEmpty)
    }

    func test_loadComments_setsIsLoadingComments() async {
        let (sut, mock) = makeSUT()
        mock.getCommentsResult = .success(Self.makePaginatedComments(comments: []))

        XCTAssertFalse(sut.isLoadingComments)
        await sut.loadComments("p1")
        XCTAssertFalse(sut.isLoadingComments)
    }

    // MARK: - sendComment

    func test_sendComment_success_insertsOptimisticCommentAtTop() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        let apiPost = Self.makeAPIPost(id: "p1")
        mock.getPostResult = .success(apiPost)
        await sut.loadPost("p1")

        await sut.sendComment("New comment")

        // sendComment inserts an optimistic comment carrying a `cmid` id and
        // enqueues a createComment outbox op; the authoritative server id
        // arrives later via the `comment:added` socket broadcast.
        XCTAssertEqual(sut.comments.count, 1)
        XCTAssertEqual(sut.comments[0].content, "New comment")
        XCTAssertTrue(sut.comments[0].id.hasPrefix("cmid"))
        XCTAssertEqual(queue.enqueueCalls.count, 1)
    }

    func test_sendComment_outboxRefuses_rollsBackOptimisticInsert() async {
        let queue = MockOfflineQueue()
        queue.enqueueResult = .failure(NSError(domain: "test", code: 500))
        let (sut, mock) = makeSUT(offlineQueue: queue)
        let apiPost = Self.makeAPIPost(id: "p1")
        mock.getPostResult = .success(apiPost)
        await sut.loadPost("p1")

        await sut.sendComment("Failing comment")

        XCTAssertTrue(sut.comments.isEmpty)
    }

    // MARK: - likePost

    func test_likePost_togglesLikeState() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        let apiPost = Self.makeAPIPost(id: "p1")
        mock.getPostResult = .success(apiPost)
        await sut.loadPost("p1")

        let initialLikes = sut.post?.likes ?? 0
        await sut.likePost()

        XCTAssertEqual(sut.post?.isLiked, true)
        XCTAssertEqual(sut.post?.likes, initialLikes + 1)
        XCTAssertEqual(queue.enqueueCalls.count, 1)
    }

    func test_likePost_outboxRefuses_rollsBack() async {
        let queue = MockOfflineQueue()
        queue.enqueueResult = .failure(NSError(domain: "test", code: 500))
        let (sut, mock) = makeSUT(offlineQueue: queue)
        let apiPost = Self.makeAPIPost(id: "p1")
        mock.getPostResult = .success(apiPost)
        await sut.loadPost("p1")
        let initialLikes = sut.post?.likes ?? 0

        await sut.likePost()

        XCTAssertEqual(sut.post?.isLiked, false)
        XCTAssertEqual(sut.post?.likes, initialLikes)
    }

    // MARK: - topLevelComments

    func test_topLevelComments_filtersParentComments() async {
        let (sut, mock) = makeSUT()
        let comments: [APIPostComment] = [
            JSONStub.decode("""
            {"id":"c1","content":"Top","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
            """),
            JSONStub.decode("""
            {"id":"c2","content":"Reply","parentId":"c1","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a2","username":"bob"}}
            """)
        ]
        mock.getCommentsResult = .success(Self.makePaginatedComments(comments: comments))

        await sut.loadComments("p1")

        XCTAssertEqual(sut.topLevelComments.count, 1)
        XCTAssertEqual(sut.topLevelComments[0].id, "c1")
    }

    // MARK: - resolveCommentTranslation

    func test_resolveCommentTranslation_matchesPreferred_returnsTranslation() {
        let entry: APIPostTranslationEntry = JSONStub.decode("""
        {"text":"Bonjour","translationModel":null,"confidenceScore":null}
        """)
        let translations: [String: APIPostTranslationEntry] = ["fr": entry]

        let result = PostDetailViewModel.resolveCommentTranslation(
            translations: translations, originalLanguage: "en", preferredLanguages: ["fr"]
        )

        XCTAssertEqual(result, "Bonjour")
    }

    func test_resolveCommentTranslation_originalMatchesPreferred_returnsNil() {
        let entry: APIPostTranslationEntry = JSONStub.decode("""
        {"text":"Bonjour","translationModel":null,"confidenceScore":null}
        """)
        let translations: [String: APIPostTranslationEntry] = ["fr": entry]

        let result = PostDetailViewModel.resolveCommentTranslation(
            translations: translations, originalLanguage: "fr", preferredLanguages: ["fr"]
        )

        XCTAssertNil(result)
    }

    func test_resolveCommentTranslation_noTranslations_returnsNil() {
        let result = PostDetailViewModel.resolveCommentTranslation(
            translations: nil, originalLanguage: "en", preferredLanguages: ["fr"]
        )

        XCTAssertNil(result)
    }

    // MARK: - LanguageProviding DI

    /// `userLanguage` must come from the injected provider, not from
    /// `AuthManager.shared`. Without DI this test would be flaky because
    /// other suites pollute the singleton with their own `currentUser`.
    func test_userLanguage_usesInjectedLanguageProvider() {
        let (sut, _) = makeSUT(preferredLanguages: ["es", "pt"])

        XCTAssertEqual(sut.userLanguage, "es")
        XCTAssertEqual(sut.preferredLanguages, ["es", "pt"])
    }

    /// Empty preferred-languages list falls back to `"en"` (matches the
    /// FeedViewModel contract).
    func test_userLanguage_emptyProvider_fallsBackToEnglish() {
        let (sut, _) = makeSUT(preferredLanguages: [])

        XCTAssertEqual(sut.userLanguage, "en")
    }
}
