import Foundation
import MeeshySDK
import XCTest

private let emptyPaginatedPosts: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
{"success":true,"data":[],"pagination":null,"error":null}
""")

private let stubPost: APIPost = JSONStub.decode("""
{"id":"post-stub","type":"POST","content":"stub","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
""")

private let stubComment: APIPostComment = JSONStub.decode("""
{"id":"comment-stub","content":"stub","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
""")

@MainActor
final class MockPostService: PostServiceProviding {
    nonisolated init() {}

    // MARK: - Stubbing

    var getFeedResult: Result<PaginatedAPIResponse<[APIPost]>, Error> = .success(emptyPaginatedPosts)
    var createResult: Result<APIPost, Error> = .success(stubPost)
    var deleteResult: Result<Void, Error> = .success(())
    var likeResult: Result<Void, Error> = .success(())
    var unlikeResult: Result<Void, Error> = .success(())
    var bookmarkResult: Result<Void, Error> = .success(())
    var addCommentResult: Result<APIPostComment, Error> = .success(stubComment)
    var likeCommentResult: Result<Void, Error> = .success(())
    var repostResult: Result<Void, Error> = .success(())
    var shareResult: Result<Void, Error> = .success(())
    var createStoryResult: Result<APIPost, Error> = .success(stubPost)
    var createWithTypeResult: Result<APIPost, Error> = .success(stubPost)

    // MARK: - Call Tracking

    var getFeedCallCount = 0
    var lastGetFeedCursor: String?
    var lastGetFeedLimit: Int?

    var createCallCount = 0
    var lastCreateContent: String?
    var lastCreateType: String?

    var deleteCallCount = 0
    var lastDeletePostId: String?

    var likeCallCount = 0
    var lastLikePostId: String?

    var unlikeCallCount = 0
    var lastUnlikePostId: String?

    var bookmarkCallCount = 0
    var lastBookmarkPostId: String?

    var addCommentCallCount = 0
    var lastAddCommentPostId: String?
    var lastAddCommentContent: String?
    var lastAddCommentParentId: String?

    var likeCommentCallCount = 0
    var lastLikeCommentPostId: String?
    var lastLikeCommentCommentId: String?

    var repostCallCount = 0
    var lastRepostPostId: String?
    var lastRepostQuote: String?

    var shareCallCount = 0
    var lastSharePostId: String?

    var createStoryCallCount = 0
    var lastCreateStoryContent: String?

    var createWithTypeCallCount = 0
    var lastCreateWithTypeType: PostType?

    var updateCallCount = 0
    var lastUpdatePostId: String?

    var viewPostCallCount = 0
    var lastViewPostId: String?

    var getPostViewsCallCount = 0
    var getUserPostsCallCount = 0
    var getCommentRepliesCallCount = 0
    var getCommunityPostsCallCount = 0

    // MARK: - Protocol Conformance

    func getFeed(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getFeedCallCount += 1
        lastGetFeedCursor = cursor
        lastGetFeedLimit = limit
        return try getFeedResult.get()
    }

    func create(content: String?, type: String, visibility: String, moodEmoji: String?,
                mediaIds: [String]?, audioUrl: String?, audioDuration: Int?,
                mobileTranscription: MobileTranscriptionPayload?) async throws -> APIPost {
        createCallCount += 1
        lastCreateContent = content
        lastCreateType = type
        return try createResult.get()
    }

    func delete(postId: String) async throws {
        deleteCallCount += 1
        lastDeletePostId = postId
        try deleteResult.get()
    }

    func like(postId: String) async throws {
        likeCallCount += 1
        lastLikePostId = postId
        try likeResult.get()
    }

    func unlike(postId: String) async throws {
        unlikeCallCount += 1
        lastUnlikePostId = postId
        try unlikeResult.get()
    }

    func bookmark(postId: String) async throws {
        bookmarkCallCount += 1
        lastBookmarkPostId = postId
        try bookmarkResult.get()
    }

    func addComment(postId: String, content: String, parentId: String?) async throws -> APIPostComment {
        addCommentCallCount += 1
        lastAddCommentPostId = postId
        lastAddCommentContent = content
        lastAddCommentParentId = parentId
        return try addCommentResult.get()
    }

    func likeComment(postId: String, commentId: String) async throws {
        likeCommentCallCount += 1
        lastLikeCommentPostId = postId
        lastLikeCommentCommentId = commentId
        try likeCommentResult.get()
    }

    func repost(postId: String, quote: String?) async throws {
        repostCallCount += 1
        lastRepostPostId = postId
        lastRepostQuote = quote
        try repostResult.get()
    }

    func share(postId: String) async throws {
        shareCallCount += 1
        lastSharePostId = postId
        try shareResult.get()
    }

    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String,
                     mediaIds: [String]?) async throws -> APIPost {
        createStoryCallCount += 1
        lastCreateStoryContent = content
        return try createStoryResult.get()
    }

    func createWithType(_ type: PostType, content: String, visibility: String,
                        moodEmoji: String?, storyEffects: StoryEffects?) async throws -> APIPost {
        createWithTypeCallCount += 1
        lastCreateWithTypeType = type
        return try createWithTypeResult.get()
    }

    func requestTranslation(postId: String, targetLanguage: String) async throws {}

    func pinPost(postId: String) async throws {}

    func unpinPost(postId: String) async throws {}

    func update(postId: String, content: String?, visibility: String?, moodEmoji: String?) async throws -> APIPost {
        updateCallCount += 1
        lastUpdatePostId = postId
        return try createResult.get()
    }

    func viewPost(postId: String, duration: Int?) async throws {
        viewPostCallCount += 1
        lastViewPostId = postId
    }

    func getPostViews(postId: String, limit: Int, offset: Int) async throws -> PostViewersResponse {
        getPostViewsCallCount += 1
        return PostViewersResponse(items: [], pagination: PostViewersPagination(total: 0, offset: 0, limit: limit, hasMore: false))
    }

    func getUserPosts(userId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getUserPostsCallCount += 1
        return try getFeedResult.get()
    }

    func getCommentReplies(postId: String, commentId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]> {
        getCommentRepliesCallCount += 1
        return JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
    }

    func getCommunityPosts(communityId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getCommunityPostsCallCount += 1
        return try getFeedResult.get()
    }

    // MARK: - Reset

    func reset() {
        getFeedResult = .success(emptyPaginatedPosts)
        getFeedCallCount = 0
        lastGetFeedCursor = nil
        lastGetFeedLimit = nil

        createResult = .success(stubPost)
        createCallCount = 0
        lastCreateContent = nil
        lastCreateType = nil

        deleteResult = .success(())
        deleteCallCount = 0
        lastDeletePostId = nil

        likeResult = .success(())
        likeCallCount = 0
        lastLikePostId = nil

        unlikeResult = .success(())
        unlikeCallCount = 0
        lastUnlikePostId = nil

        bookmarkResult = .success(())
        bookmarkCallCount = 0
        lastBookmarkPostId = nil

        addCommentResult = .success(stubComment)
        addCommentCallCount = 0
        lastAddCommentPostId = nil
        lastAddCommentContent = nil
        lastAddCommentParentId = nil

        likeCommentResult = .success(())
        likeCommentCallCount = 0
        lastLikeCommentPostId = nil
        lastLikeCommentCommentId = nil

        repostResult = .success(())
        repostCallCount = 0
        lastRepostPostId = nil
        lastRepostQuote = nil

        shareResult = .success(())
        shareCallCount = 0
        lastSharePostId = nil

        createStoryResult = .success(stubPost)
        createStoryCallCount = 0
        lastCreateStoryContent = nil

        createWithTypeResult = .success(stubPost)
        createWithTypeCallCount = 0
        lastCreateWithTypeType = nil

        updateCallCount = 0
        lastUpdatePostId = nil
        viewPostCallCount = 0
        lastViewPostId = nil
        getPostViewsCallCount = 0
        getUserPostsCallCount = 0
        getCommentRepliesCallCount = 0
        getCommunityPostsCallCount = 0
    }
}
